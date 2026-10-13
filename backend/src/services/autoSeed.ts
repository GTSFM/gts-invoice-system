import { prisma } from '../config/database';
import { UserRole, EntityStatus, PaymentTermsTrigger } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  { code: 'DASHBOARD_VIEW', name: 'View Dashboard', module: 'DASHBOARD' },
  { code: 'PROJECTION_VIEW', name: 'View Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_CREATE', name: 'Create Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_EDIT', name: 'Edit Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_REVISE', name: 'Revise Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_APPROVE', name: 'Approve Projections', module: 'PROJECTIONS' },
  { code: 'PROJECTION_IMPORT', name: 'Import Projections', module: 'PROJECTIONS' },
  { code: 'INVOICE_VIEW', name: 'View Invoices', module: 'INVOICES' },
  { code: 'INVOICE_CREATE', name: 'Create Invoices', module: 'INVOICES' },
  { code: 'INVOICE_EDIT', name: 'Edit Invoices', module: 'INVOICES' },
  { code: 'INVOICE_SUBMIT', name: 'Submit Invoices', module: 'INVOICES' },
  { code: 'INVOICE_APPROVE', name: 'Approve Invoices', module: 'INVOICES' },
  { code: 'INVOICE_CANCEL', name: 'Cancel Invoices', module: 'INVOICES' },
  { code: 'INVOICE_UPLOAD_DOC', name: 'Upload Invoice Documents', module: 'INVOICES' },
  { code: 'SUBMISSION_VIEW', name: 'View Submission Tracker', module: 'SUBMISSION' },
  { code: 'SUBMISSION_UPDATE', name: 'Update Submission Records', module: 'SUBMISSION' },
  { code: 'PAYMENT_VIEW', name: 'View Payments', module: 'PAYMENTS' },
  { code: 'PAYMENT_CREATE', name: 'Create Payment Receipts', module: 'PAYMENTS' },
  { code: 'PAYMENT_ALLOCATE', name: 'Allocate Payments', module: 'PAYMENTS' },
  { code: 'DSO_VIEW', name: 'View DSO and Ageing Reports', module: 'DSO' },
  { code: 'REPORT_VIEW', name: 'View Reports', module: 'REPORTS' },
  { code: 'REPORT_EXPORT', name: 'Export Reports', module: 'REPORTS' },
  { code: 'REGION_MANAGE', name: 'Manage Regions', module: 'ADMIN' },
  { code: 'CLIENT_MANAGE', name: 'Manage Clients', module: 'ADMIN' },
  { code: 'SITE_MANAGE', name: 'Manage Sites', module: 'ADMIN' },
  { code: 'USER_MANAGE', name: 'Manage Users', module: 'ADMIN' },
  { code: 'SETTINGS_VIEW', name: 'View Settings', module: 'SETTINGS' },
  { code: 'SETTINGS_MANAGE', name: 'Manage Settings', module: 'SETTINGS' },
  { code: 'AUDIT_VIEW', name: 'View Audit Logs', module: 'AUDIT' },
  { code: 'EMAIL_CONNECT', name: 'Connect Email Integration', module: 'EMAIL' },
];

const SYSTEM_SETTINGS = [
  { key: 'DSO_EXCLUDE_GST', value: 'true', description: 'Exclude GST from DSO calculation by default' },
  { key: 'SUBMISSION_WARNING_DAYS', value: '3', description: 'Days before target date to flag as Due Soon' },
  { key: 'DEFAULT_PAYMENT_TERMS_DAYS', value: '45', description: 'Default payment terms in days' },
  { key: 'DEFAULT_PAYMENT_TERMS_TRIGGER', value: 'SUBMISSION_DATE', description: 'Default trigger: SUBMISSION_DATE or INVOICE_DATE' },
  { key: 'VARIANCE_TOLERANCE_PERCENT', value: '5', description: 'Variance tolerance threshold % before flagging' },
  { key: 'NOTIFICATION_EMAIL_ENABLED', value: 'false', description: 'Enable outbound email notifications' },
  { key: 'AUDIT_LOG_RETENTION_DAYS', value: '2555', description: 'Audit log retention period (7 years in days)' },
  { key: 'MAX_UPLOAD_FILE_SIZE_MB', value: '25', description: 'Maximum allowed invoice attachment size in MB' },
  { key: 'ALLOWED_FILE_TYPES', value: 'pdf,jpg,jpeg,png,docx,xlsx', description: 'Comma-separated allowed file extensions' },
  { key: 'REPORT_ORGANIZATION_NAME', value: 'GTS Facility Management Services Pvt. Ltd.', description: 'Organization name printed on certified reports' },
  { key: 'REPORT_PRIMARY_COLOR', value: '#3B2A7A', description: 'Primary brand color hex code for report headers' },
];

export async function autoSeedDatabase(): Promise<void> {
  try {
    console.log('[AutoSeed] Verifying initial seed data and admin account on startup...');

    // 1. Regions
    for (const region of REGIONS) {
      await prisma.region.upsert({
        where: { regionCode: region.regionCode },
        update: {},
        create: {
          regionCode: region.regionCode,
          name: region.name,
          status: EntityStatus.ACTIVE,
        },
      });
    }

    // 2. Permissions
    for (const perm of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { code: perm.code },
        update: {},
        create: perm,
      });
    }

    // 3. Settings
    for (const setting of SYSTEM_SETTINGS) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: {},
        create: setting,
      });
    }

    // 4. Demo Client: Hyundai Materials
    await prisma.client.upsert({
      where: { clientCode: 'HYU-MAT-DEMO' },
      update: {},
      create: {
        clientCode: 'HYU-MAT-DEMO',
        name: 'Hyundai Materials',
        billingAddress: '[DEMO] Sriperumbudur Industrial Park, Chennai, Tamil Nadu',
        billingContactName: '[DEMO] Accounts Payable Team',
        billingContactEmail: 'demo@hyundaimaterials.com',
        paymentTermsDays: 45,
        paymentTermsTrigger: PaymentTermsTrigger.SUBMISSION_DATE,
        currency: 'INR',
        status: EntityStatus.ACTIVE,
        isDemo: true,
        remarks: '⚠️ DEMO DATA — Created during initial seed. Update all details before live use.',
      },
    });

    // 5. Default Super Admin
    const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@gts.co.in';
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'GTS@Admin2024!';
    const hash = await bcrypt.hash(defaultAdminPassword, 12);

    await prisma.user.upsert({
      where: { email: defaultAdminEmail },
      update: {
        passwordHash: hash,
        accountStatus: 'ACTIVE',
      },
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

    console.log(`[AutoSeed] ✅ Auto-seed completed! Default admin: ${defaultAdminEmail}`);
  } catch (err) {
    console.error('[AutoSeed] Error during autoSeedDatabase:', err);
  }
}
