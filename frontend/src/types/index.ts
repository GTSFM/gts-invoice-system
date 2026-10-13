// ─── Enums ────────────────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  MANAGEMENT = 'MANAGEMENT',
  ACCOUNTS_MANAGER = 'ACCOUNTS_MANAGER',
  BILLING_EXECUTIVE = 'BILLING_EXECUTIVE',
  COLLECTION_EXECUTIVE = 'COLLECTION_EXECUTIVE',
  READ_ONLY = 'READ_ONLY',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  DOCUMENTS_PENDING = 'DOCUMENTS_PENDING',
  INTERNAL_REVIEW = 'INTERNAL_REVIEW',
  SUBMITTED_TO_CLIENT = 'SUBMITTED_TO_CLIENT',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  DISPUTED = 'DISPUTED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  ON_HOLD = 'ON_HOLD',
}

export enum SubmissionStatus {
  PENDING = 'PENDING',
  SUBMITTED_ON_TIME = 'SUBMITTED_ON_TIME',
  SUBMITTED_LATE = 'SUBMITTED_LATE',
  OVERDUE = 'OVERDUE',
  WAIVED = 'WAIVED',
}

export enum PaymentMode {
  NEFT = 'NEFT',
  RTGS = 'RTGS',
  CHEQUE = 'CHEQUE',
  IMPS = 'IMPS',
  CASH = 'CASH',
  OTHER = 'OTHER',
}

export enum DocumentType {
  INVOICE_PDF = 'INVOICE_PDF',
  SUPPORTING_DOC = 'SUPPORTING_DOC',
  ESI_CHALLAN = 'ESI_CHALLAN',
  PF_CHALLAN = 'PF_CHALLAN',
  ATTENDANCE_SHEET = 'ATTENDANCE_SHEET',
  BOQ = 'BOQ',
  OTHER = 'OTHER',
}

// ─── Core Entities ─────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  status: AccountStatus;
  phone?: string;
  lastLoginAt?: string;
  createdAt: string;
  assignedRegions?: Region[];
}

export interface Region {
  id: number;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  siteCount?: number;
}

export interface Client {
  id: number;
  name: string;
  code: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  paymentTermsDays: number;
  isDemo: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Site {
  id: number;
  name: string;
  code: string;
  clientId: number;
  client?: Client;
  regionId: number;
  region?: Region;
  address?: string;
  city?: string;
  state?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  isActive: boolean;
  createdAt: string;
}

export interface BillingProjection {
  id: number;
  siteId: number;
  site?: Site;
  financialYear: string;
  month: number;
  projectedAmount: string;
  revisedAmount?: string;
  actualAmount?: string;
  variance?: string;
  variancePercent?: string;
  remarks?: string;
  revisionReason?: string;
  createdById: number;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
  revisions?: ProjectionRevision[];
}

export interface ProjectionRevision {
  id: number;
  projectionId: number;
  previousAmount: string;
  newAmount: string;
  reason: string;
  revisedById: number;
  revisedBy?: User;
  createdAt: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  siteId: number;
  site?: Site;
  clientId: number;
  client?: Client;
  regionId: number;
  region?: Region;
  status: InvoiceStatus;
  invoiceDate: string;
  billingMonth: number;
  billingYear: number;
  financialYear: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  contractReference?: string;
  basicAmount: string;
  gstAmount: string;
  totalAmount: string;
  tdsDeduction?: string;
  otherDeductions?: string;
  netPayable: string;
  amountReceived?: string;
  outstandingAmount?: string;
  dueDate?: string;
  projectionId?: number;
  projection?: BillingProjection;
  submittedAt?: string;
  acknowledgedAt?: string;
  paidAt?: string;
  notes?: string;
  createdById: number;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
  documents?: InvoiceDocument[];
  submissions?: SubmissionTarget[];
  payments?: PaymentAllocation[];
  followups?: CollectionFollowup[];
}

export interface InvoiceDocument {
  id: number;
  invoiceId: number;
  documentType: DocumentType;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  storagePath: string;
  uploadedById: number;
  uploadedBy?: User;
  createdAt: string;
}

export interface PaymentReceipt {
  id: number;
  receiptNumber: string;
  clientId: number;
  client?: Client;
  receiptDate: string;
  amount: string;
  paymentMode: PaymentMode;
  bankReference?: string;
  bankName?: string;
  chequeNumber?: string;
  remarks?: string;
  unallocatedAmount?: string;
  createdById: number;
  createdBy?: User;
  createdAt: string;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: number;
  receiptId: number;
  receipt?: PaymentReceipt;
  invoiceId: number;
  invoice?: Invoice;
  allocatedAmount: string;
  allocationDate: string;
  createdById: number;
  createdBy?: User;
  createdAt: string;
}

export interface CollectionFollowup {
  id: number;
  invoiceId: number;
  invoice?: Invoice;
  followupDate: string;
  nextFollowupDate?: string;
  contactPerson?: string;
  contactMode?: string;
  notes: string;
  promisedPaymentDate?: string;
  promisedAmount?: string;
  createdById: number;
  createdBy?: User;
  createdAt: string;
}

export interface SubmissionTarget {
  id: number;
  invoiceId: number;
  invoice?: Invoice;
  targetDate: string;
  submittedDate?: string;
  status: SubmissionStatus;
  submittedById?: number;
  submittedBy?: User;
  submissionMethod?: string;
  trackingNumber?: string;
  notes?: string;
  daysVariance?: number;
  createdAt: string;
}

export interface DSOData {
  currentDSO: number;
  previousDSO: number;
  trend: number;
  totalReceivables: string;
  averageDailyRevenue: string;
  calculationDate: string;
  period: string;
  ageing: {
    current: string;
    days30: string;
    days60: string;
    days90: string;
    days90Plus: string;
  };
}

export interface AuditLog {
  id: number;
  userId: number;
  user?: User;
  action: string;
  recordType: string;
  recordId?: number;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface SystemSetting {
  id: number;
  key: string;
  value: string;
  description?: string;
  category?: string;
  updatedById?: number;
  updatedBy?: User;
  updatedAt: string;
}

export interface NotificationRule {
  id: number;
  name: string;
  triggerEvent: string;
  recipientRoles: UserRole[];
  emailTemplate?: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ─── API Helpers ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  statusCode?: number;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  totalOutstanding: string;
  totalOverdue: string;
  totalReceived: string;
  invoicesThisMonth: number;
  invoicesDraft: number;
  invoicesSubmitted: number;
  invoicesPaid: number;
  submissionOnTimePercent: number;
  dso: number;
  missingProjections: number;
  overdueSubmissions: number;
  overduePayments: number;
}

export interface PendingActions {
  missingProjections: Array<{ siteId: number; siteName: string; month: number; financialYear: string }>;
  overdueSubmissions: Array<{ invoiceId: number; invoiceNumber: string; targetDate: string; daysOverdue: number }>;
  overduePayments: Array<{ invoiceId: number; invoiceNumber: string; dueDate: string; daysOverdue: number; outstandingAmount: string }>;
}

// ─── Filters ───────────────────────────────────────────────────────────────────

export interface GlobalFilters {
  financialYear?: string;
  month?: number;
  clientId?: number;
  regionId?: number;
  siteId?: number;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Formatters ────────────────────────────────────────────────────────────────

/**
 * Format a number as Indian Rupee (₹1,25,000.00)
 * Returns '—' for null/undefined/empty values
 */
export function formatINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '—';

  // Indian number system formatting
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(num);
}

/**
 * Format a date string or Date object as DD-MMM-YYYY
 * Returns '—' for null/undefined
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Format a date + time string as DD-MMM-YYYY HH:MM
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const dateStr = formatDate(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
}

/**
 * Get month name from month number (1-12)
 */
export function getMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || '—';
}

/**
 * Get financial years list (last 3 years)
 */
export function getFinancialYears(): string[] {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentFY = currentMonth >= 4 ? currentYear : currentYear - 1;
  return [
    `${currentFY - 2}-${String(currentFY - 1).slice(2)}`,
    `${currentFY - 1}-${String(currentFY).slice(2)}`,
    `${currentFY}-${String(currentFY + 1).slice(2)}`,
  ];
}

/**
 * Get current financial year string (e.g. "2024-25")
 */
export function getCurrentFY(): string {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const fyStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  return `${fyStart}-${String(fyStart + 1).slice(2)}`;
}

/**
 * Returns the label for InvoiceStatus
 */
export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    [InvoiceStatus.DRAFT]: 'Draft',
    [InvoiceStatus.DOCUMENTS_PENDING]: 'Docs Pending',
    [InvoiceStatus.INTERNAL_REVIEW]: 'In Review',
    [InvoiceStatus.SUBMITTED_TO_CLIENT]: 'Submitted',
    [InvoiceStatus.ACKNOWLEDGED]: 'Acknowledged',
    [InvoiceStatus.DISPUTED]: 'Disputed',
    [InvoiceStatus.PARTIALLY_PAID]: 'Partially Paid',
    [InvoiceStatus.PAID]: 'Paid',
    [InvoiceStatus.CANCELLED]: 'Cancelled',
    [InvoiceStatus.ON_HOLD]: 'On Hold',
  };
  return labels[status] || status;
}
