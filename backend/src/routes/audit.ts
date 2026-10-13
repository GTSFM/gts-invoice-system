import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { UserRole } from '@prisma/client';

export const auditRouter = Router();

// GET /api/audit
auditRouter.get(
  '/',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN, UserRole.MANAGEMENT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
      const skip = (page - 1) * limit;

      const { userId, action, recordType, recordId, dateFrom, dateTo } = req.query;

      const where: any = {};
      if (userId) where.userId = String(userId);
      if (action) where.action = String(action);
      if (recordType) where.recordType = String(recordType);
      if (recordId) where.recordId = String(recordId);

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
        if (dateTo) where.createdAt.lte = new Date(String(dateTo));
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        data: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/audit/:id
auditRouter.get(
  '/:id',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN, UserRole.MANAGEMENT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const log = await prisma.auditLog.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
      if (!log) {
        res.status(404).json({ error: 'Audit log not found.' });
        return;
      }
      res.json(log);
    } catch (err) {
      next(err);
    }
  }
);
