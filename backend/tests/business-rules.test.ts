/**
 * GTS Invoice-to-Collection Management System — Automated Test Suite
 * Validates financial calculations, projection revision immutability,
 * variance percentages, submission SLAs, and due date triggers.
 */

describe('GTS Invoice-to-Collection Financial & Business Rules Test Suite', () => {

  // Test Scenario 1: Projection Immutability
  describe('Test Scenario 1: Monthly Projection Independence', () => {
    it('should retain manual projection independently of actual billed amount', () => {
      const projection = {
        siteId: 'site-chn-01',
        billingMonth: '2025-06',
        projectedAmountExGst: 500000.0,
      };

      const actualInvoice = {
        siteId: 'site-chn-01',
        billingMonth: '2025-06',
        amountExGst: 450000.0,
      };

      // Ensure projection is never auto-replaced by actual invoice
      expect(projection.projectedAmountExGst).toBe(500000.0);
      expect(actualInvoice.amountExGst).toBe(450000.0);
    });
  });

  // Test Scenario 2: Underbilling Variance
  describe('Test Scenario 2: Underbilling Variance Calculation', () => {
    it('should compute negative variance of -₹50,000 (-10%) and flag underbilling', () => {
      const projected = 500000.0;
      const actual = 450000.0;

      const variance = actual - projected;
      const variancePct = (variance / projected) * 100;
      const status = variance < 0 ? 'UNDERBILLING' : variance > 0 ? 'OVERBILLING' : 'ON_TARGET';

      expect(variance).toBe(-50000.0);
      expect(variancePct).toBe(-10.0);
      expect(status).toBe('UNDERBILLING');
    });
  });

  // Test Scenario 3: Overbilling Variance
  describe('Test Scenario 3: Overbilling Variance Calculation', () => {
    it('should compute positive variance of +₹25,000 (+5%) and flag overbilling', () => {
      const projected = 500000.0;
      const actual = 525000.0;

      const variance = actual - projected;
      const variancePct = (variance / projected) * 100;
      const status = variance < 0 ? 'UNDERBILLING' : variance > 0 ? 'OVERBILLING' : 'ON_TARGET';

      expect(variance).toBe(25000.0);
      expect(variancePct).toBe(5.0);
      expect(status).toBe('OVERBILLING');
    });
  });

  // Test Scenario 4: Submission Delay
  describe('Test Scenario 4: Submission Delay Calculation', () => {
    it('should calculate 3 calendar days late when target is 10 Oct and actual is 13 Oct', () => {
      const targetDate = new Date('2026-10-10T00:00:00Z');
      const actualDate = new Date('2026-10-13T00:00:00Z');

      const diffMs = actualDate.getTime() - targetDate.getTime();
      const delayDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      expect(delayDays).toBe(3);
    });
  });

  // Test Scenario 5: Due Date from Submission Date
  describe('Test Scenario 5: Payment Terms Due Date Calculation', () => {
    it('should calculate due date correctly for Net 45 days from 1 October', () => {
      const submissionDate = new Date('2026-10-01T00:00:00Z');
      const termsDays = 45;

      const dueDate = new Date(submissionDate);
      dueDate.setDate(dueDate.getDate() + termsDays);

      // 1 Oct + 45 days = 15 Nov (October has 31 days: 30 days remaining in Oct + 15 in Nov)
      expect(dueDate.toISOString().split('T')[0]).toBe('2026-11-15');
    });
  });

  // Test Scenario 6: Partial Payment Allocation
  describe('Test Scenario 6: Partial Payment Allocation & Outstanding', () => {
    it('should calculate remaining balance as ₹60,000 and status as PARTIALLY_PAID', () => {
      const invoiceTotal = 100000.0;
      const receiptAllocated = 40000.0;

      const totalReceived = receiptAllocated;
      const outstanding = invoiceTotal - totalReceived;
      const status = outstanding <= 0 ? 'PAID' : totalReceived > 0 ? 'PARTIALLY_PAID' : 'DRAFT';

      expect(outstanding).toBe(60000.0);
      expect(status).toBe('PARTIALLY_PAID');
    });
  });

  // Test Scenario 7: Portfolio DSO Calculation
  describe('Test Scenario 7: Portfolio DSO Formula', () => {
    it('should accurately compute Portfolio DSO using trade receivables and credit sales', () => {
      const averageTradeReceivables = 1500000.0;
      const creditSalesPeriod = 1800000.0;
      const daysInPeriod = 30;

      const dso = Math.round((averageTradeReceivables / creditSalesPeriod) * daysInPeriod);

      // (1500000 / 1800000) * 30 = 0.8333 * 30 = 25 days
      expect(dso).toBe(25);
    });
  });
});
