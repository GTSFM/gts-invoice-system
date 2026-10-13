# GTS Invoice-to-Collection Management System

> Production-ready invoice lifecycle management system for **GTS Facility Management Services Pvt. Ltd.**

![GTS Logo](docs/assets/gts-logo.png)

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Quick Start (Development)](#quick-start)
5. [Environment Variables](#environment-variables)
6. [Database Migrations](#database-migrations)
7. [Deployment on Render](#deployment-on-render)
8. [Microsoft Outlook Integration](#microsoft-outlook-integration)
9. [Backup & Recovery](#backup--recovery)
10. [API Documentation](#api-documentation)
11. [Testing](#testing)
12. [User Roles](#user-roles)

---

## Overview

This application manages the entire commercial billing lifecycle for GTS:

- Annual and monthly site-wise billing projections
- Monthly billing planning and target setting
- Invoice preparation, raising, and status tracking
- Actual vs projected billing analysis
- Invoice submission target vs actual date tracking
- Payment receipts, outstanding balance tracking
- Invoice ageing, overdue monitoring, and DSO calculation
- Microsoft Outlook email integration
- Management dashboards and downloadable reports

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   React 18 + Vite   │────▶│ Node.js + Express API │────▶│   PostgreSQL     │
│   TypeScript        │     │ TypeScript + Prisma   │     │   (Render)       │
│   Tailwind CSS      │     │                       │     │                  │
│   React Query       │     │ ┌──────────────────┐  │     └──────────────────┘
│   React Hook Form   │     │ │  Microsoft Graph  │  │
└─────────────────────┘     │ │  API (Optional)   │  │     ┌──────────────────┐
                             │ └──────────────────┘  │────▶│  Cloudinary /    │
                             │                       │     │  S3 (Documents)  │
                             └──────────────────────┘     └──────────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | SPA with responsive UI |
| Styling | Tailwind CSS | Utility-first, maintainable |
| State | React Query + Context | Server + auth state |
| Backend | Node.js + Express + TypeScript | REST API |
| ORM | Prisma | Type-safe DB access, migrations |
| Database | PostgreSQL | ACID, financial precision |
| Auth | JWT + bcrypt | Secure sessions |
| Email | Microsoft Graph API | Optional Outlook integration |
| Storage | Cloudinary / S3 | Persistent document storage |
| Deployment | Render | Managed hosting |

### Architecture Decisions

- **Decimal(15,2)** for all monetary values — no floating-point arithmetic
- **UUID primary keys** — non-guessable, distributed-safe
- **UTC timestamps** — stored UTC, displayed in IST (Asia/Kolkata)
- **Soft deletes** — records with transactions are never physically deleted
- **Immutable audit logs** — no UPDATE/DELETE on audit_logs for non-superadmin
- **Projection independence** — projections never auto-update from invoice actuals

---

## Features

### Phase 1 — Masters & Access Control ✅
- 5 user roles with configurable permissions (API-enforced)
- Client, Region, Site, Contract management
- 8 pre-seeded regions, 1 demo client (Hyundai Materials)

### Phase 2 — Billing Projections ✅
- Manual monthly projections per site
- Revision history with audit trail
- Variance calculation (actual vs projected)
- Missing projection alerts
- Bulk import via Excel

### Phase 3 — Invoice Management ✅
- 14 invoice statuses with validated transitions
- Document upload and management
- Submission tracking and events
- Duplicate invoice number prevention

### Phase 4 — Submission Tracking ✅
- Site-specific and client-specific target dates
- Compliance KPIs (on-time%, late, overdue)
- Configurable warning window (default 3 days)

### Phase 5 — Collections & DSO ✅
- Payment terms (Net 15/30/45/60/custom)
- Configurable due date trigger
- Multi-invoice payment allocation
- Ageing buckets (6 tiers)
- Portfolio DSO with formula transparency

### Phase 6 — Dashboards & Exports ✅
- 12 executive KPI cards
- Excel, CSV, PDF exports
- 13 report types
- Import with preview and validation

### Phase 7 — Outlook Integration ✅
- Microsoft Entra ID OAuth 2.0
- Application works fully without Outlook configured
- Email activity register
- Configurable notification rules

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm 9+

### 1. Clone and install
```bash
git clone https://github.com/YOUR_ORG/gts-invoice-system.git
cd gts-invoice-system

# Backend
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets
npm install

# Frontend
cd ../frontend
cp .env.example .env
npm install
```

### 2. Setup database
```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
npm run prisma:seed
```

### 3. Run development servers
```bash
# Backend (from /backend)
npm run dev

# Frontend (from /frontend)
npm run dev
```

Backend runs on **http://localhost:5000**  
Frontend runs on **http://localhost:5173**

Default admin: `admin@gts.co.in` / `GTS@Admin2024!`  
⚠️ **Change this password immediately after first login.**

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list.

**Required:**
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 64 random characters |
| `REFRESH_TOKEN_SECRET` | Min 64 random characters |

**Optional (Outlook integration):**
| Variable | Description |
|---|---|
| `MICROSOFT_CLIENT_ID` | Azure app registration client ID |
| `MICROSOFT_CLIENT_SECRET` | Azure app registration client secret |
| `MICROSOFT_TENANT_ID` | Azure tenant ID |
| `MICROSOFT_REDIRECT_URI` | OAuth redirect URL |

**Never commit `.env` to source control.**

---

## Database Migrations

```bash
# Development — creates migration file + applies
npx prisma migrate dev --name <description>

# Production — applies pending migrations only (no dev tooling)
npx prisma migrate deploy

# Reset (development only — destroys data)
npx prisma migrate reset

# Re-run seed (safe — uses upsert)
npm run prisma:seed
```

---

## Deployment on Render

### Deployment Checklist

- [ ] 1. Create GitHub repository and push complete source code
- [ ] 2. Log in to Render dashboard
- [ ] 3. Create PostgreSQL database (plan: Starter or above)
- [ ] 4. Create Backend Web Service from GitHub repo
  - Root: `backend`
  - Build: `npm install && npm run build && npx prisma generate`
  - Start: `npx prisma migrate deploy && npm start`
  - Health check: `/health`
- [ ] 5. Set all environment variables in Render dashboard
- [ ] 6. Deploy backend — verify `/health` returns `{"status":"ok"}`
- [ ] 7. SSH into backend service and run: `npm run prisma:seed`
- [ ] 8. Create Frontend Static Site from GitHub repo
  - Root: `frontend`
  - Build: `npm install && npm run build`
  - Publish: `dist`
  - Set `VITE_API_URL` to backend service URL
- [ ] 9. Configure `CORS_ORIGINS` in backend to include frontend URL
- [ ] 10. Run smoke tests (login, create region, create projection)
- [ ] 11. Configure Microsoft Entra app registration (optional, for Outlook)
- [ ] 12. Verify persistent data after redeployment

### Important Notes
- Render free tier instances sleep after 15 minutes of inactivity — use Starter plan for production
- Document uploads must use Cloudinary or S3 (not ephemeral filesystem)
- Database backup: Render Starter PostgreSQL includes daily backups for 7 days

---

## Microsoft Outlook Integration

See [`docs/graph-integration.md`](docs/graph-integration.md) for full setup.

**Summary:**
1. Register app in Microsoft Entra ID (Azure Portal)
2. Add delegated permissions: `Mail.Send`, `Mail.Read`, `offline_access`
3. Set redirect URI to `YOUR_BACKEND_URL/api/auth/microsoft/callback`
4. Add credentials to environment variables
5. Each user connects their mailbox through the Outlook Integration page

The application works fully without Outlook configured. When credentials are absent, the integration page shows "Not Configured" status.

---

## Backup & Recovery

See [`docs/backup-recovery.md`](docs/backup-recovery.md) for full procedures.

**Quick backup:**
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Restore:**
```bash
psql $DATABASE_URL < backup_20260101_120000.sql
```

---

## API Documentation

See [`docs/api.md`](docs/api.md) for complete endpoint reference.

Base URL: `https://YOUR_BACKEND_URL/api`

All endpoints (except `/auth/login` and `/health`) require:
```
Authorization: Bearer <jwt_token>
```

---

## Testing

```bash
cd backend
npm test                  # Run all tests
npm test -- --watch       # Watch mode
npm test -- --coverage    # Coverage report
```

Test scenarios covered:
1. Projection creation and revision
2. Variance calculation (under/over-billing)
3. Submission delay calculation
4. Due date calculation from configured trigger
5. Partial payment allocation
6. DSO calculation
7. Region management with historical data
8. Data export accuracy
9. Access control (region-scoped)
10. Duplicate invoice rejection
11. Cancelled invoice handling
12. Data persistence after redeploy

---

## User Roles

| Role | Access |
|---|---|
| **Super Administrator** | Full access, all modules |
| **Central Billing Team** | Create/manage invoices, projections, documents |
| **Regional Operations** | View assigned regions, provide inputs |
| **Finance/Collections** | Payments, DSO, collection follow-ups |
| **Management** | Read-only dashboards and reports |

---

## Financial Year

Default: **April–March** (configurable in System Settings).

Financial year format: `"2025-26"` for April 2025 – March 2026.  
Billing month format: `"YYYY-MM"` (e.g., `"2025-06"` for June 2025).

---

## Currency & Date Formats

- **Currency:** INR, formatted as `₹1,25,000.00` (Indian number system)
- **Dates:** `DD-MMM-YYYY` (e.g., `13-Oct-2026`)
- **Timestamps:** UTC stored, IST displayed

---

*Built for GTS Facility Management Services Pvt. Ltd. — Version 1.0.0*
