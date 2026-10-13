import { Router, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export type SubmissionStatus =
  | 'ON_TIME'
  | 'EARLY'
  | 'LATE'
  | 'DUE_SOON'
  | 'OVERDUE_NOT_SUBMITTED'
  | 'TARGET_NOT_CONFIGURED';

export const submissionRouter = Router();

// ---------------------------------------------------------------------------
// Default warning days if SystemSetting not found
// ---------------------------------------------------------------------------
const DEFAULT_WARNING_DAYS = 3;

// ---------------------------------------------------------------------------
// Helper: resolve warning days from SystemSetting table
// ---------------------------------------------------------------------------
async function getWarningDays(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'SUBMISSION_WARNING_DAYS' },
    });
    if (setting?.value) {
      const v = parseInt(setting.value as string, 10);
      return isNaN(v) ? DEFAULT_WARNING_DAYS : v;
    }
  } catch {
    // SystemSetting table may not exist yet in early migrations — degrade gracefully
  }
  return DEFAULT_WARNING_DAYS;
}

// ---------------------------------------------------------------------------
// Helper: classify submission status
// ---------------------------------------------------------------------------
function classifySubmission(
  targetDate: Date | null,
  actualDate: Date | null,
  warningDays: number,
): SubmissionStatus {
  if (!targetDate) return 'TARGET_NOT_CONFIGURED' as SubmissionStatus;
  const now = new Date();
  if (!actualDate) {
    if (now > targetDate) return 'OVERDUE_NOT_SUBMITTED' as SubmissionStatus;
    const warningThreshold = new Date(targetDate);
    warningThreshold.setDate(warningThreshold.getDate() - warningDays);
    if (now >= warningThreshold) return 'DUE_SOON' as SubmissionStatus;
    return 'TARGET_NOT_CONFIGURED' as SubmissionStatus; // before warning window, not yet due — show as scheduled
  }
  const diff = Math.floor(
    (actualDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return 'EARLY' as SubmissionStatus;
  if (diff === 0) return 'ON_TIME' as SubmissionStatus;
  return 'LATE' as SubmissionStatus;
}

// ---------------------------------------------------------------------------
// GET /submission — compliance list per invoice
// ---------------------------------------------------------------------------
submissionRouter.get(
  '/',
  authenticate,
  requirePermission('SUBMISSION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        clientId,
        regionId,
        siteId,
        billingMonth,
        financialYear,
        status: statusFilter,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * pageSize;

      const warningDays = await getWarningDays();

      const where: Prisma.InvoiceWhereInput = { isCancelled: false };
      if (clientId) where.clientId = clientId;
      if (regionId) where.regionId = regionId;
      if (siteId) where.siteId = siteId;
      if (billingMonth) where.billingMonth = billingMonth;
      if (financialYear) where.financialYear = financialYear;

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ billingMonth: 'desc' }, { siteId: 'asc' }],
          select: {
            id: true,
            invoiceNumber: true,
            clientId: true,
            regionId: true,
            siteId: true,
            billingMonth: true,
            financialYear: true,
            status: true,
            submissionTargetDate: true,
            actualSubmissionDate: true,
            dueDate: true,
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      // Fetch SubmissionTarget overrides for site+month combos
      const siteMonthPairs = invoices.map((inv: any) => ({
        siteId: inv.siteId,
        billingMonth: inv.billingMonth,
      }));

      const targets = await prisma.submissionTarget.findMany({
        where: {
          OR: siteMonthPairs.map((pair: any) => ({ siteId: pair.siteId, billingMonth: pair.billingMonth })),
        },
        select: { siteId: true, billingMonth: true, targetDate: true },
      });

      const targetMap = new Map<string, Date>();
      for (const t of targets) {
        targetMap.set(`${t.siteId}__${t.billingMonth}`, t.targetDate);
      }

      const data = invoices.map((inv: any) => {
        const overrideTarget = targetMap.get(`${inv.siteId}__${inv.billingMonth}`) ?? null;
        const targetDate = overrideTarget ?? inv.submissionTargetDate ?? null;
        const actualDate = inv.actualSubmissionDate ?? null;
        const submissionStatus = classifySubmission(targetDate, actualDate, warningDays);

        const delayDays =
          targetDate && actualDate
            ? Math.floor((actualDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        return {
          ...inv,
          targetDate,
          actualDate,
          delayDays,
          submissionStatus,
        };
      });

      // Filter by submission status if requested
      const filtered = statusFilter
        ? data.filter((d: any) => d.submissionStatus === statusFilter)
        : data;

      res.json({
        data: filtered,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /submission/kpis — aggregated KPI dashboard
// ---------------------------------------------------------------------------
submissionRouter.get(
  '/kpis',
  authenticate,
  requirePermission('SUBMISSION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, regionId, financialYear, billingMonth } = req.query as Record<string, string>;

      const warningDays = await getWarningDays();

      const where: Prisma.InvoiceWhereInput = { isCancelled: false };
      if (clientId) where.clientId = clientId;
      if (regionId) where.regionId = regionId;
      if (financialYear) where.financialYear = financialYear;
      if (billingMonth) where.billingMonth = billingMonth;

      const invoices = await prisma.invoice.findMany({
        where,
        select: {
          id: true,
          siteId: true,
          billingMonth: true,
          status: true,
          submissionTargetDate: true,
          actualSubmissionDate: true,
        },
      });

      // Fetch target overrides
      const siteMonthPairs = invoices.map((inv: any) => ({
        siteId: inv.siteId,
        billingMonth: inv.billingMonth,
      }));
      const targets = siteMonthPairs.length
        ? await prisma.submissionTarget.findMany({
            where: {
              OR: siteMonthPairs.map((p: any) => ({ siteId: p.siteId, billingMonth: p.billingMonth })),
            },
            select: { siteId: true, billingMonth: true, targetDate: true },
          })
        : [];

      const targetMap = new Map<string, Date>();
      for (const t of targets) {
        targetMap.set(`${t.siteId}__${t.billingMonth}`, t.targetDate);
      }

      let submitted = 0;
      let onTimeCount = 0;
      let lateCount = 0;
      let overdueNotSubmitted = 0;
      let pendingAcknowledgement = 0;
      let totalDelayDays = 0;
      let delayCount = 0;

      const submittedStatuses = new Set([
        'SUBMITTED_TO_CLIENT',
        'ACKNOWLEDGEMENT_PENDING',
        'ACKNOWLEDGED',
        'PARTIALLY_PAID',
        'PAID',
        'DISPUTED',
      ]);

      for (const inv of invoices) {
        const overrideTarget = targetMap.get(`${inv.siteId}__${inv.billingMonth}`) ?? null;
        const targetDate = overrideTarget ?? inv.submissionTargetDate ?? null;
        const actualDate = inv.actualSubmissionDate ?? null;
        const status = classifySubmission(targetDate, actualDate, warningDays);

        if (submittedStatuses.has(inv.status)) submitted++;
        if (status === 'ON_TIME' || status === 'EARLY') onTimeCount++;
        if (status === 'LATE') lateCount++;
        if (status === 'OVERDUE_NOT_SUBMITTED') overdueNotSubmitted++;
        if (inv.status === 'ACKNOWLEDGEMENT_PENDING') pendingAcknowledgement++;

        if (targetDate && actualDate) {
          const delay = Math.floor(
            (actualDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          totalDelayDays += delay;
          delayCount++;
        }
      }

      const totalDue = invoices.length;
      const onTimePct = totalDue > 0 ? (onTimeCount / totalDue) * 100 : 0;
      const averageDelayDays = delayCount > 0 ? totalDelayDays / delayCount : 0;

      res.json({
        data: {
          totalDue,
          submitted,
          onTimeCount,
          lateCount,
          overdueNotSubmitted,
          pendingAcknowledgement,
          onTimePct: parseFloat(onTimePct.toFixed(2)),
          averageDelayDays: parseFloat(averageDelayDays.toFixed(2)),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /submission/targets — list SubmissionTarget records
// ---------------------------------------------------------------------------
submissionRouter.get(
  '/targets',
  authenticate,
  requirePermission('SUBMISSION_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        siteId,
        billingMonth,
        clientId,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * pageSize;

      const where: Prisma.SubmissionTargetWhereInput = {};
      if (siteId) where.siteId = siteId;
      if (billingMonth) where.billingMonth = billingMonth;
      // clientId filter via site relation
      if (clientId) where.site = { clientId };

      const [targets, total] = await Promise.all([
        prisma.submissionTarget.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ billingMonth: 'desc' }, { siteId: 'asc' }],
          include: {
            site: { select: { name: true, siteCode: true, clientId: true } },
          },
        }),
        prisma.submissionTarget.count({ where }),
      ]);

      res.json({
        data: targets,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /submission/targets — create or upsert target for siteId+billingMonth
// ---------------------------------------------------------------------------
submissionRouter.post(
  '/targets',
  authenticate,
  requirePermission('SUBMISSION_UPDATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { siteId, billingMonth, targetDate, targetBasis } = req.body;

      if (!siteId || !billingMonth || !targetDate) {
        return next(createError(400, 'siteId, billingMonth, and targetDate are required'));
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
        return next(createError(400, 'billingMonth must be in YYYY-MM format'));
      }

      const site = await prisma.site.findUnique({ where: { id: siteId } });
      if (!site) return next(createError(404, 'Site not found'));

      const target = await prisma.submissionTarget.upsert({
        where: { siteId_billingMonth: { siteId, billingMonth } },
        update: { targetDate: new Date(targetDate), targetBasis: targetBasis ?? null },
        create: {
          siteId,
          billingMonth,
          targetDate: new Date(targetDate),
          targetBasis: targetBasis ?? null,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'SUBMISSION_TARGET_UPSERT',
        entityType: 'SubmissionTarget',
        entityId: target.id,
        newValues: { siteId, billingMonth, targetDate, targetBasis },
      });

      res.status(201).json({ data: target });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /submission/targets/:id — update target date with reason
// ---------------------------------------------------------------------------
submissionRouter.put(
  '/targets/:id',
  authenticate,
  requirePermission('SUBMISSION_UPDATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { targetDate, targetBasis, reason } = req.body;

      if (!targetDate) return next(createError(400, 'targetDate is required'));

      const existing = await prisma.submissionTarget.findUnique({ where: { id } });
      if (!existing) return next(createError(404, 'Submission target not found'));

      const updated = await prisma.submissionTarget.update({
        where: { id },
        data: {
          targetDate: new Date(targetDate),
          targetBasis: targetBasis ?? existing.targetBasis,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'SUBMISSION_TARGET_UPDATE',
        entityType: 'SubmissionTarget',
        entityId: id,
        previousValues: { targetDate: existing.targetDate, targetBasis: existing.targetBasis },
        newValues: { targetDate, targetBasis, reason },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /submission/targets/bulk — bulk upsert targets for multiple sites
// ---------------------------------------------------------------------------
submissionRouter.post(
  '/targets/bulk',
  authenticate,
  requirePermission('SUBMISSION_UPDATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { billingMonth, targets } = req.body as {
        billingMonth: string;
        targets: Array<{ siteId: string; targetDate: string; targetBasis?: string }>;
      };

      if (!billingMonth || !Array.isArray(targets) || targets.length === 0) {
        return next(createError(400, 'billingMonth and a non-empty targets array are required'));
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
        return next(createError(400, 'billingMonth must be in YYYY-MM format'));
      }

      const results: Array<{ siteId: string; status: 'created' | 'updated' | 'failed'; error?: string }> = [];

      for (const entry of targets) {
        if (!entry.siteId || !entry.targetDate) {
          results.push({ siteId: entry.siteId ?? 'UNKNOWN', status: 'failed', error: 'siteId and targetDate are required' });
          continue;
        }
        try {
          await prisma.submissionTarget.upsert({
            where: { siteId_billingMonth: { siteId: entry.siteId, billingMonth } },
            update: {
              targetDate: new Date(entry.targetDate),
              targetBasis: entry.targetBasis ?? null,
            },
            create: {
              siteId: entry.siteId,
              billingMonth,
              targetDate: new Date(entry.targetDate),
              targetBasis: entry.targetBasis ?? null,
            },
          });
          results.push({ siteId: entry.siteId, status: 'created' });
        } catch (err: any) {
          results.push({ siteId: entry.siteId, status: 'failed', error: err.message });
        }
      }

      await auditLog({
        userId: req.user!.id,
        action: 'SUBMISSION_TARGET_BULK_UPSERT',
        entityType: 'SubmissionTarget',
        entityId: 'bulk',
        newValues: { billingMonth, targetCount: targets.length },
      });

      const succeeded = results.filter((r) => r.status !== 'failed').length;
      const failed = results.filter((r) => r.status === 'failed').length;

      res.json({
        summary: { total: targets.length, succeeded, failed },
        results,
      });
    } catch (err) {
      next(err);
    }
  },
);
