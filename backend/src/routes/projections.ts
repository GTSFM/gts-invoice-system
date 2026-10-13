import { Router, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const projectionsRouter = Router();

// ---------------------------------------------------------------------------
// Helper: variance computation
// ---------------------------------------------------------------------------
function computeVariance(
  projected: Decimal | null,
  actual: Decimal | null,
): { variance: number | null; variancePct: number | null; status: string } {
  if (!projected || !actual) return { variance: null, variancePct: null, status: 'PENDING' };
  const p = Number(projected);
  const a = Number(actual);
  const variance = a - p;
  const variancePct = p === 0 ? null : (variance / p) * 100;
  const status = variance < 0 ? 'UNDERBILLING' : variance > 0 ? 'OVERBILLING' : 'ON_TARGET';
  return { variance, variancePct, status };
}

// ---------------------------------------------------------------------------
// Helper: generate expected YYYY-MM months for a financial year
// Assumes FY = July–June (e.g. FY2024 → Jul-2023 … Jun-2024). Adjust if needed.
// ---------------------------------------------------------------------------
function getFYMonths(financialYear: string): string[] {
  const fyEnd = parseInt(financialYear, 10);
  if (isNaN(fyEnd)) return [];
  const months: string[] = [];
  for (let m = 7; m <= 12; m++) {
    months.push(`${fyEnd - 1}-${String(m).padStart(2, '0')}`);
  }
  for (let m = 1; m <= 6; m++) {
    months.push(`${fyEnd}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

// ---------------------------------------------------------------------------
// GET /projections — list with filters + variance
// ---------------------------------------------------------------------------
projectionsRouter.get(
  '/',
  authenticate,
  requirePermission('PROJECTION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        financialYear,
        billingMonth,
        clientId,
        regionId,
        siteId,
        hasMissingProjection,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * pageSize;

      const where: Record<string, unknown> = {};
      if (financialYear) where.financialYear = financialYear;
      if (billingMonth) where.billingMonth = billingMonth;
      if (clientId) where.clientId = clientId;
      if (regionId) where.regionId = regionId;
      if (siteId) where.siteId = siteId;

      const [projections, total] = await Promise.all([
        prisma.billingProjection.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ billingMonth: 'desc' }, { createdAt: 'desc' }],
          include: {
            invoices: {
              where: { isCancelled: false },
              select: { amountExGst: true, status: true },
              take: 1,
            },
          },
        }),
        prisma.billingProjection.count({ where }),
      ]);

      const data = projections.map((p) => {
        const invoice = (p as any).invoices?.[0] ?? null;
        const actualBilling: Decimal | null = invoice?.amountExGst ?? null;
        const varianceData = computeVariance(p.projectedAmountExGst, actualBilling);
        return {
          ...p,
          actualBilling,
          invoiceStatus: invoice?.status ?? null,
          ...varianceData,
        };
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
// GET /projections/missing — site+month combos with no projection
// ---------------------------------------------------------------------------
projectionsRouter.get(
  '/missing',
  authenticate,
  requirePermission('PROJECTION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { financialYear, clientId, regionId } = req.query as Record<string, string>;

      if (!financialYear) {
        return next(createError(400, 'financialYear is required'));
      }

      const expectedMonths = getFYMonths(financialYear);
      if (expectedMonths.length === 0) {
        return next(createError(400, 'Invalid financialYear format. Expected e.g. "2024".'));
      }

      // Fetch active sites
      const siteWhere: Record<string, unknown> = { status: 'ACTIVE' };
      if (clientId) siteWhere.clientId = clientId;
      if (regionId) siteWhere.regionId = regionId;

      const sites = await prisma.site.findMany({
        where: siteWhere as any,
        select: { id: true, name: true, siteCode: true, clientId: true, regionId: true },
      });

      // Fetch all projections for this FY
      const existingProjections = await prisma.billingProjection.findMany({
        where: {
          financialYear,
          siteId: { in: sites.map((s) => s.id) },
        },
        select: { siteId: true, billingMonth: true },
      });

      const existingSet = new Set(
        existingProjections.map((p) => `${p.siteId}__${p.billingMonth}`),
      );

      const missing: Array<{
        siteId: string;
        siteName: string;
        siteCode: string;
        clientId: string;
        regionId: string;
        billingMonth: string;
        financialYear: string;
      }> = [];

      for (const site of sites) {
        for (const month of expectedMonths) {
          const key = `${site.id}__${month}`;
          if (!existingSet.has(key)) {
            missing.push({
              siteId: site.id,
              siteName: (site as any).siteName,
              siteCode: (site as any).siteCode,
              clientId: site.clientId,
              regionId: site.regionId,
              billingMonth: month,
              financialYear,
            });
          }
        }
      }

      res.json({ data: missing, total: missing.length });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /projections/:id — detail with revision history
// ---------------------------------------------------------------------------
projectionsRouter.get(
  '/:id',
  authenticate,
  requirePermission('PROJECTION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const projection = await prisma.billingProjection.findUnique({
        where: { id },
        include: {
          revisions: { orderBy: { createdAt: 'desc' } },
          invoices: {
            where: { isCancelled: false },
            select: { id: true, invoiceNumber: true, amountExGst: true, status: true },
            take: 1,
          },
        },
      });

      if (!projection) return next(createError(404, 'Projection not found'));

      const invoice = (projection as any).invoices?.[0] ?? null;
      const actualBilling: Decimal | null = invoice?.amountExGst ?? null;
      const varianceData = computeVariance(projection.projectedAmountExGst, actualBilling);

      res.json({ data: { ...projection, actualBilling, invoiceStatus: invoice?.status ?? null, ...varianceData } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /projections — create
// ---------------------------------------------------------------------------
projectionsRouter.post(
  '/',
  authenticate,
  requirePermission('PROJECTION_CREATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        financialYear,
        billingMonth,
        clientId,
        regionId,
        siteId,
        contractReference,
        projectedAmountExGst,
        projectedGst,
        isZeroProjection,
        zeroReason,
        remarks,
      } = req.body;

      // Required fields
      if (!financialYear || !billingMonth || !siteId || !clientId) {
        return next(createError(400, 'financialYear, billingMonth, siteId, and clientId are required'));
      }

      // Validate billingMonth format YYYY-MM
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
        return next(createError(400, 'billingMonth must be in YYYY-MM format'));
      }

      // Zero projection requires zeroReason
      if (isZeroProjection && !zeroReason) {
        return next(createError(400, 'zeroReason is required when isZeroProjection is true'));
      }

      // Validate site exists and is active
      const site = await prisma.site.findFirst({ where: { id: siteId, status: 'ACTIVE' } });
      if (!site) return next(createError(404, 'Site not found or inactive'));

      const amtExGst = new Decimal(projectedAmountExGst ?? 0);
      const gst = new Decimal(projectedGst ?? 0);
      const total = amtExGst.plus(gst);

      let projection;
      try {
        projection = await prisma.billingProjection.create({
          data: {
            financialYear,
            billingMonth,
            clientId,
            regionId,
            siteId,
            contractReference,
            projectedAmountExGst: amtExGst,
            projectedGst: gst,
            projectedTotal: total,
            isZeroProjection: isZeroProjection ?? false,
            zeroReason: isZeroProjection ? zeroReason : null,
            isApproved: false,
            isLocked: false,
            remarks,
            createdById: req.user!.id,
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          return next(createError(409, `A projection already exists for site ${siteId} and month ${billingMonth}`));
        }
        throw err;
      }

      await auditLog({
        userId: req.user!.id,
        action: 'PROJECTION_CREATE',
        entityType: 'BillingProjection',
        entityId: projection.id,
        newValues: { financialYear, billingMonth, siteId, projectedAmountExGst: amtExGst, projectedTotal: total },
      });

      res.status(201).json({ data: projection });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /projections/:id — revise (transaction: create revision record + update)
// ---------------------------------------------------------------------------
projectionsRouter.put(
  '/:id',
  authenticate,
  requirePermission('PROJECTION_EDIT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        projectedAmountExGst,
        projectedGst,
        isZeroProjection,
        zeroReason,
        remarks,
        revisionReason,
        revisionReasonCode,
        contractReference,
      } = req.body;

      if (!revisionReason) {
        return next(createError(400, 'revisionReason is required to revise a projection'));
      }

      const existing = await prisma.billingProjection.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Projection not found'));
      if (existing.isLocked) return next(createError(400, 'Projection is locked and cannot be edited'));

      if (isZeroProjection && !zeroReason) {
        return next(createError(400, 'zeroReason is required when isZeroProjection is true'));
      }

      const newAmtExGst = new Decimal(projectedAmountExGst ?? existing.projectedAmountExGst);
      const newGst = new Decimal(projectedGst ?? existing.projectedGst ?? 0);
      const newTotal = newAmtExGst.plus(newGst);

      const [, updated] = await prisma.$transaction([
        // 1. Persist revision record
        prisma.projectionRevision.create({
          data: {
            projectionId: id,
            previousAmountExGst: existing.projectedAmountExGst,
            previousGst: existing.projectedGst,
            previousTotal: existing.projectedTotal,
            newAmountExGst: newAmtExGst,
            newGst: newGst,
            newTotal: newTotal,
            revisionReason,
            revisionReasonCode: revisionReasonCode ?? null,
            createdById: req.user!.id,
          },
        }),
        // 2. Update projection
        prisma.billingProjection.update({
          where: { id },
          data: {
            projectedAmountExGst: newAmtExGst,
            projectedGst: newGst,
            projectedTotal: newTotal,
            isZeroProjection: isZeroProjection ?? existing.isZeroProjection,
            zeroReason: isZeroProjection ? zeroReason : null,
            remarks: remarks ?? existing.remarks,
            contractReference: contractReference ?? existing.contractReference,
            lastRevisedById: req.user!.id,
            lastRevisedAt: new Date(),
          },
        }),
      ]);

      await auditLog({
        userId: req.user!.id,
        action: 'PROJECTION_REVISE',
        entityType: 'BillingProjection',
        entityId: id,
        previousValues: {
          projectedAmountExGst: existing.projectedAmountExGst,
          projectedGst: existing.projectedGst,
          projectedTotal: existing.projectedTotal,
        },
        newValues: {
          projectedAmountExGst: newAmtExGst,
          projectedGst: newGst,
          projectedTotal: newTotal,
          revisionReason,
        },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /projections/:id/lock — lock or unlock
// ---------------------------------------------------------------------------
projectionsRouter.patch(
  '/:id/lock',
  authenticate,
  requirePermission('PROJECTION_APPROVE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { lock } = req.body; // boolean

      if (typeof lock !== 'boolean') {
        return next(createError(400, '"lock" (boolean) is required in the request body'));
      }

      const existing = await prisma.billingProjection.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Projection not found'));

      const updated = await prisma.billingProjection.update({
        where: { id },
        data: { isLocked: lock },
      });

      await auditLog({
        userId: req.user!.id,
        action: lock ? 'PROJECTION_LOCK' : 'PROJECTION_UNLOCK',
        entityType: 'BillingProjection',
        entityId: id,
        newValues: { isLocked: lock },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /projections/:id/approve — approve projection
// ---------------------------------------------------------------------------
projectionsRouter.patch(
  '/:id/approve',
  authenticate,
  requirePermission('PROJECTION_APPROVE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const existing = await prisma.billingProjection.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Projection not found'));
      if (existing.isApproved) return next(createError(400, 'Projection is already approved'));

      const updated = await prisma.billingProjection.update({
        where: { id },
        data: { isApproved: true, approvedById: req.user!.id, approvedAt: new Date() },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'PROJECTION_APPROVE',
        entityType: 'BillingProjection',
        entityId: id,
        newValues: { isApproved: true },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /projections/:id/revisions — full revision history
// ---------------------------------------------------------------------------
projectionsRouter.get(
  '/:id/revisions',
  authenticate,
  requirePermission('PROJECTION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const projection = await prisma.billingProjection.findUnique({ where: { id }, select: { id: true } });
      if (!projection) return next(createError(404, 'Projection not found'));

      const revisions = await prisma.projectionRevision.findMany({
        where: { projectionId: id },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ data: revisions, total: revisions.length });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /projections/bulk-copy — copy all projections from one month to next
// ---------------------------------------------------------------------------
projectionsRouter.post(
  '/bulk-copy',
  authenticate,
  requirePermission('PROJECTION_CREATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { sourceMonth, targetMonth, confirmation } = req.body;

      if (!confirmation) {
        return next(createError(400, 'confirmation=true is required to perform bulk-copy'));
      }
      if (!sourceMonth || !targetMonth) {
        return next(createError(400, 'sourceMonth and targetMonth (YYYY-MM) are required'));
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(sourceMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
        return next(createError(400, 'sourceMonth and targetMonth must be in YYYY-MM format'));
      }
      if (sourceMonth === targetMonth) {
        return next(createError(400, 'sourceMonth and targetMonth must be different'));
      }

      // Derive target financialYear from targetMonth
      const [tyear, tmonth] = targetMonth.split('-').map(Number);
      const targetFinancialYear = tmonth >= 7 ? String(tyear + 1) : String(tyear);

      const sources = await prisma.billingProjection.findMany({
        where: { billingMonth: sourceMonth },
      });

      const existingTargets = await prisma.billingProjection.findMany({
        where: { billingMonth: targetMonth, siteId: { in: sources.map((s) => s.siteId) } },
        select: { siteId: true },
      });
      const existingSiteIds = new Set(existingTargets.map((e) => e.siteId));

      const toCreate = sources.filter((s) => !existingSiteIds.has(s.siteId));
      const skipped = sources.filter((s) => existingSiteIds.has(s.siteId)).map((s) => s.siteId);
      const copied: string[] = [];
      const failed: Array<{ siteId: string; error: string }> = [];

      for (const src of toCreate) {
        try {
          await prisma.billingProjection.create({
            data: {
              financialYear: targetFinancialYear,
              billingMonth: targetMonth,
              clientId: src.clientId,
              regionId: src.regionId,
              siteId: src.siteId,
              contractReference: src.contractReference,
              projectedAmountExGst: src.projectedAmountExGst,
              projectedGst: src.projectedGst,
              projectedTotal: src.projectedTotal,
              isZeroProjection: src.isZeroProjection,
              zeroReason: src.zeroReason,
              isApproved: false,
              isLocked: false,
              remarks: `Copied from ${sourceMonth}`,
              createdById: req.user!.id,
            },
          });
          copied.push(src.siteId);
        } catch (err: any) {
          if (err.code === 'P2002') {
            skipped.push(src.siteId); // Race condition — already existed
          } else {
            failed.push({ siteId: src.siteId, error: err.message });
          }
        }
      }

      await auditLog({
        userId: req.user!.id,
        action: 'PROJECTION_BULK_COPY',
        entityType: 'BillingProjection',
        entityId: 'bulk',
        newValues: { sourceMonth, targetMonth, copiedCount: copied.length, skippedCount: skipped.length },
      });

      res.json({
        summary: {
          sourceMonth,
          targetMonth,
          total: sources.length,
          copiedCount: copied.length,
          skippedCount: skipped.length,
          failedCount: failed.length,
        },
        copied,
        skipped,
        failed,
      });
    } catch (err) {
      next(err);
    }
  },
);
