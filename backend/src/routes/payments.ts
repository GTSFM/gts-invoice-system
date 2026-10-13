/**
 * src/routes/payments.ts
 * GTS Invoice-to-Collection Management System
 *
 * Handles payment receipts, allocations, outstanding receivables and ageing.
 * All multi-step financial writes use prisma.$transaction.
 * Decimal amounts are kept as strings in JSON — never parsed to float.
 */

import { Router, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const paymentsRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Days between two dates (always positive). */
function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

/** Map daysOverdue (negative = not yet due) to an aging bucket label. */
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

/** Build pagination meta. */
function paginate(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── GET /outstanding — must be before /:id ──────────────────────────────────

paymentsRouter.get(
  '/outstanding',
  authenticate,
  requirePermission('PAYMENT_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, regionId, siteId, agingBucketFilter, overdue } = req.query as Record<string, string>;
      const today = new Date();

      const invoices = await prisma.invoice.findMany({
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
          ...(siteId && { siteId }),
          ...(overdue === 'true' && { dueDate: { lt: today } }),
        },
        select: {
          id: true,
          invoiceNumber: true,
          dueDate: true,
          totalAmount: true,
          totalReceived: true,
          outstandingAmount: true,
          client: { select: { name: true } },
          site: { select: { name: true } },
          region: { select: { name: true } },
        },
      });

      const rows = invoices
        .map((inv) => {
          const bucket = agingBucket(inv.dueDate);
          const daysOverdue =
            inv.dueDate
              ? Math.floor((today.getTime() - inv.dueDate.getTime()) / 86_400_000)
              : null;
          return {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            clientName: inv.client.name,
            siteName: inv.site.name,
            regionName: inv.region.name,
            totalAmount: inv.totalAmount?.toString() ?? null,
            totalReceived: inv.totalReceived.toString(),
            outstandingAmount: inv.outstandingAmount?.toString() ?? null,
            dueDate: inv.dueDate,
            daysOverdue,
            agingBucket: bucket,
          };
        })
        .filter((r) => !agingBucketFilter || r.agingBucket === agingBucketFilter);

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /ageing-summary ─────────────────────────────────────────────────────

paymentsRouter.get(
  '/ageing-summary',
  authenticate,
  requirePermission('PAYMENT_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, regionId } = req.query as Record<string, string>;
      const today = new Date();

      const invoices = await prisma.invoice.findMany({
        where: {
          isCancelled: false,
          status: { notIn: ['CANCELLED', 'PAID'] },
          ...(clientId && { clientId }),
          ...(regionId && { regionId }),
        },
        select: {
          outstandingAmount: true,
          dueDate: true,
          client: { select: { id: true, name: true } },
          region: { select: { id: true, name: true } },
        },
      });

      const BUCKETS = ['NOT_DUE', '1_30', '31_60', '61_90', '91_120', 'OVER_120'];

      // Overall bucket summary
      const bucketMap: Record<string, { count: number; totalOutstanding: Decimal }> = {};
      BUCKETS.forEach((b) => (bucketMap[b] = { count: 0, totalOutstanding: new Decimal(0) }));

      // By region
      const regionMap: Record<string, { regionName: string; totalOutstanding: Decimal }> = {};
      // By client
      const clientMap: Record<string, { clientName: string; totalOutstanding: Decimal }> = {};

      for (const inv of invoices) {
        const bucket = agingBucket(inv.dueDate);
        const amt = inv.outstandingAmount ?? new Decimal(0);

        bucketMap[bucket].count += 1;
        bucketMap[bucket].totalOutstanding = bucketMap[bucket].totalOutstanding.plus(amt);

        const rKey = inv.region.id;
        if (!regionMap[rKey]) regionMap[rKey] = { regionName: inv.region.name, totalOutstanding: new Decimal(0) };
        regionMap[rKey].totalOutstanding = regionMap[rKey].totalOutstanding.plus(amt);

        const cKey = inv.client.id;
        if (!clientMap[cKey]) clientMap[cKey] = { clientName: inv.client.name, totalOutstanding: new Decimal(0) };
        clientMap[cKey].totalOutstanding = clientMap[cKey].totalOutstanding.plus(amt);
      }

      res.json({
        data: {
          overall: BUCKETS.map((b) => ({
            bucket: b,
            count: bucketMap[b].count,
            totalOutstanding: bucketMap[b].totalOutstanding.toString(),
          })),
          byRegion: Object.values(regionMap).map((r) => ({
            ...r,
            totalOutstanding: r.totalOutstanding.toString(),
          })),
          byClient: Object.values(clientMap).map((c) => ({
            ...c,
            totalOutstanding: c.totalOutstanding.toString(),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET / — list receipts ───────────────────────────────────────────────────

paymentsRouter.get(
  '/',
  authenticate,
  requirePermission('PAYMENT_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, dateFrom, dateTo, paymentMode } = req.query as Record<string, string>;
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));

      const where: any = {
        ...(clientId && { clientId }),
        ...(paymentMode && { paymentMode: paymentMode as any }),
        ...(dateFrom || dateTo
          ? {
              receiptDate: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
              },
            }
          : {}),
      };

      const [total, receipts] = await Promise.all([
        prisma.paymentReceipt.count({ where }),
        prisma.paymentReceipt.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { receiptDate: 'desc' },
          select: {
            id: true,
            receiptReference: true,
            receiptDate: true,
            amountReceived: true,
            unallocatedAmount: true,
            paymentMode: true,
            bankReference: true,
            utrNumber: true,
            clientId: true,
            remarks: true,
            createdAt: true,
            _count: { select: { allocations: true } },
          },
        }),
      ]);

      const data = receipts.map((r) => ({
        ...r,
        amountReceived: r.amountReceived.toString(),
        unallocatedAmount: r.unallocatedAmount.toString(),
        allocationCount: r._count.allocations,
        _count: undefined,
      }));

      res.json({ data, pagination: paginate(page, limit, total) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id — receipt detail ───────────────────────────────────────────────

paymentsRouter.get(
  '/:id',
  authenticate,
  requirePermission('PAYMENT_VIEW'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const receipt = await prisma.paymentReceipt.findUnique({
        where: { id: req.params.id },
        include: {
          allocations: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  totalAmount: true,
                  outstandingAmount: true,
                  status: true,
                  dueDate: true,
                  site: { select: { name: true } },
                  client: { select: { name: true } },
                },
              },
            },
            orderBy: { allocationDate: 'desc' },
          },
          recordedBy: { select: { id: true, name: true, email: true } },
        },
      });

      if (!receipt) throw createError('Payment receipt not found.', 404);

      res.json({
        data: {
          ...receipt,
          amountReceived: receipt.amountReceived.toString(),
          unallocatedAmount: receipt.unallocatedAmount.toString(),
          allocations: receipt.allocations.map((a) => ({
            ...a,
            allocatedAmount: a.allocatedAmount.toString(),
            invoice: a.invoice
              ? {
                  ...a.invoice,
                  totalAmount: a.invoice.totalAmount?.toString() ?? null,
                  outstandingAmount: a.invoice.outstandingAmount?.toString() ?? null,
                }
              : null,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / — record new receipt ─────────────────────────────────────────────

paymentsRouter.post(
  '/',
  authenticate,
  requirePermission('PAYMENT_CREATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        receiptReference,
        receiptDate,
        amountReceived,
        bankReference,
        utrNumber,
        paymentMode,
        clientId,
        remarks,
      } = req.body;

      if (!receiptReference) throw createError('receiptReference is required.', 400);
      if (!receiptDate) throw createError('receiptDate is required.', 400);
      if (amountReceived === undefined || amountReceived === null)
        throw createError('amountReceived is required.', 400);

      const amount = new Decimal(String(amountReceived));
      if (amount.lte(0)) throw createError('amountReceived must be greater than zero.', 400);

      const receipt = await prisma.$transaction(async (tx) => {
        const newReceipt = await tx.paymentReceipt.create({
          data: {
            receiptReference,
            receiptDate: new Date(receiptDate),
            amountReceived: amount,
            unallocatedAmount: amount,
            bankReference: bankReference ?? null,
            utrNumber: utrNumber ?? null,
            paymentMode: paymentMode ?? 'NEFT',
            clientId: clientId ?? null,
            remarks: remarks ?? null,
            recordedById: req.user!.id,
          },
        });

        await auditLog({
          userId: req.user!.id,
          action: 'CREATE',
          recordType: 'PaymentReceipt',
          recordId: newReceipt.id,
          newValues: {
            receiptReference,
            amountReceived: amount.toString(),
            paymentMode,
          },
          ipAddress: req.ip,
        });

        return newReceipt;
      });

      res.status(201).json({
        data: {
          ...receipt,
          amountReceived: receipt.amountReceived.toString(),
          unallocatedAmount: receipt.unallocatedAmount.toString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/allocate ───────────────────────────────────────────────────────

paymentsRouter.post(
  '/:id/allocate',
  authenticate,
  requirePermission('PAYMENT_ALLOCATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { allocations } = req.body as {
        allocations: Array<{ invoiceId: string; amount: string | number; remarks?: string }>;
      };

      if (!Array.isArray(allocations) || allocations.length === 0)
        throw createError('allocations array is required and must not be empty.', 400);

      const result = await prisma.$transaction(async (tx) => {
        // Lock the receipt row
        const receipt = await tx.paymentReceipt.findUnique({ where: { id: req.params.id } });
        if (!receipt) throw createError('Payment receipt not found.', 404);

        // Validate total allocation ≤ unallocatedAmount
        const totalRequested = allocations.reduce(
          (sum, a) => sum.plus(new Decimal(String(a.amount))),
          new Decimal(0),
        );
        if (totalRequested.gt(receipt.unallocatedAmount)) {
          throw createError(
            `Total allocation (${totalRequested}) exceeds unallocated amount (${receipt.unallocatedAmount}).`,
            422,
          );
        }

        const createdAllocations = [];

        for (const alloc of allocations) {
          const allocAmount = new Decimal(String(alloc.amount));
          if (allocAmount.lte(0)) throw createError('Each allocation amount must be greater than zero.', 400);

          // Fetch and lock invoice
          const invoice = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
          if (!invoice) throw createError('Invoice not found.', 404);
          if (invoice.isCancelled || invoice.status === 'CANCELLED')
            throw createError('Cannot allocate to a cancelled invoice.', 422);

          const prevTotalReceived = invoice.totalReceived;
          const prevOutstanding = invoice.outstandingAmount ?? invoice.totalAmount ?? new Decimal(0);

          const newTotalReceived = new Decimal(prevTotalReceived.toString()).plus(allocAmount);

          // Outstanding = totalAmount - totalReceived - appliedCreditNotes
          const creditNotes = await tx.creditNote.aggregate({
            where: { invoiceId: invoice.id, status: { not: 'CANCELLED' } },
            _sum: { appliedAmount: true },
          });
          const appliedCredits = creditNotes._sum.appliedAmount ?? new Decimal(0);
          const totalAmt = invoice.totalAmount ?? new Decimal(0);
          const newOutstanding = new Decimal(totalAmt.toString())
            .minus(newTotalReceived)
            .minus(new Decimal(appliedCredits.toString()));

          // Determine new status
          let newStatus = invoice.status;
          if (newOutstanding.abs().lte(new Decimal('0.01'))) {
            newStatus = 'PAID';
          } else if (newTotalReceived.gt(0)) {
            newStatus = 'PARTIALLY_PAID';
          }

          // Create allocation record
          const allocation = await tx.paymentAllocation.create({
            data: {
              receiptId: receipt.id,
              invoiceId: invoice.id,
              allocatedAmount: allocAmount,
              allocationDate: new Date(),
              remarks: alloc.remarks ?? null,
              createdById: req.user!.id,
            },
          });
          createdAllocations.push(allocation);

          // Update invoice
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              totalReceived: newTotalReceived,
              outstandingAmount: newOutstanding.lt(0) ? new Decimal(0) : newOutstanding,
              status: newStatus as any,
              lastReceiptDate: new Date(),
            },
          });

          // Audit invoice change
          await auditLog({
            userId: req.user!.id,
            action: 'UPDATE',
            recordType: 'Invoice',
            recordId: invoice.id,
            previousValues: {
              totalReceived: prevTotalReceived.toString(),
              outstandingAmount: prevOutstanding.toString(),
              status: invoice.status,
            },
            newValues: {
              totalReceived: newTotalReceived.toString(),
              outstandingAmount: (newOutstanding.lt(0) ? new Decimal(0) : newOutstanding).toString(),
              status: newStatus,
            },
            changeReason: `Payment allocation from receipt ${receipt.receiptReference}`,
            ipAddress: req.ip,
          });
        }

        // Update receipt unallocatedAmount
        const updatedReceipt = await tx.paymentReceipt.update({
          where: { id: receipt.id },
          data: { unallocatedAmount: new Decimal(receipt.unallocatedAmount.toString()).minus(totalRequested) },
        });

        // Audit receipt allocation
        await auditLog({
          userId: req.user!.id,
          action: 'UPDATE',
          recordType: 'PaymentReceipt',
          recordId: receipt.id,
          previousValues: { unallocatedAmount: receipt.unallocatedAmount.toString() },
          newValues: { unallocatedAmount: updatedReceipt.unallocatedAmount.toString() },
          changeReason: `Allocated ${totalRequested} across ${allocations.length} invoice(s)`,
          ipAddress: req.ip,
        });

        return { receipt: updatedReceipt, allocations: createdAllocations };
      });

      res.status(201).json({
        data: {
          receiptId: result.receipt.id,
          unallocatedAmount: result.receipt.unallocatedAmount.toString(),
          allocations: result.allocations.map((a) => ({
            ...a,
            allocatedAmount: a.allocatedAmount.toString(),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id — update receipt metadata ──────────────────────────────────────

paymentsRouter.put(
  '/:id',
  authenticate,
  requirePermission('PAYMENT_CREATE'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { bankReference, utrNumber, paymentMode, remarks } = req.body;

      const existing = await prisma.paymentReceipt.findUnique({ where: { id: req.params.id } });
      if (!existing) throw createError('Payment receipt not found.', 404);

      // Prevent amount changes if already allocated
      const hasAllocations = (await prisma.paymentAllocation.count({ where: { receiptId: req.params.id } })) > 0;
      if (req.body.amountReceived !== undefined && hasAllocations) {
        throw createError('Cannot modify amount on a receipt that already has allocations.', 422);
      }

      const updated = await prisma.paymentReceipt.update({
        where: { id: req.params.id },
        data: {
          ...(bankReference !== undefined && { bankReference }),
          ...(utrNumber !== undefined && { utrNumber }),
          ...(paymentMode !== undefined && { paymentMode }),
          ...(remarks !== undefined && { remarks }),
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'PaymentReceipt',
        recordId: existing.id,
        previousValues: {
          bankReference: existing.bankReference,
          utrNumber: existing.utrNumber,
          paymentMode: existing.paymentMode,
          remarks: existing.remarks,
        },
        newValues: {
          bankReference: updated.bankReference,
          utrNumber: updated.utrNumber,
          paymentMode: updated.paymentMode,
          remarks: updated.remarks,
        },
        ipAddress: req.ip,
      });

      res.json({
        data: {
          ...updated,
          amountReceived: updated.amountReceived.toString(),
          unallocatedAmount: updated.unallocatedAmount.toString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
