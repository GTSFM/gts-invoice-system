# GTS Invoice-to-Collection Management System — User Operating Manual

## 1. Introduction
Welcome to the GTS Commercial Billing and Invoice Lifecycle Management Portal.
This enterprise application streamlines commercial facility management operations across all pan-India operating zones.

---

## 2. Navigation Overview

| Module | Navigation Link | Permitted Roles | Key Functions |
|---|---|---|---|
| **Executive Dashboard** | `/dashboard` | All Users | 12 Executive KPIs, Site-wise Billing comparison, Overdue Alerts |
| **Billing Projections** | `/projections` | Central Billing, Management | Fixed monthly projections, mandatory revision reasoning |
| **Invoice Register** | `/invoices` | Central Billing, Finance | View invoice status lifecycle, receipts, and balances |
| **Create Invoice** | `/invoices/new` | Central Billing | 3-step guided wizard validating site projections and targets |
| **Invoice Detail** | `/invoices/:id` | Central Billing, Finance | Record submission, client acknowledgement, and invoice cancellation |
| **Submission Tracker** | `/submission` | Central Billing, Regional Ops | Monitor contractual submission target SLAs and delay days |
| **Payments & Collections** | `/payments` | Finance, Central Billing | Record bank receipts and allocate to open invoices atomically |
| **DSO & Ageing** | `/dso` | Management, Finance | Portfolio DSO metrics and contractual ageing buckets |
| **Regions & Sites** | `/regions` & `/sites` | Super Admin, Billing | Master entity management with referential integrity protection |
| **Client Master** | `/clients` | Super Admin, Billing | Client records, default payment terms, and billing addresses |
| **Outlook Integration** | `/outlook` | All Users | Microsoft 365 mailbox sync and notification tracking |
| **Reports & Exports** | `/reports` | All Users | Certified Excel, CSV, and PDF report downloads |
| **User Management** | `/users` | Super Admin | Manage staff logins, roles, and departmental permissions |
| **Audit Logs** | `/audit` | Super Admin, Management | Search immutable compliance audit logs |
| **Settings** | `/settings` | Super Admin | Modify variance tolerance, warning windows, and default settings |

---

## 3. Core Operational Workflows

### Workflow A: Entering Monthly Site Projections
1. Navigate to **Billing Projections**.
2. Click **Add Site Projection**.
3. Choose the operating site and billing month.
4. Enter the projected amount excluding GST.
5. Click **Save Projection**.
6. **Revising a Projection:** If the projected figure changes due to extra client services, click **Revise**, enter the new value, and provide a mandatory explanation (e.g. "Manpower scope added per client amendment"). The original value is permanently preserved in the audit log.

### Workflow B: Drafting a Commercial Invoice
1. Navigate to **Create Invoice**.
2. **Step 1:** Select the Client, Region, Operating Site, and Billing Month.
3. **Step 2:** Review the linked projection. Enter the invoice number and value. The live preview will automatically compute the billing variance against the projection.
4. **Step 3:** Assign the target submission date and commercial remarks. Click **Create Commercial Invoice**.

### Workflow C: Recording Client Submission & Due Date Calculation
1. Locate the invoice in the **Invoice Register** and open its detail view.
2. Click **Record Client Submission**.
3. Specify the actual date of delivery and transmission channel (e.g., Client Portal or Official Email).
4. Upon submission, the contractual payment due date is calculated automatically using the agreed terms (e.g. Net 30 or Net 45 days).
5. When the client returns signed proof, click **Record Client Acknowledgement**.

### Workflow D: Processing Payment Receipts & Allocations
1. Navigate to **Payment & Collections**.
2. Click **Record Payment Receipt** to log incoming NEFT/RTGS bank funds with bank UTR reference numbers.
3. On the **Receipts Register** tab, locate receipts with an unallocated balance and click **Allocate**.
4. Enter allocation amounts across one or more invoices. Database transactions ensure receipts are never over-allocated and invoice balances are updated consistently.

---

## 4. Key Financial Calculations

- **Billing Variance:** $\text{Actual Billing} - \text{Projected Billing}$
- **Variance Percentage:** $\frac{\text{Actual Billing} - \text{Projected Billing}}{\text{Projected Billing}} \times 100$
- **Submission Delay:** $\text{Actual Submission Date} - \text{Target Submission Date}$ (in calendar days)
- **Outstanding Balance:** $\text{Valid Invoice Total} - \text{Allocated Receipts} - \text{Credit Notes}$
- **Portfolio DSO:** $\frac{\text{Average Trade Receivables}}{\text{Eligible Credit Sales}} \times \text{Days in Reporting Period}$
