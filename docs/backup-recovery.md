# PostgreSQL Database Backup & Disaster Recovery Guide

## Render-Managed PostgreSQL

The GTS Invoice-to-Collection Management System utilizes a dedicated PostgreSQL instance on Render.

### Automated Backups
Render Managed PostgreSQL (Starter tier and higher) includes automated daily snapshots retained for 7 days.
- Point-in-time recovery is supported via the Render Dashboard.
- Database logs can be inspected under the **Logs** tab of the PostgreSQL service.

---

## Manual Backup Procedures

### 1. Creating a Full SQL Dump
Ensure you have the `DATABASE_URL` from Render environment variables. Run the following command from an authorized administrative workstation:

```bash
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > gts_backup_$(date +%Y%m%d_%H%M%S).dump
```

To create a plain-text SQL script instead:
```bash
pg_dump --no-owner --no-privileges "$DATABASE_URL" > gts_backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Scheduled Cron Backup (Recommended)
You can configure a periodic backup job using a GitHub Action or Render Cron Service that uploads encrypted backups to private Cloud Storage (e.g. AWS S3 or Google Cloud Storage).

---

## Disaster Recovery & Restoration

### 1. Restoring from a Custom Format Dump (.dump)
```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" gts_backup_20261013_120000.dump
```

### 2. Restoring from a Plain SQL File (.sql)
```bash
psql "$DATABASE_URL" < gts_backup_20261013_120000.sql
```

### 3. Verification Post-Restore
After restoring, run the following health checks:
1. Verify database connectivity:
   ```bash
   curl https://your-backend.onrender.com/health
   ```
2. Verify master seed idempotency:
   ```bash
   npm run prisma:seed
   ```
3. Check table counts to ensure no orphaned transactions:
   ```sql
   SELECT COUNT(*) FROM invoices;
   SELECT COUNT(*) FROM billing_projections;
   SELECT COUNT(*) FROM payment_receipts;
   ```
