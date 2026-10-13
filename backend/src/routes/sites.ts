import { Router, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { EntityStatus, InvoiceStatus, PaymentTermsTrigger } from '@prisma/client';
import { prisma } from '../config/database';
import {
  authenticate,
  requirePermission,
  AuthenticatedRequest,
} from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const sitesRouter = Router();

/** Statuses considered "active/open" for blocking deactivation */
const OPEN_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.PROJECTION_PENDING,
  InvoiceStatus.BILLING_INPUT_PENDING,
  InvoiceStatus.DRAFT,
  InvoiceStatus.DOCUMENTS_PENDING,
  InvoiceStatus.INTERNAL_REVIEW,
  InvoiceStatus.APPROVED_FOR_SUBMISSION,
  InvoiceStatus.READY_FOR_SUBMISSION,
  InvoiceStatus.SUBMITTED_TO_CLIENT,
  InvoiceStatus.ACKNOWLEDGEMENT_PENDING,
  InvoiceStatus.ACKNOWLEDGED,
  InvoiceStatus.DISPUTED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.ON_HOLD,
];

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

// ─── GET / — list sites ───────────────────────────────────────────────────────

sitesRouter.get(
  '/',
  authenticate,
  [
    query('clientId').optional().isUUID(),
    query('regionId').optional().isUUID(),
    query('status').optional().isIn(Object.values(EntityStatus)),
    query('search').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
      const { clientId, regionId, status, search } = req.query as Record<string, string | undefined>;

      const where: Record<string, unknown> = {};
      if (clientId) where.clientId = clientId;
      if (regionId) where.regionId = regionId;
      if (status) where.status = status as EntityStatus;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { siteCode: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
          { state: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [sites, total] = await Promise.all([
        prisma.site.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            client: { select: { id: true, name: true, clientCode: true } },
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

// ─── GET /:id — full site detail ──────────────────────────────────────────────

sitesRouter.get(
  '/:id',
  authenticate,
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const site = await prisma.site.findUnique({
        where: { id: req.params.id },
        include: {
          client: true,
          region: true,
          _count: {
            select: {
              projections: true,
              invoices: true,
              userAssignments: true,
            },
          },
        },
      });

      if (!site) throw createError('Site not found.', 404);

      // Active projections count (not locked)
      const activeProjectionCount = await prisma.billingProjection.count({
        where: { siteId: site.id, isLocked: false },
      });

      // Invoice summary: total, outstanding
      const invoiceSummary = await prisma.invoice.aggregate({
        where: { siteId: site.id, isCancelled: false },
        _count: { id: true },
        _sum: { totalAmount: true, totalReceived: true, outstandingAmount: true },
      });

      res.json({
        data: {
          ...site,
          activeProjectionCount,
          invoiceSummary: {
            count: invoiceSummary._count.id,
            totalAmount: invoiceSummary._sum.totalAmount?.toString() ?? '0',
            totalReceived: invoiceSummary._sum.totalReceived?.toString() ?? '0',
            outstandingAmount: invoiceSummary._sum.outstandingAmount?.toString() ?? '0',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / — create site ─────────────────────────────────────────────────────

sitesRouter.post(
  '/',
  authenticate,
  requirePermission('SITE_MANAGE'),
  [
    body('siteCode').isString().trim().notEmpty().withMessage('siteCode is required.'),
    body('name').isString().trim().notEmpty().withMessage('name is required.'),
    body('clientId').isUUID().withMessage('clientId must be a valid UUID.'),
    body('regionId').isUUID().withMessage('regionId must be a valid UUID.'),
    body('city').optional().isString().trim(),
    body('state').optional().isString().trim(),
    body('billingContactName').optional().isString().trim(),
    body('billingContactEmail').optional().isEmail().normalizeEmail(),
    body('regionalOpsOwner').optional().isString().trim(),
    body('billingOwner').optional().isString().trim(),
    body('paymentTermsDays').optional().isInt({ min: 0 }),
    body('paymentTermsTrigger').optional().isIn(Object.values(PaymentTermsTrigger)),
    body('gstTreatment').optional().isString().trim(),
    body('contractReference').optional().isString().trim(),
    body('contractStartDate').optional().isISO8601().toDate(),
    body('contractEndDate').optional().isISO8601().toDate(),
    body('monthlyProjectionBase').optional().isDecimal(),
    body('submissionTargetDay').optional().isInt({ min: 1, max: 31 }),
    body('submissionOffsetDays').optional().isInt(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { siteCode, clientId, regionId } = req.body;

      // Uniqueness check
      const existing = await prisma.site.findUnique({ where: { siteCode } });
      if (existing) throw createError(`Site code '${siteCode}' already exists.`, 409);

      // Validate FK existence
      const [client, region] = await Promise.all([
        prisma.client.findUnique({ where: { id: clientId } }),
        prisma.region.findUnique({ where: { id: regionId } }),
      ]);
      if (!client) throw createError('Client not found.', 404);
      if (!region) throw createError('Region not found.', 404);

      // Inherit payment terms from client if not specified
      const paymentTermsDays = req.body.paymentTermsDays ?? client.paymentTermsDays;
      const paymentTermsTrigger =
        req.body.paymentTermsTrigger ?? client.paymentTermsTrigger;

      const site = await prisma.site.create({
        data: {
          siteCode,
          name: req.body.name,
          clientId,
          regionId,
          city: req.body.city,
          state: req.body.state,
          billingContactName: req.body.billingContactName,
          billingContactEmail: req.body.billingContactEmail,
          regionalOpsOwner: req.body.regionalOpsOwner,
          billingOwner: req.body.billingOwner,
          paymentTermsDays,
          paymentTermsTrigger,
          gstTreatment: req.body.gstTreatment,
          contractReference: req.body.contractReference,
          contractStartDate: req.body.contractStartDate,
          contractEndDate: req.body.contractEndDate,
          monthlyProjectionBase: req.body.monthlyProjectionBase,
          submissionTargetDay: req.body.submissionTargetDay,
          submissionOffsetDays: req.body.submissionOffsetDays,
          createdById: req.user!.id,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'CREATE',
        recordType: 'Site',
        recordId: site.id,
        newValues: site,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: site });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id — update site ───────────────────────────────────────────────────

sitesRouter.put(
  '/:id',
  authenticate,
  requirePermission('SITE_MANAGE'),
  [
    param('id').isUUID(),
    body('name').optional().isString().trim().notEmpty(),
    body('city').optional().isString().trim(),
    body('state').optional().isString().trim(),
    body('billingContactName').optional().isString().trim(),
    body('billingContactEmail').optional().isEmail().normalizeEmail(),
    body('regionalOpsOwner').optional().isString().trim(),
    body('billingOwner').optional().isString().trim(),
    body('paymentTermsDays').optional().isInt({ min: 0 }),
    body('paymentTermsTrigger').optional().isIn(Object.values(PaymentTermsTrigger)),
    body('gstTreatment').optional().isString().trim(),
    body('contractReference').optional().isString().trim(),
    body('contractStartDate').optional().isISO8601().toDate(),
    body('contractEndDate').optional().isISO8601().toDate(),
    body('monthlyProjectionBase').optional().isDecimal(),
    body('submissionTargetDay').optional().isInt({ min: 1, max: 31 }),
    body('submissionOffsetDays').optional().isInt(),
    body('regionId').optional().isUUID(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const site = await prisma.site.findUnique({ where: { id: req.params.id } });
      if (!site) throw createError('Site not found.', 404);

      const {
        name, city, state, billingContactName, billingContactEmail,
        regionalOpsOwner, billingOwner, paymentTermsDays, paymentTermsTrigger,
        gstTreatment, contractReference, contractStartDate, contractEndDate,
        monthlyProjectionBase, submissionTargetDay, submissionOffsetDays, regionId,
      } = req.body;

      const updated = await prisma.site.update({
        where: { id: site.id },
        data: {
          ...(name !== undefined && { name }),
          ...(city !== undefined && { city }),
          ...(state !== undefined && { state }),
          ...(billingContactName !== undefined && { billingContactName }),
          ...(billingContactEmail !== undefined && { billingContactEmail }),
          ...(regionalOpsOwner !== undefined && { regionalOpsOwner }),
          ...(billingOwner !== undefined && { billingOwner }),
          ...(paymentTermsDays !== undefined && { paymentTermsDays }),
          ...(paymentTermsTrigger !== undefined && { paymentTermsTrigger }),
          ...(gstTreatment !== undefined && { gstTreatment }),
          ...(contractReference !== undefined && { contractReference }),
          ...(contractStartDate !== undefined && { contractStartDate }),
          ...(contractEndDate !== undefined && { contractEndDate }),
          ...(monthlyProjectionBase !== undefined && { monthlyProjectionBase }),
          ...(submissionTargetDay !== undefined && { submissionTargetDay }),
          ...(submissionOffsetDays !== undefined && { submissionOffsetDays }),
          ...(regionId !== undefined && { regionId }),
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'Site',
        recordId: site.id,
        previousValues: site,
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

// ─── PATCH /:id/status — activate / deactivate with confirmation ──────────────

sitesRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('SITE_MANAGE'),
  [
    param('id').isUUID(),
    body('status').isIn(Object.values(EntityStatus)).withMessage('Invalid status value.'),
    body('reason').optional().isString().trim(),
    // Set confirm=true to bypass active-invoice warning
    body('confirm').optional().isBoolean(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const site = await prisma.site.findUnique({ where: { id: req.params.id } });
      if (!site) throw createError('Site not found.', 404);

      const newStatus: EntityStatus = req.body.status;
      const confirm: boolean = req.body.confirm === true || req.body.confirm === 'true';

      // Warn if active (open) invoices exist and caller hasn't confirmed
      if (newStatus !== EntityStatus.ACTIVE && !confirm) {
        const openInvoices = await prisma.invoice.findMany({
          where: { siteId: site.id, status: { in: OPEN_INVOICE_STATUSES } },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            billingMonth: true,
            totalAmount: true,
            currency: true,
          },
        });
        if (openInvoices.length > 0) {
          res.status(409).json({
            error:
              'Site has active invoices. Pass confirm=true to proceed with deactivation.',
            openInvoices,
          });
          return;
        }
      }

      const previousStatus = site.status;
      const updated = await prisma.site.update({
        where: { id: site.id },
        data: { status: newStatus },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        recordType: 'Site',
        recordId: site.id,
        previousValues: { status: previousStatus },
        newValues: { status: newStatus },
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

// ─── GET /:id/projections — billing projections with optional month filter ────

sitesRouter.get(
  '/:id/projections',
  authenticate,
  [
    param('id').isUUID(),
    query('month').optional().matches(/^\d{4}-\d{2}$/),  // YYYY-MM
    query('financialYear').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const site = await prisma.site.findUnique({ where: { id: req.params.id } });
      if (!site) throw createError('Site not found.', 404);

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);

      const where: Record<string, unknown> = { siteId: site.id };
      if (req.query.month) where.billingMonth = req.query.month;
      if (req.query.financialYear) where.financialYear = req.query.financialYear;

      const [projections, total] = await Promise.all([
        prisma.billingProjection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { billingMonth: 'desc' },
          include: {
            revisions: { orderBy: { createdAt: 'desc' }, take: 3 },
          },
        }),
        prisma.billingProjection.count({ where }),
      ]);

      res.json({
        data: projections,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/invoices — invoices for site ────────────────────────────────────

sitesRouter.get(
  '/:id/invoices',
  authenticate,
  [
    param('id').isUUID(),
    query('status').optional().isString(),
    query('financialYear').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const site = await prisma.site.findUnique({ where: { id: req.params.id } });
      if (!site) throw createError('Site not found.', 404);

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);

      const where: Record<string, unknown> = { siteId: site.id };
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
            actualSubmissionDate: true,
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
