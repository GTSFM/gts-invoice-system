import { Router, Response, NextFunction } from 'express';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const invoicesRouter = Router();

// ---------------------------------------------------------------------------
// Status transition map
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  PROJECTION_PENDING: ['BILLING_INPUT_PENDING' as InvoiceStatus],
  BILLING_INPUT_PENDING: ['DRAFT' as InvoiceStatus],
  DRAFT: ['DOCUMENTS_PENDING', 'BILLING_INPUT_PENDING', 'INTERNAL_REVIEW', 'CANCELLED'] as InvoiceStatus[],
  DOCUMENTS_PENDING: ['DRAFT', 'INTERNAL_REVIEW', 'CANCELLED'] as InvoiceStatus[],
  INTERNAL_REVIEW: ['APPROVED_FOR_SUBMISSION', 'DRAFT', 'CANCELLED', 'ON_HOLD'] as InvoiceStatus[],
  APPROVED_FOR_SUBMISSION: ['READY_FOR_SUBMISSION', 'CANCELLED', 'ON_HOLD'] as InvoiceStatus[],
  READY_FOR_SUBMISSION: ['SUBMITTED_TO_CLIENT', 'CANCELLED'] as InvoiceStatus[],
  SUBMITTED_TO_CLIENT: ['ACKNOWLEDGEMENT_PENDING', 'DISPUTED', 'ON_HOLD'] as InvoiceStatus[],
  ACKNOWLEDGEMENT_PENDING: ['ACKNOWLEDGED', 'DISPUTED'] as InvoiceStatus[],
  ACKNOWLEDGED: ['PARTIALLY_PAID', 'PAID', 'DISPUTED'] as InvoiceStatus[],
  DISPUTED: ['INTERNAL_REVIEW', 'ACKNOWLEDGED', 'CANCELLED', 'ON_HOLD'] as InvoiceStatus[],
  PARTIALLY_PAID: ['PAID'] as InvoiceStatus[],
  PAID: [] as InvoiceStatus[],
  CANCELLED: [] as InvoiceStatus[],
  ON_HOLD: ['DRAFT', 'CANCELLED'] as InvoiceStatus[],
};

// Transitions requiring INVOICE_APPROVE permission (vs INVOICE_SUBMIT)
const APPROVE_PERMISSION_TRANSITIONS: InvoiceStatus[] = [
  'APPROVED_FOR_SUBMISSION',
  'READY_FOR_SUBMISSION',
] as InvoiceStatus[];

// ---------------------------------------------------------------------------
// Helper: compute due date based on paymentTermsTrigger
// ---------------------------------------------------------------------------
function computeDueDate(
  paymentTermsDays: number | null,
  paymentTermsTrigger: string | null,
  submissionDate: Date | null,
  acknowledgementDate: Date | null,
): Date | null {
  if (!paymentTermsDays || !paymentTermsTrigger) return null;

  let baseDate: Date | null = null;
  if (paymentTermsTrigger === 'SUBMISSION_DATE') baseDate = submissionDate;
  else if (paymentTermsTrigger === 'ACKNOWLEDGEMENT_DATE') baseDate = acknowledgementDate;

  if (!baseDate) return null;
  const due = new Date(baseDate);
  due.setDate(due.getDate() + paymentTermsDays);
  return due;
}

// ---------------------------------------------------------------------------
// Helper: variance from linked projection
// ---------------------------------------------------------------------------
function computeVariance(
  projected: Decimal | null,
  actual: Decimal | null,
): { variance: number | null; variancePct: number | null; varianceStatus: string } {
  if (!projected || !actual)
    return { variance: null, variancePct: null, varianceStatus: 'PENDING' };
  const p = Number(projected);
  const a = Number(actual);
  const variance = a - p;
  const variancePct = p === 0 ? null : (variance / p) * 100;
  const varianceStatus =
    variance < 0 ? 'UNDERBILLING' : variance > 0 ? 'OVERBILLING' : 'ON_TARGET';
  return { variance, variancePct, varianceStatus };
}

// ---------------------------------------------------------------------------
// GET /invoices — paginated list with filters + variance
// ---------------------------------------------------------------------------
invoicesRouter.get(
  '/',
  authenticate,
  requirePermission('INVOICE_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        clientId,
        regionId,
        siteId,
        status,
        financialYear,
        billingMonth,
        dueDateFrom,
        dueDateTo,
        overdue,
        search,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * pageSize;

      const where: Prisma.InvoiceWhereInput = {};
      if (clientId) where.clientId = clientId;
      if (regionId) where.regionId = regionId;
      if (siteId) where.siteId = siteId;
      if (status && Object.keys(ALLOWED_TRANSITIONS).includes(status))
        where.status = status as InvoiceStatus;
      if (financialYear) where.financialYear = financialYear;
      if (billingMonth) where.billingMonth = billingMonth;
      if (dueDateFrom || dueDateTo) {
        where.dueDate = {};
        if (dueDateFrom) (where.dueDate as Prisma.DateTimeFilter).gte = new Date(dueDateFrom);
        if (dueDateTo) (where.dueDate as Prisma.DateTimeFilter).lte = new Date(dueDateTo);
      }
      if (overdue === 'true') {
        where.dueDate = { lt: new Date() };
        where.status = { notIn: ['PAID', 'CANCELLED'] as InvoiceStatus[] };
      }
      if (search) where.invoiceNumber = { contains: search, mode: 'insensitive' };
      where.isCancelled = false;

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { invoiceDate: 'desc' },
          include: {
            projection: { select: { projectedAmountExGst: true } },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      const data = invoices.map((inv) => {
        const projected = (inv as any).projection?.projectedAmountExGst ?? null;
        const varianceData = computeVariance(projected, inv.amountExGst);
        return { ...inv, ...varianceData };
      });

      res.json({
        data,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /invoices/summary — aggregated KPIs
// ---------------------------------------------------------------------------
invoicesRouter.get(
  '/summary',
  authenticate,
  requirePermission('INVOICE_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, regionId, financialYear, billingMonth } = req.query as Record<string, string>;

      const where: Prisma.InvoiceWhereInput = { isCancelled: false };
      if (clientId) where.clientId = clientId;
      if (regionId) where.regionId = regionId;
      if (financialYear) where.financialYear = financialYear;
      if (billingMonth) where.billingMonth = billingMonth;

      const [totalInvoices, aggTotals, overdueCount] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.aggregate({
          where,
          _sum: { totalAmount: true, outstandingAmount: true },
        }),
        prisma.invoice.count({
          where: {
            ...where,
            dueDate: { lt: new Date() },
            status: { notIn: ['PAID', 'CANCELLED'] as InvoiceStatus[] },
          },
        }),
      ]);

      res.json({
        data: {
          totalInvoices,
          totalAmount: aggTotals._sum.totalAmount ?? 0,
          totalOutstanding: aggTotals._sum.outstandingAmount ?? 0,
          overdueCount,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /invoices/:id — full detail
// ---------------------------------------------------------------------------
invoicesRouter.get(
  '/:id',
  authenticate,
  requirePermission('INVOICE_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          documents: { where: { isDeleted: false } },
          submissionEvents: { orderBy: { eventDate: 'desc' } },
          projection: {
            select: {
              projectedAmountExGst: true,
              projectedGst: true,
              projectedTotal: true,
              isApproved: true,
            },
          },
        },
      });

      if (!invoice) return next(createError(404, 'Invoice not found'));

      const projected = (invoice as any).projection?.projectedAmountExGst ?? null;
      const varianceData = computeVariance(projected, invoice.amountExGst);

      res.json({ data: { ...invoice, ...varianceData } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /invoices — create
// ---------------------------------------------------------------------------
invoicesRouter.post(
  '/',
  authenticate,
  requirePermission('INVOICE_CREATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        invoiceNumber,
        clientId,
        regionId,
        siteId,
        contractId,
        projectionId,
        financialYear,
        billingMonth,
        invoiceDate,
        billingPeriodStart,
        billingPeriodEnd,
        amountExGst,
        gstAmount,
        currency,
        submissionTargetDate,
        paymentTermsDays,
        paymentTermsTrigger,
        remarks,
      } = req.body;

      // Required fields
      if (!invoiceNumber || !clientId || !siteId || !billingMonth || !financialYear) {
        return next(createError(400, 'invoiceNumber, clientId, siteId, billingMonth, financialYear are required'));
      }

      // Validate site active
      const site = await prisma.site.findFirst({ where: { id: siteId, status: 'ACTIVE' } });
      if (!site) return next(createError(404, 'Site not found or inactive'));

      // Duplicate invoiceNumber within clientId
      const duplicate = await prisma.invoice.findFirst({
        where: { invoiceNumber, clientId, isCancelled: false },
      });
      if (duplicate) {
        return next(createError(409, `Invoice number ${invoiceNumber} already exists for this client`));
      }

      // Validate projectionId if provided
      if (projectionId) {
        const proj = await prisma.billingProjection.findUnique({ where: { id: projectionId } });
        if (!proj) return next(createError(404, 'Linked projection not found'));
        if (proj.billingMonth !== billingMonth) {
          return next(createError(400, 'Projection billingMonth does not match invoice billingMonth'));
        }
      }

      const amtExGst = new Decimal(amountExGst ?? 0);
      const gst = new Decimal(gstAmount ?? 0);
      const total = amtExGst.plus(gst);

      // Calculate initial dueDate if data available
      const dueDate = computeDueDate(paymentTermsDays ?? null, paymentTermsTrigger ?? null, null, null);

      let invoice;
      try {
        invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            clientId,
            regionId,
            siteId,
            contractId: contractId ?? null,
            projectionId: projectionId ?? null,
            financialYear,
            billingMonth,
            invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
            billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : null,
            billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : null,
            amountExGst: amtExGst,
            gstAmount: gst,
            totalAmount: total,
            currency: currency ?? 'AUD',
            status: 'DRAFT',
            preparedById: req.user!.id,
            submissionTargetDate: submissionTargetDate ? new Date(submissionTargetDate) : null,
            paymentTermsDays: paymentTermsDays ?? null,
            paymentTermsTrigger: paymentTermsTrigger ?? null,
            dueDate,
            outstandingAmount: total,
            totalReceived: new Decimal(0),
            isCancelled: false,
            remarks: remarks ?? null,
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          return next(createError(409, 'Invoice number must be unique for this client'));
        }
        throw err;
      }

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_CREATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        newValues: { invoiceNumber, clientId, siteId, billingMonth, totalAmount: total, status: 'DRAFT' },
      });

      res.status(201).json({ data: invoice });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /invoices/:id — update (DRAFT / DOCUMENTS_PENDING only)
// ---------------------------------------------------------------------------
invoicesRouter.put(
  '/:id',
  authenticate,
  requirePermission('INVOICE_EDIT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const existing = await prisma.invoice.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Invoice not found'));

      const editableStatuses: InvoiceStatus[] = ['DRAFT', 'DOCUMENTS_PENDING'] as InvoiceStatus[];
      if (!editableStatuses.includes(existing.status)) {
        return next(
          createError(400, `Invoice cannot be edited in status ${existing.status}. Must be DRAFT or DOCUMENTS_PENDING`),
        );
      }

      const {
        invoiceDate,
        billingPeriodStart,
        billingPeriodEnd,
        amountExGst,
        gstAmount,
        currency,
        submissionTargetDate,
        paymentTermsDays,
        paymentTermsTrigger,
        contractId,
        remarks,
      } = req.body;

      const newAmtExGst = amountExGst !== undefined ? new Decimal(amountExGst) : (existing.amountExGst ?? new Decimal(0));
      const newGst = gstAmount !== undefined ? new Decimal(gstAmount) : (existing.gstAmount ?? new Decimal(0));
      const newTotal = (newAmtExGst ?? new Decimal(0)).plus(newGst ?? 0);
      const newOutstanding = newTotal.minus(existing.totalReceived ?? 0);

      const newPaymentTermsDays = paymentTermsDays ?? existing.paymentTermsDays;
      const newTrigger = paymentTermsTrigger ?? existing.paymentTermsTrigger;
      const newSubDate = submissionTargetDate
        ? new Date(submissionTargetDate)
        : existing.submissionTargetDate;

      const dueDate = computeDueDate(
        newPaymentTermsDays,
        newTrigger,
        existing.actualSubmissionDate,
        existing.clientAcknowledgementDate,
      );

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          invoiceDate: invoiceDate ? new Date(invoiceDate) : existing.invoiceDate,
          billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : existing.billingPeriodStart,
          billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : existing.billingPeriodEnd,
          amountExGst: newAmtExGst,
          gstAmount: newGst,
          totalAmount: newTotal,
          outstandingAmount: newOutstanding,
          currency: currency ?? existing.currency,
          submissionTargetDate: newSubDate,
          paymentTermsDays: newPaymentTermsDays,
          paymentTermsTrigger: newTrigger,
          dueDate,
          contractId: contractId !== undefined ? contractId : existing.contractId,
          remarks: remarks !== undefined ? remarks : existing.remarks,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_UPDATE',
        entityType: 'Invoice',
        entityId: id,
        previousValues: { amountExGst: existing.amountExGst, totalAmount: existing.totalAmount },
        newValues: { amountExGst: newAmtExGst, totalAmount: newTotal },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /invoices/:id/status — transition with validation
// ---------------------------------------------------------------------------
invoicesRouter.patch(
  '/:id/status',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status: newStatus, cancellationReason, notes } = req.body;

      if (!newStatus) return next(createError(400, '"status" is required'));

      const existing = await prisma.invoice.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Invoice not found'));

      // Validate transition
      const allowedNext = ALLOWED_TRANSITIONS[existing.status] ?? [];
      if (!allowedNext.includes(newStatus as InvoiceStatus)) {
        return next(
          createError(
            400,
            `Invalid transition: ${existing.status} → ${newStatus}. Allowed: [${allowedNext.join(', ')}]`,
          ),
        );
      }

      // Role/Permission check based on target status
      if (req.user?.role !== 'SUPER_ADMIN') {
        const requiredPerm = APPROVE_PERMISSION_TRANSITIONS.includes(newStatus as InvoiceStatus)
          ? 'INVOICE_APPROVE'
          : 'INVOICE_SUBMIT';
        
        const permission = await prisma.permission.findUnique({ where: { code: requiredPerm } });
        if (permission) {
          const grant = await prisma.rolePermission.findUnique({
            where: { role_permissionId: { role: req.user!.role, permissionId: permission.id } },
          });
          if (!grant?.granted) {
            return next(createError(403, `Permission ${requiredPerm} is required for this transition`));
          }
        }
      }

      const updateData: Prisma.InvoiceUpdateInput = { status: newStatus as InvoiceStatus };
      let submissionEventData: { eventType: string; eventDate: Date; referenceNumber?: string } | null = null;

      // SUBMITTED_TO_CLIENT requirements
      if (newStatus === 'SUBMITTED_TO_CLIENT') {
        const { actualSubmissionDate, submissionChannel, submissionReference } = req.body;
        if (!actualSubmissionDate) {
          return next(createError(400, 'actualSubmissionDate is required when submitting to client'));
        }
        const subDate = new Date(actualSubmissionDate);
        updateData.actualSubmissionDate = subDate;
        updateData.submissionChannel = submissionChannel ?? existing.submissionChannel;
        updateData.submissionReference = submissionReference ?? null;

        // Recalculate dueDate if trigger = SUBMISSION_DATE
        const dueDate = computeDueDate(
          existing.paymentTermsDays,
          existing.paymentTermsTrigger,
          subDate,
          existing.clientAcknowledgementDate,
        );
        if (dueDate) updateData.dueDate = dueDate;

        submissionEventData = {
          eventType: 'SUBMITTED',
          eventDate: subDate,
          referenceNumber: submissionReference,
        };
      }

      // CANCELLED requirements
      if (newStatus === 'CANCELLED') {
        if (!cancellationReason) {
          return next(createError(400, 'cancellationReason is required when cancelling an invoice'));
        }
        updateData.isCancelled = true;
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = cancellationReason;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.update({ where: { id }, data: updateData });

        if (submissionEventData) {
          await tx.invoiceSubmissionEvent.create({
            data: {
              invoiceId: id,
              eventType: submissionEventData.eventType,
              eventDate: submissionEventData.eventDate,
              submittedById: req.user!.id,
              referenceNumber: submissionEventData.referenceNumber ?? null,
              notes: notes ?? null,
            },
          });
        }

        return inv;
      });

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_STATUS_CHANGE',
        entityType: 'Invoice',
        entityId: id,
        previousValues: { status: existing.status },
        newValues: { status: newStatus, cancellationReason: cancellationReason ?? undefined },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /invoices/:id/submit — shortcut submit
// ---------------------------------------------------------------------------
invoicesRouter.patch(
  '/:id/submit',
  authenticate,
  requirePermission('INVOICE_SUBMIT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { submissionDate, submissionChannel, submissionReference, notes } = req.body;

      if (!submissionDate || !submissionChannel) {
        return next(createError(400, 'submissionDate and submissionChannel are required'));
      }

      const existing = await prisma.invoice.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Invoice not found'));

      const allowedForSubmit: InvoiceStatus[] = ['READY_FOR_SUBMISSION'] as InvoiceStatus[];
      if (!allowedForSubmit.includes(existing.status)) {
        return next(createError(400, `Invoice must be in READY_FOR_SUBMISSION status to submit. Current: ${existing.status}`));
      }

      const subDate = new Date(submissionDate);
      const dueDate = computeDueDate(
        existing.paymentTermsDays,
        existing.paymentTermsTrigger,
        subDate,
        existing.clientAcknowledgementDate,
      );

      const updated = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.update({
          where: { id },
          data: {
            status: 'SUBMITTED_TO_CLIENT',
            actualSubmissionDate: subDate,
            submissionChannel,
            submissionReference: submissionReference ?? null,
            dueDate,
          },
        });

        await tx.invoiceSubmissionEvent.create({
          data: {
            invoiceId: id,
            eventType: 'SUBMITTED',
            eventDate: subDate,
            submittedById: req.user!.id,
            referenceNumber: submissionReference ?? null,
            notes: notes ?? null,
          },
        });

        return inv;
      });

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_SUBMITTED',
        entityType: 'Invoice',
        entityId: id,
        previousValues: { status: existing.status },
        newValues: { status: 'SUBMITTED_TO_CLIENT', submissionDate, submissionChannel },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /invoices/:id/acknowledge — set acknowledgement date + recalc dueDate
// ---------------------------------------------------------------------------
invoicesRouter.patch(
  '/:id/acknowledge',
  authenticate,
  requirePermission('INVOICE_SUBMIT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { clientAcknowledgementDate } = req.body;

      if (!clientAcknowledgementDate) {
        return next(createError(400, 'clientAcknowledgementDate is required'));
      }

      const existing = await prisma.invoice.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Invoice not found'));

      const allowedForAck: InvoiceStatus[] = [
        'SUBMITTED_TO_CLIENT',
        'ACKNOWLEDGEMENT_PENDING',
      ] as InvoiceStatus[];
      if (!allowedForAck.includes(existing.status)) {
        return next(createError(400, `Invoice must be in SUBMITTED_TO_CLIENT or ACKNOWLEDGEMENT_PENDING to acknowledge`));
      }

      const ackDate = new Date(clientAcknowledgementDate);
      const dueDate = computeDueDate(
        existing.paymentTermsDays,
        existing.paymentTermsTrigger,
        existing.actualSubmissionDate,
        ackDate,
      );

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          clientAcknowledgementDate: ackDate,
          status: 'ACKNOWLEDGED',
          dueDate: dueDate ?? existing.dueDate,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_ACKNOWLEDGED',
        entityType: 'Invoice',
        entityId: id,
        previousValues: { status: existing.status },
        newValues: { status: 'ACKNOWLEDGED', clientAcknowledgementDate: ackDate, dueDate },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /invoices/:id/documents — upload document metadata
// ---------------------------------------------------------------------------
invoicesRouter.post(
  '/:id/documents',
  authenticate,
  requirePermission('INVOICE_EDIT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { fileName, fileUrl, fileSize, mimeType, storageProvider, storageKey, documentType } = req.body;

      if (!fileName || !fileUrl) {
        return next(createError(400, 'fileName and fileUrl are required'));
      }

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) return next(createError(404, 'Invoice not found'));
      if (invoice.isCancelled) return next(createError(400, 'Cannot add documents to a cancelled invoice'));

      // Max 10 documents per invoice
      const docCount = await prisma.invoiceDocument.count({ where: { invoiceId: id, isDeleted: false } });
      if (docCount >= 10) {
        return next(createError(400, 'Maximum of 10 documents allowed per invoice'));
      }

      const doc = await prisma.invoiceDocument.create({
        data: {
          invoiceId: id,
          fileName,
          fileUrl,
          fileSize: fileSize ?? null,
          mimeType: mimeType ?? null,
          storageProvider: storageProvider ?? null,
          storageKey: storageKey ?? null,
          documentType: documentType ?? null,
          uploadedById: req.user!.id,
          isDeleted: false,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_DOCUMENT_UPLOAD',
        entityType: 'InvoiceDocument',
        entityId: doc.id,
        newValues: { invoiceId: id, fileName, documentType },
      });

      res.status(201).json({ data: doc });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /invoices/:id/documents — list non-deleted documents
// ---------------------------------------------------------------------------
invoicesRouter.get(
  '/:id/documents',
  authenticate,
  requirePermission('INVOICE_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
      if (!invoice) return next(createError(404, 'Invoice not found'));

      const documents = await prisma.invoiceDocument.findMany({
        where: { invoiceId: id, isDeleted: false },
        orderBy: { uploadedAt: 'desc' },
      });

      res.json({ data: documents, total: documents.length });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /invoices/:id/documents/:docId — soft delete
// ---------------------------------------------------------------------------
invoicesRouter.delete(
  '/:id/documents/:docId',
  authenticate,
  requirePermission('INVOICE_EDIT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, docId } = req.params;

      const doc = await prisma.invoiceDocument.findFirst({
        where: { id: docId, invoiceId: id, isDeleted: false },
      });
      if (!doc) return next(createError(404, 'Document not found'));

      await prisma.invoiceDocument.update({
        where: { id: docId },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'INVOICE_DOCUMENT_DELETE',
        entityType: 'InvoiceDocument',
        entityId: docId,
        newValues: { invoiceId: id, isDeleted: true, fileName: doc.fileName },
      });

      res.json({ message: 'Document deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /invoices/:id/submission-history — all submission events
// ---------------------------------------------------------------------------
invoicesRouter.get(
  '/:id/submission-history',
  authenticate,
  requirePermission('INVOICE_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
      if (!invoice) return next(createError(404, 'Invoice not found'));

      const events = await prisma.invoiceSubmissionEvent.findMany({
        where: { invoiceId: id },
        orderBy: { eventDate: 'desc' },
      });

      res.json({ data: events, total: events.length });
    } catch (err) {
      next(err);
    }
  },
);
