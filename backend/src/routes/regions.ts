import { Router, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { EntityStatus } from '@prisma/client';
import { prisma } from '../config/database';
import {
  authenticate,
  requirePermission,
  AuthenticatedRequest,
} from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const regionsRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPagination(pageStr: unknown, limitStr: unknown) {
  const page = Math.max(1, parseInt(String(pageStr || '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(limitStr || '50'), 10) || 50));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function handleValidation(req: AuthenticatedRequest, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET / — list all regions ─────────────────────────────────────────────────

regionsRouter.get(
  '/',
  authenticate,
  [
    query('status').optional().isIn(Object.values(EntityStatus)),
    query('search').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
      const status = req.query.status as EntityStatus | undefined;
      const search = req.query.search as string | undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { regionCode: { contains: search, mode: 'insensitive' } },
          { regionalManager: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [regions, total] = await Promise.all([
        prisma.region.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            regionCode: true,
            name: true,
            regionalManager: true,
            status: true,
            createdAt: true,
            _count: { select: { sites: true } },
          },
        }),
        prisma.region.count({ where }),
      ]);

      const data = regions.map((r) => ({
        id: r.id,
        regionCode: r.regionCode,
        name: r.name,
        regionalManager: r.regionalManager,
        status: r.status,
        siteCount: r._count.sites,
        createdAt: r.createdAt,
      }));

      res.json({
        data,
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
  },
);

// ─── GET /:id — single region ─────────────────────────────────────────────────

regionsRouter.get(
  '/:id',
  authenticate,
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const region = await prisma.region.findUnique({
        where: { id: req.params.id },
        include: {
          _count: { select: { sites: true, userAssignments: true } },
          userAssignments: {
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true, accountStatus: true },
              },
            },
          },
        },
      });

      if (!region) throw createError('Region not found.', 404);

      res.json({ data: region });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / — create region ───────────────────────────────────────────────────

regionsRouter.post(
  '/',
  authenticate,
  requirePermission('REGION_MANAGE'),
  [
    body('regionCode').isString().trim().notEmpty().withMessage('regionCode is required.'),
    body('name').isString().trim().notEmpty().withMessage('name is required.'),
    body('regionalManager').optional().isString().trim(),
    body('regionalOpsEmail').optional().isEmail().normalizeEmail(),
    body('billingTeamEmail').optional().isEmail().normalizeEmail(),
    body('financeContactEmail').optional().isEmail().normalizeEmail(),
    body('escalationEmail').optional().isEmail().normalizeEmail(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const {
        regionCode,
        name,
        regionalManager,
        regionalOpsEmail,
        billingTeamEmail,
        financeContactEmail,
        escalationEmail,
      } = req.body;

      // Check for duplicate regionCode
      const existing = await prisma.region.findUnique({ where: { regionCode } });
      if (existing) throw createError(`Region code '${regionCode}' already exists.`, 409);

      const region = await prisma.region.create({
        data: {
          regionCode,
          name,
          regionalManager,
          regionalOpsEmail,
          billingTeamEmail,
          financeContactEmail,
          escalationEmail,
          createdById: req.user!.id,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'CREATE',
        recordType: 'Region',
        recordId: region.id,
        newValues: region,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: region });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id — update region ─────────────────────────────────────────────────

regionsRouter.put(
  '/:id',
  authenticate,
  requirePermission('REGION_MANAGE'),
  [
    param('id').isUUID(),
    body('regionCode').optional().isString().trim().notEmpty(),
    body('name').optional().isString().trim().notEmpty(),
    body('regionalManager').optional().isString().trim(),
    body('regionalOpsEmail').optional().isEmail().normalizeEmail(),
    body('billingTeamEmail').optional().isEmail().normalizeEmail(),
    body('financeContactEmail').optional().isEmail().normalizeEmail(),
    body('escalationEmail').optional().isEmail().normalizeEmail(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const region = await prisma.region.findUnique({ where: { id: req.params.id } });
      if (!region) throw createError('Region not found.', 404);

      // Block regionCode change if it has sites or invoices
      if (req.body.regionCode && req.body.regionCode !== region.regionCode) {
        const [siteCount, invoiceCount] = await Promise.all([
          prisma.site.count({ where: { regionId: region.id } }),
          prisma.invoice.count({ where: { regionId: region.id } }),
        ]);
        if (siteCount > 0 || invoiceCount > 0) {
          throw createError(
            'Cannot change regionCode: region has associated sites or invoices.',
            409,
          );
        }
      }

      const {
        regionCode,
        name,
        regionalManager,
        regionalOpsEmail,
        billingTeamEmail,
        financeContactEmail,
        escalationEmail,
      } = req.body;

      const updated = await prisma.region.update({
        where: { id: region.id },
        data: {
          ...(regionCode !== undefined && { regionCode }),
          ...(name !== undefined && { name }),
          ...(regionalManager !== undefined && { regionalManager }),
          ...(regionalOpsEmail !== undefined && { regionalOpsEmail }),
          ...(billingTeamEmail !== undefined && { billingTeamEmail }),
          ...(financeContactEmail !== undefined && { financeContactEmail }),
          ...(escalationEmail !== undefined && { escalationEmail }),
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'Region',
        recordId: region.id,
        previousValues: region,
        newValues: updated,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id/status — activate / deactivate ────────────────────────────────

regionsRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('REGION_MANAGE'),
  [
    param('id').isUUID(),
    body('status')
      .isIn([EntityStatus.ACTIVE, EntityStatus.INACTIVE, EntityStatus.ARCHIVED])
      .withMessage('status must be ACTIVE, INACTIVE, or ARCHIVED.'),
    body('reason').optional().isString().trim(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const region = await prisma.region.findUnique({ where: { id: req.params.id } });
      if (!region) throw createError('Region not found.', 404);

      const newStatus: EntityStatus = req.body.status;

      // Block deactivation/archiving if active sites exist
      if (newStatus !== EntityStatus.ACTIVE) {
        const activeSites = await prisma.site.findMany({
          where: { regionId: region.id, status: EntityStatus.ACTIVE },
          select: { id: true, siteCode: true, name: true },
        });
        if (activeSites.length > 0) {
          res.status(400).json({
            error: 'Cannot deactivate region while it has active sites.',
            activeSites,
          });
          return;
        }
      }

      const previousStatus = region.status;
      const updated = await prisma.region.update({
        where: { id: region.id },
        data: { status: newStatus },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        recordType: 'Region',
        recordId: region.id,
        previousValues: { status: previousStatus },
        newValues: { status: newStatus },
        changeReason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/sites — sites for a region (paginated) ─────────────────────────

regionsRouter.get(
  '/:id/sites',
  authenticate,
  [
    param('id').isUUID(),
    query('status').optional().isIn(Object.values(EntityStatus)),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const region = await prisma.region.findUnique({ where: { id: req.params.id } });
      if (!region) throw createError('Region not found.', 404);

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
      const status = req.query.status as EntityStatus | undefined;

      const where: Record<string, unknown> = { regionId: region.id };
      if (status) where.status = status;

      const [sites, total] = await Promise.all([
        prisma.site.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            client: { select: { id: true, name: true, clientCode: true } },
          },
        }),
        prisma.site.count({ where }),
      ]);

      res.json({
        data: sites,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);
