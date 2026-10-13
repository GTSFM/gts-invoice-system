import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export const reportsRouter = Router();

// Helper to format currency
function formatINRVal(val: any) {
  if (val === null || val === undefined) return '0.00';
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper to pipe JSON or file
async function respondReport(
  res: Response,
  format: string,
  title: string,
  columns: { header: string; key: string; width?: number }[],
  data: any[]
) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/\s+/g, '_')}.csv"`);
    
    // Header
    res.write(columns.map(c => `"${c.header}"`).join(',') + '\n');
    // Rows
    for (const row of data) {
      res.write(columns.map(c => `"${row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]).replace(/"/g, '""') : ''}"`).join(',') + '\n');
    }
    res.end();
    return;
  }

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GTS Facility Management Services Pvt. Ltd.';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(title.substring(0, 31));
    sheet.columns = columns;

    // Style Header Row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B2A7A' }, // GTS Purple
    };

    data.forEach(row => sheet.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/\s+/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
    return;
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/\s+/g, '_')}.pdf"`);

    doc.pipe(res);
    // GTS Header
    doc.fontSize(16).fillColor('#3B2A7A').text('GTS Facility Management Services Pvt. Ltd.', { align: 'center' });
    doc.fontSize(12).fillColor('#333333').text(title, { align: 'center' });
    doc.fontSize(9).fillColor('#666666').text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });
    doc.moveDown();

    // Table rows preview
    doc.fontSize(8).fillColor('#000000');
    data.slice(0, 40).forEach((item, idx) => {
      const summary = columns.slice(0, 4).map(c => `${c.header}: ${item[c.key] || '-'}`).join(' | ');
      doc.text(`${idx + 1}. ${summary}`);
    });

    if (data.length > 40) {
      doc.moveDown().text(`... and ${data.length - 40} more records (download Excel/CSV for complete view).`);
    }

    doc.end();
    return;
  }

  // Default JSON
  res.json({ report: title, generatedAt: new Date().toISOString(), totalRecords: data.length, data });
}

// 1. GET /api/reports/projection-vs-actual
reportsRouter.get('/projection-vs-actual', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { financialYear, billingMonth, regionId, clientId } = req.query;
    const where: any = {};
    if (financialYear) where.financialYear = String(financialYear);
    if (billingMonth) where.billingMonth = String(billingMonth);
    if (regionId) where.regionId = String(regionId);
    if (clientId) where.clientId = String(clientId);

    const projections = await prisma.billingProjection.findMany({
      where,
      include: {
        client: { select: { name: true } },
        region: { select: { name: true } },
        site: { select: { name: true, siteCode: true } },
        invoices: {
          where: { isCancelled: false },
          select: { amountExGst: true, totalAmount: true, status: true, invoiceNumber: true },
        },
      },
      orderBy: [{ billingMonth: 'desc' }, { client: { name: 'asc' } }],
    });

    const rows = projections.map(p => {
      const actualExGst = p.invoices.reduce((sum, inv) => sum + Number(inv.amountExGst || 0), 0);
      const projExGst = Number(p.projectedAmountExGst || 0);
      const variance = actualExGst - projExGst;
      const variancePct = projExGst > 0 ? ((variance / projExGst) * 100).toFixed(2) + '%' : 'N/A';

      return {
        financialYear: p.financialYear,
        billingMonth: p.billingMonth,
        client: p.client.name,
        region: p.region.name,
        site: `${p.site.name} (${p.site.siteCode})`,
        projectedExGst: formatINRVal(projExGst),
        actualExGst: formatINRVal(actualExGst),
        variance: formatINRVal(variance),
        variancePct,
        status: variance < 0 ? 'UNDERBILLING' : variance > 0 ? 'OVERBILLING' : 'ON_TARGET',
        remarks: p.remarks || '',
      };
    });

    const columns = [
      { header: 'Month', key: 'billingMonth', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Region', key: 'region', width: 18 },
      { header: 'Site', key: 'site', width: 25 },
      { header: 'Projected (Ex-GST)', key: 'projectedExGst', width: 18 },
      { header: 'Actual (Ex-GST)', key: 'actualExGst', width: 18 },
      { header: 'Variance', key: 'variance', width: 15 },
      { header: 'Variance %', key: 'variancePct', width: 12 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 25 },
    ];

    await respondReport(res, String(req.query.format || 'json'), 'Billing Projection vs Actual Report', columns, rows);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/reports/invoice-register
reportsRouter.get('/invoice-register', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { financialYear, billingMonth, regionId, clientId, status } = req.query;
    const where: any = {};
    if (financialYear) where.financialYear = String(financialYear);
    if (billingMonth) where.billingMonth = String(billingMonth);
    if (regionId) where.regionId = String(regionId);
    if (clientId) where.clientId = String(clientId);
    if (status) where.status = String(status);

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: { select: { name: true } },
        region: { select: { name: true } },
        site: { select: { name: true, siteCode: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });

    const rows = invoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      client: inv.client.name,
      region: inv.region.name,
      site: inv.site.name,
      billingMonth: inv.billingMonth,
      invoiceDate: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
      amountExGst: formatINRVal(inv.amountExGst),
      gstAmount: formatINRVal(inv.gstAmount),
      totalAmount: formatINRVal(inv.totalAmount),
      totalReceived: formatINRVal(inv.totalReceived),
      outstandingAmount: formatINRVal(inv.outstandingAmount),
      status: inv.status,
      submissionDate: inv.actualSubmissionDate ? inv.actualSubmissionDate.toISOString().split('T')[0] : '',
      dueDate: inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : 'Pending',
    }));

    const columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
      { header: 'Client', key: 'client', width: 22 },
      { header: 'Region', key: 'region', width: 16 },
      { header: 'Site', key: 'site', width: 22 },
      { header: 'Month', key: 'billingMonth', width: 12 },
      { header: 'Date', key: 'invoiceDate', width: 12 },
      { header: 'Total (INR)', key: 'totalAmount', width: 16 },
      { header: 'Received', key: 'totalReceived', width: 16 },
      { header: 'Outstanding', key: 'outstandingAmount', width: 16 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Submitted', key: 'submissionDate', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 12 },
    ];

    await respondReport(res, String(req.query.format || 'json'), 'Master Invoice Register', columns, rows);
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/reports/submission-tracker
reportsRouter.get('/submission-tracker', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { billingMonth, regionId } = req.query;
    const where: any = { isCancelled: false };
    if (billingMonth) where.billingMonth = String(billingMonth);
    if (regionId) where.regionId = String(regionId);

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: { select: { name: true } },
        region: { select: { name: true } },
        site: { select: { name: true } },
      },
      orderBy: { submissionTargetDate: 'asc' },
    });

    const now = new Date();
    const rows = invoices.map(inv => {
      let delayDays = 0;
      let compliance = 'ON_TIME';

      if (inv.submissionTargetDate && inv.actualSubmissionDate) {
        delayDays = Math.floor((inv.actualSubmissionDate.getTime() - inv.submissionTargetDate.getTime()) / (1000 * 60 * 60 * 24));
        compliance = delayDays > 0 ? `LATE (+${delayDays}d)` : delayDays === 0 ? 'ON_TIME' : `EARLY (${delayDays}d)`;
      } else if (inv.submissionTargetDate && !inv.actualSubmissionDate) {
        if (now > inv.submissionTargetDate) {
          const overdueDays = Math.floor((now.getTime() - inv.submissionTargetDate.getTime()) / (1000 * 60 * 60 * 24));
          compliance = `OVERDUE (+${overdueDays}d)`;
        } else {
          compliance = 'DUE_SOON';
        }
      } else {
        compliance = 'TARGET_NOT_CONFIGURED';
      }

      return {
        invoiceNumber: inv.invoiceNumber,
        client: inv.client.name,
        region: inv.region.name,
        site: inv.site.name,
        month: inv.billingMonth,
        targetDate: inv.submissionTargetDate ? inv.submissionTargetDate.toISOString().split('T')[0] : 'N/A',
        actualDate: inv.actualSubmissionDate ? inv.actualSubmissionDate.toISOString().split('T')[0] : 'Not Submitted',
        compliance,
        channel: inv.submissionChannel || 'Email/Portal',
        ackDate: inv.clientAcknowledgementDate ? inv.clientAcknowledgementDate.toISOString().split('T')[0] : 'Pending',
      };
    });

    const columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
      { header: 'Client', key: 'client', width: 22 },
      { header: 'Region', key: 'region', width: 16 },
      { header: 'Site', key: 'site', width: 20 },
      { header: 'Target Date', key: 'targetDate', width: 14 },
      { header: 'Actual Date', key: 'actualDate', width: 14 },
      { header: 'Compliance', key: 'compliance', width: 18 },
      { header: 'Channel', key: 'channel', width: 16 },
      { header: 'Acknowledged', key: 'ackDate', width: 14 },
    ];

    await respondReport(res, String(req.query.format || 'json'), 'Invoice Submission Compliance Tracker', columns, rows);
  } catch (err) {
    next(err);
  }
});

// 4. GET /api/reports/pending-actions
reportsRouter.get('/pending-actions', authenticate, async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();

    // 1. Overdue Submissions
    const overdueSubmissions = await prisma.invoice.count({
      where: {
        isCancelled: false,
        actualSubmissionDate: null,
        submissionTargetDate: { lt: now },
      },
    });

    // 2. Invoices Due for Submission in next 3 days
    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    const dueSoonSubmissions = await prisma.invoice.count({
      where: {
        isCancelled: false,
        actualSubmissionDate: null,
        submissionTargetDate: { gte: now, lte: inThreeDays },
      },
    });

    // 3. Overdue Payments
    const overduePayments = await prisma.invoice.count({
      where: {
        isCancelled: false,
        status: { notIn: ['PAID', 'CANCELLED'] },
        dueDate: { lt: now },
      },
    });

    // 4. Missing Due Dates (submitted but no due date)
    const missingDueDates = await prisma.invoice.count({
      where: {
        isCancelled: false,
        actualSubmissionDate: { not: null },
        dueDate: null,
      },
    });

    res.json({
      overdueSubmissions,
      dueSoonSubmissions,
      overduePayments,
      missingDueDates,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
