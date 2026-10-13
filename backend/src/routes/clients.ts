import { Router, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { EntityStatus, PaymentTermsTrigger } from '@prisma/client';
import { prisma } from '../config/database';
import {
  authenticate,
  requirePermission,
  AuthenticatedRequest,
} from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const clientsRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPagination(pageStr: unknown, limitStr: unknown) {
  const page = Math.max(1, parseInt(String(pageStr || '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(limitStr || '50'), 10) || 50));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function handleValidation(req: AuthenticatedRequest, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET / — list clients ─────────────────────────────────────────────────────

clientsRouter.get(
  '/',
  authenticate,
  [
    query('status').optional().isIn(Object.values(EntityStatus)),
    query('search').optional().isString().trim(),
    query('isDemo').optional().isBoolean(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
      const status = req.query.status as EntityStatus | undefined;
      const search = req.query.search as string | undefined;
      const isDemo =
        req.query.isDemo !== undefined ? req.query.isDemo === 'true' : undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (isDemo !== undefined) where.isDemo = isDemo;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { clientCode: { contains: search, mode: 'insensitive' } },
          { billingContactName: { contains: search, mode: 'insensitive' } },
          { billingContactEmail: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            clientCode: true,
            name: true,
            billingContactName: true,
            billingContactEmail: true,
            paymentTermsDays: true,
            paymentTermsTrigger: true,
            currency: true,
            status: true,
            isDemo: true,
            createdAt: true,
            _count: { select: { sites: true } },
          },
        }),
        prisma.client.count({ where }),
      ]);

      const data = clients.map((c) => ({
        ...c,
        siteCount: c._count.sites,
        _count: undefined,
      }));

      res.json({
        data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id — single client ─────────────────────────────────────────────────

clientsRouter.get(
  '/:id',
  authenticate,
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const client = await prisma.client.findUnique({
        where: { id: req.params.id },
        include: {
          _count: { select: { sites: true, invoices: true } },
          paymentTermsOverride: {
            orderBy: { effectiveFrom: 'desc' },
            take: 5,
          },
        },
      });

      if (!client) throw createError('Client not found.', 404);

      res.json({ data: client });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / — create client ───────────────────────────────────────────────────

clientsRouter.post(
  '/',
  authenticate,
  requirePermission('CLIENT_MANAGE'),
  [
    body('clientCode').isString().trim().notEmpty().withMessage('clientCode is required.'),
    body('name').isString().trim().notEmpty().withMessage('name is required.'),
    body('billingAddress').optional().isString().trim(),
    body('gstin').optional().isString().trim(),
    body('billingContactName').optional().isString().trim(),
    body('billingContactEmail').optional().isEmail().normalizeEmail(),
    body('paymentTermsDays').optional().isInt({ min: 0 }),
    body('paymentTermsTrigger')
      .optional()
      .isIn(Object.values(PaymentTermsTrigger))
      .withMessage('Invalid paymentTermsTrigger value.'),
    body('currency').optional().isString().trim().isLength({ min: 3, max: 3 }),
    body('remarks').optional().isString().trim(),
    body('isDemo').optional().isBoolean(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { clientCode } = req.body;

      const existing = await prisma.client.findUnique({ where: { clientCode } });
      if (existing) throw createError(`Client code '${clientCode}' already exists.`, 409);

      const client = await prisma.client.create({
        data: {
          clientCode,
          name: req.body.name,
          billingAddress: req.body.billingAddress,
          gstin: req.body.gstin,
          billingContactName: req.body.billingContactName,
          billingContactEmail: req.body.billingContactEmail,
          paymentTermsDays: req.body.paymentTermsDays ?? 30,
          paymentTermsTrigger:
            req.body.paymentTermsTrigger ?? PaymentTermsTrigger.SUBMISSION_DATE,
          currency: req.body.currency ?? 'INR',
          remarks: req.body.remarks,
          isDemo: req.body.isDemo ?? false,
          createdById: req.user!.id,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'CREATE',
        recordType: 'Client',
        recordId: client.id,
        newValues: client,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: client });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id — update client ─────────────────────────────────────────────────

clientsRouter.put(
  '/:id',
  authenticate,
  requirePermission('CLIENT_MANAGE'),
  [
    param('id').isUUID(),
    body('name').optional().isString().trim().notEmpty(),
    body('billingAddress').optional().isString().trim(),
    body('gstin').optional().isString().trim(),
    body('billingContactName').optional().isString().trim(),
    body('billingContactEmail').optional().isEmail().normalizeEmail(),
    body('paymentTermsDays').optional().isInt({ min: 0 }),
    body('paymentTermsTrigger').optional().isIn(Object.values(PaymentTermsTrigger)),
    body('currency').optional().isString().trim().isLength({ min: 3, max: 3 }),
    body('remarks').optional().isString().trim(),
    body('isDemo').optional().isBoolean(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const client = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!client) throw createError('Client not found.', 404);

      const {
        name,
        billingAddress,
        gstin,
        billingContactName,
        billingContactEmail,
        paymentTermsDays,
        paymentTermsTrigger,
        currency,
        remarks,
        isDemo,
      } = req.body;

      const updated = await prisma.client.update({
        where: { id: client.id },
        data: {
          ...(name !== undefined && { name }),
          ...(billingAddress !== undefined && { billingAddress }),
          ...(gstin !== undefined && { gstin }),
          ...(billingContactName !== undefined && { billingContactName }),
          ...(billingContactEmail !== undefined && { billingContactEmail }),
          ...(paymentTermsDays !== undefined && { paymentTermsDays }),
          ...(paymentTermsTrigger !== undefined && { paymentTermsTrigger }),
          ...(currency !== undefined && { currency }),
          ...(remarks !== undefined && { remarks }),
          ...(isDemo !== undefined && { isDemo }),
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'Client',
        recordId: client.id,
        previousValues: client,
        newValues: updated,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id/status — activate / deactivate ────────────────────────────────

clientsRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('CLIENT_MANAGE'),
  [
    param('id').isUUID(),
    body('status')
      .isIn(Object.values(EntityStatus))
      .withMessage('Invalid status value.'),
    body('reason').optional().isString().trim(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const client = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!client) throw createError('Client not found.', 404);

      // Block physical-delete path: check if invoices exist before status change to INACTIVE
      if (req.body.status !== EntityStatus.ACTIVE) {
        const invoiceCount = await prisma.invoice.count({
          where: { clientId: client.id },
        });
        if (invoiceCount > 0 && req.body.status === 'DELETE') {
          throw createError('Cannot delete client with existing invoices.', 409);
        }
      }

      const previousStatus = client.status;
      const updated = await prisma.client.update({
        where: { id: client.id },
        data: { status: req.body.status },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        recordType: 'Client',
        recordId: client.id,
        previousValues: { status: previousStatus },
        newValues: { status: req.body.status },
        changeReason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/sites — sites for client ───────────────────────────────────────

clientsRouter.get(
  '/:id/sites',
  authenticate,
  [
    param('id').isUUID(),
    query('status').optional().isIn(Object.values(EntityStatus)),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const client = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!client) throw createError('Client not found.', 404);

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
      const status = req.query.status as EntityStatus | undefined;

      const where: Record<string, unknown> = { clientId: client.id };
      if (status) where.status = status;

      const [sites, total] = await Promise.all([
        prisma.site.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            region: { select: { id: true, name: true, regionCode: true } },
          },
        }),
        prisma.site.count({ where }),
      ]);

      res.json({
        data: sites,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/invoices — recent invoices summary ──────────────────────────────

clientsRouter.get(
  '/:id/invoices',
  authenticate,
  [
    param('id').isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('status').optional().isString(),
    query('financialYear').optional().isString(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const client = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!client) throw createError('Client not found.', 404);

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);

      const where: Record<string, unknown> = { clientId: client.id };
      if (req.query.status) where.status = req.query.status;
      if (req.query.financialYear) where.financialYear = req.query.financialYear;

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            billingMonth: true,
            financialYear: true,
            amountExGst: true,
            gstAmount: true,
            totalAmount: true,
            totalReceived: true,
            outstandingAmount: true,
            currency: true,
            status: true,
            dueDate: true,
            invoiceDate: true,
            site: { select: { id: true, name: true, siteCode: true } },
            region: { select: { id: true, name: true, regionCode: true } },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      res.json({
        data: invoices,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);
