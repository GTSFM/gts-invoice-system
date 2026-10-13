# Microsoft Outlook / Microsoft Graph API Integration Guide

## Overview

The GTS Invoice-to-Collection Management System connects directly to Microsoft 365 through the official **Microsoft Graph API**.

This enables commercial billing teams and regional operations personnel to:
1. Dispatch submission alerts and billing notifications from corporate mailboxes.
2. Synchronize email communications and acknowledgment slips against individual invoices.
3. Automatically log email audit activities for compliance tracking.

---

## Graceful Degradation Architecture

> **Notice:** The system is explicitly designed to function seamlessly **without** Microsoft credentials.
> When Azure Entra ID credentials are omitted from the server environment, all commercial invoicing, manual client submissions, payment receipts, and DSO calculations remain 100% operational. The Outlook Integration page will clearly report "Graceful Degrade / Not Configured" rather than failing or fabricating successful sync.

---

## Azure Entra ID Setup Guide

### 1. App Registration
1. Navigate to the [Microsoft Entra Admin Center](https://entra.microsoft.com/).
2. Go to **Identity** &rarr; **Applications** &rarr; **App registrations** &rarr; **New registration**.
3. Set the name to `GTS Invoice Management System`.
4. Choose **Accounts in this organizational directory only** (Single tenant).
5. Set Redirect URI (Web):
   - **Development:** `http://localhost:5000/api/email-integration/callback`
   - **Production:** `https://your-backend.onrender.com/api/email-integration/callback`
6. Click **Register**.

### 2. API Permissions
Under **API permissions**, select **Add a permission** &rarr; **Microsoft Graph**:
- Delegated Permissions:
  - `User.Read`
  - `Mail.Read`
  - `Mail.Send`
  - `offline_access`
- Click **Grant admin consent** for your organization.

### 3. Client Secret
1. Go to **Certificates & secrets** &rarr; **New client secret**.
2. Add description `GTS Production App Secret` and set expiry.
3. Copy the **Value** immediately.

### 4. Configure Environment Variables
Add these to your `backend/.env` file or Render Web Service environment:

```env
MICROSOFT_CLIENT_ID=your-azure-app-client-id
MICROSOFT_CLIENT_SECRET=your-azure-client-secret-value
MICROSOFT_TENANT_ID=your-azure-tenant-id
MICROSOFT_REDIRECT_URI=https://your-backend.onrender.com/api/email-integration/callback
```

---

## End-User Connection Flow
1. Authorised users log into the GTS portal and navigate to **Outlook Integration**.
2. Click **Connect Official Mailbox**.
3. The user is redirected to Microsoft's secure login screen to consent.
4. Refresh tokens are stored securely in the PostgreSQL database with server-side encryption.
5. All dispatched correspondence automatically appears in the system's **Email Activity Register**.
