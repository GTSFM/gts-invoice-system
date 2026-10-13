import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { UserRole } from '@prisma/client';

export const settingsRouter = Router();

// GET /api/settings
settingsRouter.get('/', authenticate, async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    // Redact sensitive secrets if any
    const sanitized = settings.map(s => ({
      ...s,
      value: s.key.includes('SECRET') || s.key.includes('KEY') || s.key.includes('PASS')
        ? '********'
        : s.value,
    }));
    res.json({ data: sanitized });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/:key
settingsRouter.put(
  '/:key',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;

      if (value === undefined) {
        res.status(400).json({ error: 'Setting value is required.' });
        return;
      }

      const existing = await prisma.systemSetting.findUnique({ where: { key } });

      const updated = await prisma.systemSetting.upsert({
        where: { key },
        create: {
          key,
          value: String(value),
          description: description || null,
          updatedById: req.user?.id,
        },
        update: {
          value: String(value),
          ...(description !== undefined && { description }),
          updatedById: req.user?.id,
        },
      });

      await auditLog({
        userId: req.user?.id,
        action: 'UPDATE',
        recordType: 'SYSTEM_SETTING',
        recordId: key,
        previousValues: existing ? { value: existing.value } : undefined,
        newValues: { value: String(value) },
        changeReason: req.body.reason || 'Settings updated by administrator',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/settings/notification-rules
settingsRouter.get(
  '/notification-rules',
  authenticate,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rules = await prisma.notificationRule.findMany({
        orderBy: { name: 'asc' },
      });
      res.json({ data: rules });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/settings/notification-rules
settingsRouter.post(
  '/notification-rules',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, triggerEvent, channel, recipientRoles, customRecipients, templateSubject, templateBody, frequencyHours, escalationAfterDays, escalationRecipient } = req.body;
      const rule = await prisma.notificationRule.create({
        data: {
          name,
          triggerEvent,
          channel: channel || 'BOTH',
          recipientRoles: recipientRoles || [],
          customRecipients: customRecipients || [],
          templateSubject,
          templateBody,
          frequencyHours: frequencyHours ? Number(frequencyHours) : null,
          escalationAfterDays: escalationAfterDays ? Number(escalationAfterDays) : null,
          escalationRecipient,
          createdById: req.user?.id,
        },
      });

      await auditLog({
        userId: req.user?.id,
        action: 'CREATE',
        recordType: 'NOTIFICATION_RULE',
        recordId: rule.id,
        newValues: { name, triggerEvent },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/settings/notification-rules/:id
settingsRouter.put(
  '/notification-rules/:id',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await prisma.notificationRule.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: 'Notification rule not found.' });
        return;
      }

      const updated = await prisma.notificationRule.update({
        where: { id },
        data: req.body,
      });

      await auditLog({
        userId: req.user?.id,
        action: 'UPDATE',
        recordType: 'NOTIFICATION_RULE',
        recordId: id,
        previousValues: existing as any,
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/settings/notification-rules/:id/toggle
settingsRouter.patch(
  '/notification-rules/:id/toggle',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await prisma.notificationRule.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: 'Notification rule not found.' });
        return;
      }

      const updated = await prisma.notificationRule.update({
        where: { id },
        data: { isActive: !existing.isActive },
      });

      await auditLog({
        userId: req.user?.id,
        action: 'UPDATE',
        recordType: 'NOTIFICATION_RULE',
        recordId: id,
        newValues: { isActive: updated.isActive },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);
