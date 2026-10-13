# GTS Invoice-to-Collection Management System — REST API Documentation

**Base URL:** `https://your-backend.onrender.com/api` (Production) or `http://localhost:5000/api` (Local)  
**Authentication:** JWT Bearer Token in `Authorization` header:
```
Authorization: Bearer <jwt_access_token>
```

---

## 1. Authentication & Session (`/api/auth`)

### `POST /api/auth/login`
Authenticates a user and issues an access token and refresh token.
- **Request Body:**
  ```json
  {
    "email": "admin@gts.co.in",
    "password": "your-secure-password"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "id": "uuid-v4",
      "name": "GTS Administrator",
      "email": "admin@gts.co.in",
      "role": "SUPER_ADMIN",
      "department": "Administration",
      "designation": "System Administrator",
      "m365Connected": false
    }
  }
  ```

### `POST /api/auth/refresh`
Exchanges a valid refresh token for a fresh access token.

### `POST /api/auth/logout` *(Authenticated)*
Revokes the refresh token and terminates the session.

### `GET /api/auth/me` *(Authenticated)*
Fetches profile details, roles, permissions, and assigned operating regions.

---

## 2. Monthly Billing Projections (`/api/projections`)

### `GET /api/projections`
Lists billing projections with filters and variance calculations.
- **Query Parameters:** `financialYear` (e.g. `2025-26`), `billingMonth` (e.g. `2025-06`), `clientId`, `regionId`, `siteId`, `page`, `limit`
- **Response Item Structure:**
  ```json
  {
    "id": "uuid",
    "financialYear": "2025-26",
    "billingMonth": "2025-06",
    "projectedAmountExGst": "500000.00",
    "projectedGst": "90000.00",
    "projectedTotal": "590000.00",
    "actualBilling": "450000.00",
    "variance": -50000.00,
    "variancePct": -10.0,
    "status": "UNDERBILLING",
    "isLocked": false,
    "isApproved": false,
    "client": { "name": "Hyundai Materials" },
    "site": { "name": "Chennai Plant 1", "siteCode": "CHN-FAC-01" },
    "region": { "name": "Chennai - Corporate" }
  }
  ```

### `POST /api/projections` *(Permission: `PROJECTION_CREATE`)*
Records a new monthly site projection.
- **Request Body:**
  ```json
  {
    "siteId": "uuid",
    "billingMonth": "2025-06",
    "financialYear": "2025-26",
    "projectedAmountExGst": 500000.0,
    "projectedGst": 90000.0,
    "remarks": "Standard contractual scope"
  }
  ```

### `PUT /api/projections/:id` *(Permission: `PROJECTION_REVISE`)*
Revises a projection. **Mandatory:** requires `revisionReason` which generates an immutable `ProjectionRevision` and audit trail.

---

## 3. Commercial Invoices (`/api/invoices`)

### `GET /api/invoices`
Lists commercial invoices with filtering and pagination.
- **Query Parameters:** `status`, `financialYear`, `billingMonth`, `clientId`, `regionId`, `search`

### `POST /api/invoices` *(Permission: `INVOICE_CREATE`)*
Creates a new tax invoice in `DRAFT` status. Automatically verifies site activity and calculates payment due dates when submission targets and client terms are present.

### `PATCH /api/invoices/:id/submit` *(Permission: `INVOICE_SUBMIT`)*
Records actual client submission:
- Sets `actualSubmissionDate` and transmission channel.
- Transitions status to `SUBMITTED_TO_CLIENT`.
- Calculates contractual `dueDate` from configured trigger date.
- Creates an `InvoiceSubmissionEvent`.

### `PATCH /api/invoices/:id/acknowledge`
Records formal client acknowledgement and sets status to `ACKNOWLEDGED`.

### `PATCH /api/invoices/:id/status`
Transitions invoice status through validated lifecycle stages. If cancelling, requires `cancellationReason` and sets `isCancelled: true`.

---

## 4. Submission Tracker & Compliance (`/api/submission`)

### `GET /api/submission`
Returns submission target vs actual dates with calculated `delayDays` and SLA statuses (`ON_TIME`, `EARLY`, `LATE`, `DUE_SOON`, `OVERDUE_NOT_SUBMITTED`).

### `GET /api/submission/kpis`
Returns aggregated compliance indicators: on-time percentage, late counts, and average submission delay.

---

## 5. Payments, Allocations & DSO (`/api/payments` & `/api/dso`)

### `POST /api/payments` *(Permission: `PAYMENT_CREATE`)*
Logs incoming bank funds (NEFT/RTGS) with UTR reference numbers.

### `POST /api/payments/:id/allocate` *(Permission: `PAYMENT_ALLOCATE`)*
Atomically distributes a receipt across one or more invoices inside a database transaction:
- Updates invoice `totalReceived` and `outstandingAmount`.
- Sets status to `PAID` or `PARTIALLY_PAID`.
- Decrements receipt `unallocatedAmount`.

### `GET /api/dso/dashboard` *(Permission: `DSO_VIEW`)*
Returns Portfolio DSO, Indicative DSO, 30+ days overdue balances, and 12-month trend charts.

---

## 6. Executive Reports & Exports (`/api/reports`)

Supports query parameters `?format=json|xlsx|csv|pdf`.
- `GET /api/reports/projection-vs-actual`
- `GET /api/reports/invoice-register`
- `GET /api/reports/submission-tracker`
- `GET /api/reports/pending-actions`
