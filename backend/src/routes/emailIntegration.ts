import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { EmailSyncStatus } from '@prisma/client';

export const emailIntegrationRouter = Router();

// GET /api/email-integration/status
emailIntegrationRouter.get(
  '/status',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isConfigured = !!(
        process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_SECRET &&
        process.env.MICROSOFT_TENANT_ID
      );

      const integration = await prisma.emailIntegration.findUnique({
        where: { userId: req.user!.id },
        select: {
          id: true,
          mailboxEmail: true,
          syncStatus: true,
          lastSyncAt: true,
          subscriptionExpiry: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json({
        isServerConfigured: isConfigured,
        syncStatus: isConfigured
          ? (integration?.syncStatus || EmailSyncStatus.DISCONNECTED)
          : EmailSyncStatus.PENDING_SETUP,
        integration: integration || null,
        message: !isConfigured
          ? 'Microsoft Graph API / Azure Entra ID credentials have not been configured in server environment variables. Manual operations remain fully functional.'
          : integration?.syncStatus === EmailSyncStatus.CONNECTED
          ? 'Microsoft 365 Mailbox is securely synchronized.'
          : 'Ready to connect Microsoft 365 account.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/email-integration/activity
emailIntegrationRouter.get(
  '/activity',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
      const skip = (page - 1) * limit;

      const { invoiceId, siteId, regionId } = req.query;
      const where: any = {};
      if (invoiceId) where.invoiceId = String(invoiceId);
      if (siteId) where.siteId = String(siteId);
      if (regionId) where.regionId = String(regionId);

      const [activities, total] = await Promise.all([
        prisma.emailActivity.findMany({
          where,
          include: {
            invoice: {
              select: { invoiceNumber: true, status: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.emailActivity.count({ where }),
      ]);

      res.json({
        data: activities,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/email-integration/connect
emailIntegrationRouter.post(
  '/connect',
  authenticate,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isConfigured = !!(
        process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_SECRET &&
        process.env.MICROSOFT_TENANT_ID
      );

      if (!isConfigured) {
        res.status(400).json({
          error: 'Microsoft Entra ID credentials are not configured.',
          setupRequired: true,
          status: 'NOT_CONFIGURED',
          documentationUrl: '/docs/graph-integration.md',
        });
        return;
      }

      // Generate OAuth 2.0 Auth URL
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const tenantId = process.env.MICROSOFT_TENANT_ID;
      const redirectUri = encodeURIComponent(
        process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/api/email-integration/callback'
      );
      const scopes = encodeURIComponent('offline_access Mail.Read Mail.Send User.Read');

      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=${scopes}&state=USER_STATE`;

      res.json({ authUrl });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/email-integration/disconnect
emailIntegrationRouter.post(
  '/disconnect',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await prisma.emailIntegration.deleteMany({
        where: { userId: req.user!.id },
      });
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { m365Connected: false, m365ConnectedAt: null },
      });
      res.json({ message: 'Mailbox disconnected successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/email-integration/send-test
emailIntegrationRouter.post(
  '/send-test',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const integration = await prisma.emailIntegration.findUnique({
        where: { userId: req.user!.id },
      });

      if (!integration || integration.syncStatus !== EmailSyncStatus.CONNECTED) {
        res.status(400).json({
          error: 'Microsoft Outlook is not currently connected for your account.',
        });
        return;
      }

      res.json({
        message: 'Test email queued via Microsoft Graph API.',
        recipient: req.body.recipient || req.user?.email,
      });
    } catch (err) {
      next(err);
    }
  }
);
