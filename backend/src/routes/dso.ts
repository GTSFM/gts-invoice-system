/**
 * src/routes/dso.ts
 * GTS Invoice-to-Collection Management System
 *
 * Days Sales Outstanding (DSO) calculations and dashboard.
 *
 * Portfolio DSO  = (Average Trade Receivables ÷ Credit Sales) × Days
 * Indicative DSO = (Closing Trade Receivables ÷ Credit Sales) × Days
 *
 * Credit Sales = sum(amountExGst) where not CANCELLED and invoiceDate in period
 *   (uses totalAmount when system setting DSO_EXCLUDE_GST = 'false')
 * Trade Receivables = sum(outstandingAmount) for non-CANCELLED, non-PAID
 *   invoices where invoiceDate ≤ periodEnd
 */

import { Router, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';

export const dsoRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Financial year boundaries: "2025-26" → [2025-04-01, 2026-03-31] */
function fyBounds(fy: string): { start: Date; end: Date; days: number } {
  const [startYr] = fy.split('-').map(Number);
  const start = new Date(`${startYr}-04-01T00:00:00.000Z`);
  const end = new Date(`${startYr + 1}-03-31T23:59:59.999Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return { start, end, days };
}

/** Month (YYYY-MM) boundaries */
function monthBounds(ym: string): { start: Date; end: Date; days: number } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // last ms of month
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return { start, end, days };
}

/** Label for a period. */
function periodLabel(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
}

/** Subtract one full period (month or FY) to get previous-period bounds. */
function prevMonthBounds(ym: string): ReturnType<typeof monthBounds> {
  const [y, m] = ym.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return monthBounds(prev);
}

function prevFyBounds(fy: string): ReturnType<typeof fyBounds> {
  const [startYr] = fy.split('-').map(Number);
  return fyBounds(`${startYr - 1}-${String(startYr).slice(-2)}`);
}

interface PeriodBounds { start: Date; end: Date; days: number; label: string }

function resolvePeriod(financialYear?: string, month?: string): { curr: PeriodBounds; prev: PeriodBounds } {
  if (month) {
    const curr = monthBounds(month);
    const prev = prevMonthBounds(month);
    return {
      curr: { ...curr, label: month },
      prev: { ...prev, label: '' },
    };
  }
  const fy = financialYear || currentFY();
  const curr = fyBounds(fy);
  const prev = prevFyBounds(fy);
  return {
    curr: { ...curr, label: fy },
    prev: { ...prev, label: '' },
  };
}

function currentFY(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const startYr = m >= 4 ? y : y - 1;
  return `${startYr}-${String(startYr + 1).slice(-2)}`;
}

/** Fetch DSO_EXCLUDE_GST system setting. Default true. */
async function getExcludeGst(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'DSO_EXCLUDE_GST' } });
  return setting ? setting.value.toLowerCase() !== 'false' : true;
}

/** Compute credit sales for a period. */
async function creditSales(
  periodStart: Date,
  periodEnd: Date,
  excludeGst: boolean,
  clientId?: string,
  regionId?: string,
): Promise<Decimal> {
  const result = await prisma.invoice.aggregate({
    where: {
      isCancelled: false,
      status: { not: 'CANCELLED' },
      invoiceDate: { gte: periodStart, lte: periodEnd },
      ...(clientId && { clientId }),
      ...(regionId && { regionId }),
    },
    _sum: { amountExGst: true, totalAmount: true },
  });
  const val = excludeGst
    ? result._sum.amountExGst ?? new Decimal(0)
    : result._sum.totalAmount ?? new Decimal(0);
  return new Decimal(val.toString());
}

/** Compute closing trade receivables at periodEnd. */
async function closingReceivables(
  periodEnd: Date,
  clientId?: string,
  regionId?: string,
): Promise<Decimal> {
  const result = await prisma.invoice.aggregate({
    where: {
      isCancelled: false,
      status: { notIn: ['CANCELLED', 'PAID'] },
      invoiceDate: { lte: periodEnd },
      ...(clientId && { clientId }),
      ...(regionId && { regionId }),
    },
    _sum: { outstandingAmount: true },
  });
  return new Decimal((result._sum.outstandingAmount ?? new Decimal(0)).toString());
}

/** Compute DSO values for a period. Returns null DSOs when creditSales = 0. */
async function computeDso(
  curr: PeriodBounds,
  opening: Decimal,
  clientId?: string,
  regionId?: string,
) {
  const excludeGst = await getExcludeGst();
  const sales = await creditSales(curr.start, curr.end, excludeGst, clientId, regionId);
  const closing = await closingReceivables(curr.end, clientId, regionId);
  const avgReceivables = opening.plus(closing).div(2);

  if (sales.isZero()) {
    return {
      label: curr.label,
      dso: null,
      indicativeDso: null,
      closingOutstanding: closing.toString(),
      creditSales: sales.toString(),
      daysInPeriod: curr.days,
      message: 'No eligible credit sales for this period',
      formula: excludeGst
        ? 'DSO = (Avg Receivables ÷ Credit Sales ex-GST) × Days'
        : 'DSO = (Avg Receivables ÷ Credit Sales incl. GST) × Days',
    };
  }

  const dso = avgReceivables.div(sales).mul(curr.days).toDecimalPlaces(2);
  const indicativeDso = closing.div(sales).mul(curr.days).toDecimalPlaces(2);

  return {
    label: curr.label,
    dso: dso.toString(),
    indicativeDso: indicativeDso.toString(),
    closingOutstanding: closing.toString(),
    creditSales: sales.toString(),
    daysInPeriod: curr.days,
    formula: excludeGst
      ? 'DSO = (Avg Receivables ÷ Credit Sales ex-GST) × Days'
      : 'DSO = (Avg Receivables ÷ Credit Sales incl. GST) × Days',
  };
}

function agingBucket(dueDate: Date | null): string {
  if (!dueDate) return 'NOT_DUE';
  const today = new Date();
  const diff = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (diff < 0) return 'NOT_DUE';
  if (diff <= 30) return '1_30';
  if (diff <= 60) return '31_60';
  if (diff <= 90) return '61_90';
  if (diff <= 120) return '91_120';
  return 'OVER_120';
}

// ─── GET /dashboard ───────────────────────────────────────────────────────────

dsoRouter.get(
  '/dashboard',
  authenticate,
  requirePermission('DSO_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { financialYear, month, clientId, regionId } = req.query as Record<string, string>;
      const { curr, prev } = resolvePeriod(financialYear, month);
      const today = new Date();
      const next7 = new Date(today.getTime() + 7 * 86_400_000);
      const past30 = new Date(today.getTime() - 30 * 86_400_000);

      // Opening receivables = closing of previous period
      const openingReceivables = await closingReceivables(
        new Date(curr.start.getTime() - 1),
        clientId,
        regionId,
      );
      const prevOpeningReceivables = await closingReceivables(
        new Date(prev.start.getTime() - 1),
        clientId,
        regionId,
      );

      const [currentDso, previousDso] = await Promise.all([
        computeDso(curr, openingReceivables, clientId, regionId),
        computeDso(
          { ...prev, label: prev.label },
          prevOpeningReceivables,
          clientId,
          regionId,
        ),
      ]);

      // Trend
      let trend: 'IMPROVING' | 'DETERIORATING' | 'STABLE' = 'STABLE';
      if (currentDso.dso !== null && previousDso.dso !== null) {
        const c = new Decimal(currentDso.dso);
        const p = new Decimal(previousDso.dso);
        if (c.lt(p)) trend = 'IMPROVING';
        else if (c.gt(p)) trend = 'DETERIORATING';
      }

      // Amount due next 7 days
      const dueSoon = await prisma.invoice.aggregate({
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { gte: today, lte: next7 },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
      });

      // Amount overdue 30+ days
      const overdue30 = await prisma.invoice.aggregate({
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { lt: past30 },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
      });

      // Top 5 overdue sites
      const overdueInvoicesBySite = await prisma.invoice.groupBy({
        by: ['siteId'],
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { lt: today },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
        orderBy: { _sum: { outstandingAmount: 'desc' } },
        take: 5,
      });

      const topOverdueSiteIds = overdueInvoicesBySite.map((r) => r.siteId);
      const siteDetails = await prisma.site.findMany({
        where: { id: { in: topOverdueSiteIds } },
        select: { id: true, name: true },
      });
      const siteNameMap = Object.fromEntries(siteDetails.map((s) => [s.id, s.name]));

      const topOverdueSites = overdueInvoicesBySite.map((r) => ({
        siteId: r.siteId,
        siteName: siteNameMap[r.siteId] ?? 'Unknown',
        outstandingAmount: (r._sum.outstandingAmount ?? new Decimal(0)).toString(),
      }));

      // Top 5 overdue regions
      const overdueByRegion = await prisma.invoice.groupBy({
        by: ['regionId'],
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { lt: today },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
        orderBy: { _sum: { outstandingAmount: 'desc' } },
        take: 5,
      });

      const regionIds = overdueByRegion.map((r) => r.regionId);
      const regionDetails = await prisma.region.findMany({
        where: { id: { in: regionIds } },
        select: { id: true, name: true },
      });
      const regionNameMap = Object.fromEntries(regionDetails.map((r) => [r.id, r.name]));

      const topOverdueRegions = overdueByRegion.map((r) => ({
        regionId: r.regionId,
        regionName: regionNameMap[r.regionId] ?? 'Unknown',
        outstandingAmount: (r._sum.outstandingAmount ?? new Decimal(0)).toString(),
      }));

      // Client-wise receivables
      const clientReceivables = await prisma.invoice.groupBy({
        by: ['clientId'],
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
      });
      const overdueByClient = await prisma.invoice.groupBy({
        by: ['clientId'],
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { lt: today },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
      });
      const overdueClientMap: Record<string, Decimal> = {};
      for (const r of overdueByClient) {
        overdueClientMap[r.clientId] = new Decimal((r._sum.outstandingAmount ?? new Decimal(0)).toString());
      }

      const clientIds = clientReceivables.map((r) => r.clientId);
      const clientDetails = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true },
      });
      const clientNameMap = Object.fromEntries(clientDetails.map((c) => [c.id, c.name]));

      const clientWiseReceivables = clientReceivables.map((r) => ({
        clientId: r.clientId,
        clientName: clientNameMap[r.clientId] ?? 'Unknown',
        outstanding: (r._sum.outstandingAmount ?? new Decimal(0)).toString(),
        overdue: (overdueClientMap[r.clientId] ?? new Decimal(0)).toString(),
      }));

      // Aging breakdown
      const allInvoices = await prisma.invoice.findMany({
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        select: { dueDate: true, outstandingAmount: true },
      });

      const BUCKETS = ['NOT_DUE', '1_30', '31_60', '61_90', '91_120', 'OVER_120'];
      const bucketAcc: Record<string, { count: number; amount: Decimal }> = {};
      BUCKETS.forEach((b) => (bucketAcc[b] = { count: 0, amount: new Decimal(0) }));
      for (const inv of allInvoices) {
        const b = agingBucket(inv.dueDate);
        bucketAcc[b].count += 1;
        bucketAcc[b].amount = bucketAcc[b].amount.plus(inv.outstandingAmount ?? new Decimal(0));
      }
      const agingBreakdown = BUCKETS.map((b) => ({
        bucket: b,
        count: bucketAcc[b].count,
        amount: bucketAcc[b].amount.toString(),
      }));

      // Overdue outstanding total
      const overdueTotal = await prisma.invoice.aggregate({
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { lt: today },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        _sum: { outstandingAmount: true },
      });

      res.json({
        data: {
          currentPeriod: currentDso,
          previousPeriod: {
            label: prev.label,
            dso: previousDso.dso,
            indicativeDso: previousDso.indicativeDso,
          },
          trend,
          amountDueNext7Days: (dueSoon._sum.outstandingAmount ?? new Decimal(0)).toString(),
          amountOverdue30Plus: (overdue30._sum.outstandingAmount ?? new Decimal(0)).toString(),
          overdueOutstanding: (overdueTotal._sum.outstandingAmount ?? new Decimal(0)).toString(),
          topOverdueSites,
          topOverdueRegions,
          clientWiseReceivables,
          agingBreakdown,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /trend — last 12 months ─────────────────────────────────────────────

dsoRouter.get(
  '/trend',
  authenticate,
  requirePermission('DSO_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, regionId } = req.query as Record<string, string>;
      const now = new Date();
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }

      const trend = [];
      for (const ym of months) {
        const bounds = monthBounds(ym);
        const prevBounds = prevMonthBounds(ym);
        const openingReceivables = await closingReceivables(
          new Date(bounds.start.getTime() - 1),
          clientId,
          regionId,
        );
        const dsoData = await computeDso(
          { ...bounds, label: ym },
          openingReceivables,
          clientId,
          regionId,
        );
        trend.push({
          month: ym,
          dso: dsoData.dso,
          indicativeDso: dsoData.indicativeDso,
          outstanding: dsoData.closingOutstanding,
        });
      }

      res.json({ data: trend });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /invoice-level ───────────────────────────────────────────────────────

dsoRouter.get(
  '/invoice-level',
  authenticate,
  requirePermission('DSO_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, regionId, status, overdue } = req.query as Record<string, string>;
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
      const today = new Date();

      const where: any = {
        isCancelled: false,
        status: { not: 'CANCELLED' },
        ...(clientId && { clientId }),
        ...(regionId && { regionId }),
        ...(status && { status }),
        ...(overdue === 'true' && { dueDate: { lt: today } }),
      };

      const [total, invoices] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { dueDate: 'asc' },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            actualSubmissionDate: true,
            dueDate: true,
            outstandingAmount: true,
            status: true,
            client: { select: { name: true } },
            site: { select: { name: true } },
          },
        }),
      ]);

      const data = invoices.map((inv) => {
        const daysSinceInvoiceDate = inv.invoiceDate
          ? Math.floor((today.getTime() - inv.invoiceDate.getTime()) / 86_400_000)
          : null;
        const daysSinceSubmission = inv.actualSubmissionDate
          ? Math.floor((today.getTime() - inv.actualSubmissionDate.getTime()) / 86_400_000)
          : null;
        const daysSinceDueDate = inv.dueDate
          ? Math.floor((today.getTime() - inv.dueDate.getTime()) / 86_400_000)
          : null;
        const daysOverdue = daysSinceDueDate !== null && daysSinceDueDate > 0 ? daysSinceDueDate : 0;

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          clientName: inv.client.name,
          siteName: inv.site.name,
          status: inv.status,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          outstandingAmount: inv.outstandingAmount?.toString() ?? null,
          daysSinceInvoiceDate,
          daysSinceSubmission,
          daysSinceDueDate,
          daysOverdue,
        };
      });

      res.json({
        data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);
