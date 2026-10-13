/**
 * GTS Invoice System — Database Seed
 * Safe to re-run: uses upsert to avoid duplicates.
 * Seeds: regions (8), demo client (Hyundai Materials), system settings, permissions, default admin user.
 */

import { PrismaClient, UserRole, EntityStatus, PaymentTermsTrigger } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const REGIONS = [
  { regionCode: 'CHN-CORP', name: 'Chennai - Corporate' },
  { regionCode: 'KER', name: 'Kerala' },
  { regionCode: 'HYD', name: 'Hyderabad' },
  { regionCode: 'BLR', name: 'Bangalore' },
  { regionCode: 'DEL', name: 'Delhi' },
  { regionCode: 'RAJ', name: 'Rajasthan' },
  { regionCode: 'MUM', name: 'Mumbai' },
  { regionCode: 'PAN-IND', name: 'Pan-India' },
];

const PERMISSIONS = [
  // Dashboard
  { code: 'DASHBOARD_VIEW', name: 'View Dashboard', module: 'DASHBOARD' },
  // Projections
  { code: 'PROJECTION_VIEW', name: 'View Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_CREATE', name: 'Create Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_EDIT', name: 'Edit Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_REVISE', name: 'Revise Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_APPROVE', name: 'Approve Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_IMPORT', name: 'Import Projections', module: 'PROJECTIONS' },
  // Invoices
  { code: 'INVOICE_VIEW', name: 'View Invoices', module: 'INVOICES' },
  { code: 'INVOICE_CREATE', name: 'Create Invoices', module: 'INVOICES' },
  { code: 'INVOICE_EDIT', name: 'Edit Invoices', module: 'INVOICES' },
  { code: 'INVOICE_SUBMIT', name: 'Submit Invoices', module: 'INVOICES' },
  { code: 'INVOICE_APPROVE', name: 'Approve Invoices', module: 'INVOICES' },
  { code: 'INVOICE_CANCEL', name: 'Cancel Invoices', module: 'INVOICES' },
  { code: 'INVOICE_UPLOAD_DOC', name: 'Upload Invoice Documents', module: 'INVOICES' },
  // Submission
  { code: 'SUBMISSION_VIEW', name: 'View Submission Tracker', module: 'SUBMISSION' },
  { code: 'SUBMISSION_UPDATE', name: 'Update Submission Records', module: 'SUBMISSION' },
  // Payments
  { code: 'PAYMENT_VIEW', name: 'View Payments', module: 'PAYMENTS' },
  { code: 'PAYMENT_CREATE', name: 'Record Payments', module: 'PAYMENTS' },
  { code: 'PAYMENT_ALLOCATE', name: 'Allocate Payments', module: 'PAYMENTS' },
  { code: 'PAYMENT_EDIT', name: 'Edit Payment Records', module: 'PAYMENTS' },
  // DSO
  { code: 'DSO_VIEW', name: 'View DSO Dashboard', module: 'DSO' },
  // Masters
  { code: 'CLIENT_VIEW', name: 'View Clients', module: 'MASTERS' },
  { code: 'CLIENT_MANAGE', name: 'Manage Clients', module: 'MASTERS' },
  { code: 'REGION_VIEW', name: 'View Regions', module: 'MASTERS' },
  { code: 'REGION_MANAGE', name: 'Manage Regions', module: 'MASTERS' },
  { code: 'SITE_VIEW', name: 'View Sites', module: 'MASTERS' },
  { code: 'SITE_MANAGE', name: 'Manage Sites', module: 'MASTERS' },
  { code: 'USER_VIEW', name: 'View Users', module: 'USERS' },
  { code: 'USER_MANAGE', name: 'Manage Users', module: 'USERS' },
  // Reports
  { code: 'REPORT_VIEW', name: 'View Reports', module: 'REPORTS' },
  { code: 'REPORT_EXPORT', name: 'Export Reports', module: 'REPORTS' },
  // Collections
  { code: 'COLLECTION_VIEW', name: 'View Collections', module: 'COLLECTIONS' },
  { code: 'COLLECTION_FOLLOWUP', name: 'Add Collection Follow-ups', module: 'COLLECTIONS' },
  { code: 'COLLECTION_REMARKS', name: 'Add Collection Remarks', module: 'COLLECTIONS' },
  // Email
  { code: 'EMAIL_CONNECT', name: 'Connect Email Integration', module: 'EMAIL' },
  { code: 'EMAIL_VIEW', name: 'View Email Activity', module: 'EMAIL' },
  // Audit
  { code: 'AUDIT_VIEW', name: 'View Audit Logs', module: 'AUDIT' },
  // Settings
  { code: 'SETTINGS_VIEW', name: 'View Settings', module: 'SETTINGS' },
  { code: 'SETTINGS_MANAGE', name: 'Manage Settings', module: 'SETTINGS' },
];

// Default permission grants per role (all permissions granted to SUPER_ADMIN handled programmatically)
const ROLE_PERMISSIONS: Record<string, string[]> = {
  CENTRAL_BILLING: [
    'DASHBOARD_VIEW', 'PROJECTION_VIEW', 'PROJECTION_CREATE', 'PROJECTION_EDIT',
    'PROJECTION_REVISE', 'PROJECTION_IMPORT', 'INVOICE_VIEW', 'INVOICE_CREATE',
    'INVOICE_EDIT', 'INVOICE_SUBMIT', 'INVOICE_UPLOAD_DOC', 'SUBMISSION_VIEW',
    'SUBMISSION_UPDATE', 'PAYMENT_VIEW', 'PAYMENT_CREATE', 'REPORT_VIEW', 'REPORT_EXPORT',
    'CLIENT_VIEW', 'REGION_VIEW', 'SITE_VIEW', 'COLLECTION_VIEW', 'COLLECTION_FOLLOWUP',
    'COLLECTION_REMARKS', 'EMAIL_VIEW',
  ],
  REGIONAL_OPERATIONS: [
    'DASHBOARD_VIEW', 'PROJECTION_VIEW', 'INVOICE_VIEW', 'INVOICE_UPLOAD_DOC',
    'SUBMISSION_VIEW', 'PAYMENT_VIEW', 'REPORT_VIEW', 'CLIENT_VIEW', 'REGION_VIEW',
    'SITE_VIEW', 'COLLECTION_VIEW', 'COLLECTION_REMARKS', 'EMAIL_VIEW',
  ],
  FINANCE_COLLECTIONS: [
    'DASHBOARD_VIEW', 'INVOICE_VIEW', 'SUBMISSION_VIEW', 'PAYMENT_VIEW', 'PAYMENT_CREATE',
    'PAYMENT_ALLOCATE', 'PAYMENT_EDIT', 'DSO_VIEW', 'REPORT_VIEW', 'REPORT_EXPORT',
    'CLIENT_VIEW', 'REGION_VIEW', 'SITE_VIEW', 'COLLECTION_VIEW', 'COLLECTION_FOLLOWUP',
    'COLLECTION_REMARKS', 'EMAIL_VIEW',
  ],
  MANAGEMENT: [
    'DASHBOARD_VIEW', 'PROJECTION_VIEW', 'INVOICE_VIEW', 'SUBMISSION_VIEW',
    'PAYMENT_VIEW', 'DSO_VIEW', 'REPORT_VIEW', 'REPORT_EXPORT', 'CLIENT_VIEW',
    'REGION_VIEW', 'SITE_VIEW', 'COLLECTION_VIEW', 'AUDIT_VIEW',
  ],
};

const SYSTEM_SETTINGS = [
  { key: 'DEFAULT_TIMEZONE', value: 'Asia/Kolkata', description: 'Default display timezone' },
  { key: 'DEFAULT_CURRENCY', value: 'INR', description: 'Default invoice currency' },
  { key: 'FINANCIAL_YEAR_START_MONTH', value: '4', description: 'Month number (1-12) when financial year starts' },
  { key: 'SUBMISSION_WARNING_DAYS', value: '3', description: 'Days before target to show submission warning' },
  { key: 'VARIANCE_TOLERANCE_PERCENT', value: '5', description: 'Billing variance % above which remarks are mandatory' },
  { key: 'PAYMENT_DUE_REMINDER_DAYS', value: '7', description: 'Days before due date to send reminder' },
  { key: 'OVERDUE_ESCALATION_DAYS', value: '30', description: 'Days overdue before escalation email is triggered' },
  { key: 'MAX_UPLOAD_SIZE_MB', value: '25', description: 'Maximum document upload size in MB' },
  { key: 'ALLOWED_FILE_TYPES', value: 'application/pdf,image/jpeg,image/png,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'Allowed MIME types for document uploads' },
  { key: 'PROJECTION_APPROVAL_ENABLED', value: 'false', description: 'Enable projection approval workflow' },
  { key: 'INVOICE_APPROVAL_ENABLED', value: 'false', description: 'Enable invoice approval workflow before submission' },
  { key: 'DSO_EXCLUDE_GST', value: 'true', description: 'Exclude GST from DSO calculation receivables and credit sales' },
  { key: 'AGEING_BUCKET_1', value: '30', description: 'Ageing bucket 1 upper limit (days)' },
  { key: 'AGEING_BUCKET_2', value: '60', description: 'Ageing bucket 2 upper limit (days)' },
  { key: 'AGEING_BUCKET_3', value: '90', description: 'Ageing bucket 3 upper limit (days)' },
  { key: 'AGEING_BUCKET_4', value: '120', description: 'Ageing bucket 4 upper limit (days)' },
  { key: 'ORGANISATION_NAME', value: 'GTS Facility Management Services Pvt. Ltd.', description: 'Organisation legal name' },
  { key: 'ORGANISATION_SHORT_NAME', value: 'GTS', description: 'Short name for reports and emails' },
];

async function main() {
  console.log('🌱 Starting GTS seed...');

  // ── System Settings ────────────────────────────────────────────────────────
  console.log('  → Seeding system settings...');
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  // ── Permissions ───────────────────────────────────────────────────────────
  console.log('  → Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  // ── Role Permissions ──────────────────────────────────────────────────────
  console.log('  → Seeding role permissions...');
  const allPermissions = await prisma.permission.findMany();
  const permMap = Object.fromEntries(allPermissions.map((p) => [p.code, p.id]));

  // Super admin gets all permissions
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { role_permissionId: { role: 'SUPER_ADMIN', permissionId: perm.id } },
      update: { granted: true },
      create: { role: 'SUPER_ADMIN', permissionId: perm.id, granted: true },
    });
  }

  // Other roles
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of codes) {
      const permId = permMap[code];
      if (!permId) continue;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as any, permissionId: permId } },
        update: { granted: true },
        create: { role: role as any, permissionId: permId, granted: true },
      });
    }
  }

  // ── Regions ───────────────────────────────────────────────────────────────
  console.log('  → Seeding regions...');
  for (const region of REGIONS) {
    await prisma.region.upsert({
      where: { regionCode: region.regionCode },
      update: { name: region.name },
      create: { ...region, status: 'ACTIVE' },
    });
  }

  // ── Demo Client: Hyundai Materials ────────────────────────────────────────
  console.log('  → Seeding demo client: Hyundai Materials...');
  await prisma.client.upsert({
    where: { clientCode: 'HYU-MAT-DEMO' },
    update: {},
    create: {
      clientCode: 'HYU-MAT-DEMO',
      name: 'Hyundai Materials',
      billingAddress: '[DEMO] Please update with actual billing address',
      billingContactName: '[DEMO] Contact',
      billingContactEmail: 'demo@hyundaimaterials.com',
      paymentTermsDays: 45,
      paymentTermsTrigger: PaymentTermsTrigger.SUBMISSION_DATE,
      currency: 'INR',
      status: EntityStatus.ACTIVE,
      isDemo: true,
      remarks: '⚠️ DEMO DATA — Created during initial seed. Update all details before live use.',
    },
  });

  // ── Default Super Admin ───────────────────────────────────────────────────
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@gts.co.in';
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'GTS@Admin2024!';
  const hash = await bcrypt.hash(defaultAdminPassword, 12);

  console.log('  → Seeding default super admin...');
  await prisma.user.upsert({
    where: { email: defaultAdminEmail },
    update: {},
    create: {
      name: 'GTS Administrator',
      email: defaultAdminEmail,
      passwordHash: hash,
      role: UserRole.SUPER_ADMIN,
      accountStatus: 'ACTIVE',
      department: 'Administration',
      designation: 'System Administrator',
    },
  });

  console.log('✅ Seed completed successfully.');
  console.log(`   Default admin: ${defaultAdminEmail}`);
  console.log('   ⚠️  Change the default admin password immediately after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
