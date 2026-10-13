-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'CENTRAL_BILLING', 'REGIONAL_OPERATIONS', 'FINANCE_COLLECTIONS', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PROJECTION_PENDING', 'BILLING_INPUT_PENDING', 'DRAFT', 'DOCUMENTS_PENDING', 'INTERNAL_REVIEW', 'APPROVED_FOR_SUBMISSION', 'READY_FOR_SUBMISSION', 'SUBMITTED_TO_CLIENT', 'ACKNOWLEDGEMENT_PENDING', 'ACKNOWLEDGED', 'DISPUTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('ON_TIME', 'EARLY', 'LATE', 'DUE_SOON', 'OVERDUE_NOT_SUBMITTED', 'TARGET_NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'DEMAND_DRAFT', 'ONLINE_PORTAL', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT', 'STATUS_CHANGE', 'APPROVE', 'REJECT', 'CANCEL', 'REVISE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP', 'BOTH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PaymentTermsTrigger" AS ENUM ('INVOICE_DATE', 'SUBMISSION_DATE', 'ACKNOWLEDGEMENT_DATE');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('CLOUDINARY', 'S3', 'LOCAL');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED');

-- CreateEnum
CREATE TYPE "EmailSyncStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'PENDING_SETUP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "role" "UserRole" NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'PENDING',
    "microsoftUserId" TEXT,
    "microsoftEmail" TEXT,
    "m365Connected" BOOLEAN NOT NULL DEFAULT false,
    "m365ConnectedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_region_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_region_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_site_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_site_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billingAddress" TEXT,
    "gstin" TEXT,
    "billingContactName" TEXT,
    "billingContactEmail" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "paymentTermsTrigger" "PaymentTermsTrigger" NOT NULL DEFAULT 'SUBMISSION_DATE',
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionalManager" TEXT,
    "regionalOpsEmail" TEXT,
    "billingTeamEmail" TEXT,
    "financeContactEmail" TEXT,
    "escalationEmail" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "siteCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "billingContactName" TEXT,
    "billingContactEmail" TEXT,
    "regionalOpsOwner" TEXT,
    "billingOwner" TEXT,
    "paymentTermsDays" INTEGER,
    "paymentTermsTrigger" "PaymentTermsTrigger",
    "gstTreatment" TEXT,
    "contractReference" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "monthlyProjectionBase" DECIMAL(15,2),
    "submissionTargetDay" INTEGER,
    "submissionOffsetDays" INTEGER,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "siteId" TEXT,
    "contractType" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "scopeDescription" TEXT,
    "paymentTermsDays" INTEGER,
    "paymentTermsTrigger" "PaymentTermsTrigger",
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_projections" (
    "id" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "contractReference" TEXT,
    "projectedAmountExGst" DECIMAL(15,2) NOT NULL,
    "projectedGst" DECIMAL(15,2),
    "projectedTotal" DECIMAL(15,2) NOT NULL,
    "isZeroProjection" BOOLEAN NOT NULL DEFAULT false,
    "zeroReason" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "lastRevisedById" TEXT,
    "lastRevisedAt" TIMESTAMP(3),

    CONSTRAINT "billing_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projection_revisions" (
    "id" TEXT NOT NULL,
    "projectionId" TEXT NOT NULL,
    "previousAmountExGst" DECIMAL(15,2) NOT NULL,
    "previousGst" DECIMAL(15,2),
    "previousTotal" DECIMAL(15,2) NOT NULL,
    "newAmountExGst" DECIMAL(15,2) NOT NULL,
    "newGst" DECIMAL(15,2),
    "newTotal" DECIMAL(15,2) NOT NULL,
    "revisionReason" TEXT NOT NULL,
    "revisionReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "projection_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "contractId" TEXT,
    "projectionId" TEXT,
    "financialYear" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "billingPeriodStart" TIMESTAMP(3),
    "billingPeriodEnd" TIMESTAMP(3),
    "amountExGst" DECIMAL(15,2),
    "gstAmount" DECIMAL(15,2),
    "totalAmount" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submissionTargetDate" TIMESTAMP(3),
    "actualSubmissionDate" TIMESTAMP(3),
    "submissionReference" TEXT,
    "submissionChannel" TEXT,
    "submissionProofUrl" TEXT,
    "clientAcknowledgementDate" TIMESTAMP(3),
    "paymentTermsDays" INTEGER,
    "paymentTermsTrigger" "PaymentTermsTrigger",
    "dueDate" TIMESTAMP(3),
    "totalReceived" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(15,2),
    "lastReceiptDate" TIMESTAMP(3),
    "collectionOwnerId" TEXT,
    "lastFollowupDate" TIMESTAMP(3),
    "nextFollowupDate" TIMESTAMP(3),
    "remarks" TEXT,
    "internalNotes" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_documents" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'CLOUDINARY',
    "storageKey" TEXT,
    "documentType" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoice_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_submission_events" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT,
    "submissionChannel" TEXT,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_submission_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_targets" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "targetBasis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "submission_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms_overrides" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "siteId" TEXT,
    "contractId" TEXT,
    "termsDays" INTEGER NOT NULL,
    "trigger" "PaymentTermsTrigger" NOT NULL DEFAULT 'SUBMISSION_DATE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "payment_terms_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "receiptReference" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "amountReceived" DECIMAL(15,2) NOT NULL,
    "bankReference" TEXT,
    "utrNumber" TEXT,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'NEFT',
    "clientId" TEXT,
    "unallocatedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(15,2) NOT NULL,
    "allocationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "appliedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_followups" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "followupDate" TIMESTAMP(3) NOT NULL,
    "nextFollowupDate" TIMESTAMP(3),
    "remarks" TEXT NOT NULL,
    "actionTaken" TEXT,
    "followupChannel" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "microsoftAccountId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "syncStatus" "EmailSyncStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "lastSyncAt" TIMESTAMP(3),
    "mailboxEmail" TEXT,
    "graphSubscriptionId" TEXT,
    "subscriptionExpiry" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_activity" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "siteId" TEXT,
    "regionId" TEXT,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "sentAt" TIMESTAMP(3),
    "graphMessageId" TEXT,
    "internetMessageId" TEXT,
    "deliveryStatus" TEXT,
    "relatedAction" TEXT,
    "notificationType" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'BOTH',
    "recipientRoles" TEXT[],
    "customRecipients" TEXT[],
    "templateSubject" TEXT,
    "templateBody" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "frequencyHours" INTEGER,
    "escalationAfterDays" INTEGER,
    "escalationRecipient" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "invoiceId" TEXT,
    "userId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "validationErrors" JSONB,
    "importLog" JSONB,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "previousValues" JSONB,
    "newValues" JSONB,
    "changeReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_microsoftUserId_key" ON "users"("microsoftUserId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_accountStatus_idx" ON "users"("accountStatus");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionId_key" ON "role_permissions"("role", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_region_assignments_userId_regionId_key" ON "user_region_assignments"("userId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_site_assignments_userId_siteId_key" ON "user_site_assignments"("userId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_clientCode_key" ON "clients"("clientCode");

-- CreateIndex
CREATE INDEX "clients_clientCode_idx" ON "clients"("clientCode");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "regions_regionCode_key" ON "regions"("regionCode");

-- CreateIndex
CREATE INDEX "regions_regionCode_idx" ON "regions"("regionCode");

-- CreateIndex
CREATE INDEX "regions_status_idx" ON "regions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sites_siteCode_key" ON "sites"("siteCode");

-- CreateIndex
CREATE INDEX "sites_clientId_idx" ON "sites"("clientId");

-- CreateIndex
CREATE INDEX "sites_regionId_idx" ON "sites"("regionId");

-- CreateIndex
CREATE INDEX "sites_status_idx" ON "sites"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contractNumber_key" ON "contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "contracts_clientId_idx" ON "contracts"("clientId");

-- CreateIndex
CREATE INDEX "billing_projections_financialYear_idx" ON "billing_projections"("financialYear");

-- CreateIndex
CREATE INDEX "billing_projections_billingMonth_idx" ON "billing_projections"("billingMonth");

-- CreateIndex
CREATE INDEX "billing_projections_clientId_idx" ON "billing_projections"("clientId");

-- CreateIndex
CREATE INDEX "billing_projections_regionId_idx" ON "billing_projections"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_projections_siteId_billingMonth_key" ON "billing_projections"("siteId", "billingMonth");

-- CreateIndex
CREATE INDEX "projection_revisions_projectionId_idx" ON "projection_revisions"("projectionId");

-- CreateIndex
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");

-- CreateIndex
CREATE INDEX "invoices_regionId_idx" ON "invoices"("regionId");

-- CreateIndex
CREATE INDEX "invoices_siteId_idx" ON "invoices"("siteId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_billingMonth_idx" ON "invoices"("billingMonth");

-- CreateIndex
CREATE INDEX "invoices_financialYear_idx" ON "invoices"("financialYear");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_isCancelled_idx" ON "invoices"("isCancelled");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_clientId_key" ON "invoices"("invoiceNumber", "clientId");

-- CreateIndex
CREATE INDEX "invoice_documents_invoiceId_idx" ON "invoice_documents"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_submission_events_invoiceId_idx" ON "invoice_submission_events"("invoiceId");

-- CreateIndex
CREATE INDEX "submission_targets_siteId_idx" ON "submission_targets"("siteId");

-- CreateIndex
CREATE INDEX "submission_targets_billingMonth_idx" ON "submission_targets"("billingMonth");

-- CreateIndex
CREATE UNIQUE INDEX "submission_targets_siteId_billingMonth_key" ON "submission_targets"("siteId", "billingMonth");

-- CreateIndex
CREATE INDEX "payment_terms_overrides_clientId_idx" ON "payment_terms_overrides"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_receiptReference_key" ON "payment_receipts"("receiptReference");

-- CreateIndex
CREATE INDEX "payment_receipts_clientId_idx" ON "payment_receipts"("clientId");

-- CreateIndex
CREATE INDEX "payment_receipts_receiptDate_idx" ON "payment_receipts"("receiptDate");

-- CreateIndex
CREATE INDEX "payment_allocations_receiptId_idx" ON "payment_allocations"("receiptId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_key" ON "credit_notes"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "collection_followups_invoiceId_idx" ON "collection_followups"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "email_integrations_userId_key" ON "email_integrations"("userId");

-- CreateIndex
CREATE INDEX "email_activity_invoiceId_idx" ON "email_activity"("invoiceId");

-- CreateIndex
CREATE INDEX "email_activity_siteId_idx" ON "email_activity"("siteId");

-- CreateIndex
CREATE INDEX "email_activity_sentAt_idx" ON "email_activity"("sentAt");

-- CreateIndex
CREATE INDEX "notification_rules_triggerEvent_idx" ON "notification_rules"("triggerEvent");

-- CreateIndex
CREATE INDEX "notification_logs_invoiceId_idx" ON "notification_logs"("invoiceId");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE INDEX "import_jobs_importType_idx" ON "import_jobs"("importType");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_recordType_idx" ON "audit_logs"("recordType");

-- CreateIndex
CREATE INDEX "audit_logs_recordId_idx" ON "audit_logs"("recordId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "public_holidays_year_idx" ON "public_holidays"("year");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_date_region_key" ON "public_holidays"("date", "region");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_region_assignments" ADD CONSTRAINT "user_region_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_region_assignments" ADD CONSTRAINT "user_region_assignments_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_projections" ADD CONSTRAINT "billing_projections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_projections" ADD CONSTRAINT "billing_projections_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_projections" ADD CONSTRAINT "billing_projections_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_projections" ADD CONSTRAINT "billing_projections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projection_revisions" ADD CONSTRAINT "projection_revisions_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "billing_projections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projection_revisions" ADD CONSTRAINT "projection_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "billing_projections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_submission_events" ADD CONSTRAINT "invoice_submission_events_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_targets" ADD CONSTRAINT "submission_targets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms_overrides" ADD CONSTRAINT "payment_terms_overrides_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "payment_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_followups" ADD CONSTRAINT "collection_followups_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_followups" ADD CONSTRAINT "collection_followups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_integrations" ADD CONSTRAINT "email_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_activity" ADD CONSTRAINT "email_activity_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "notification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

