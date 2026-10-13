import { Router, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AccountStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import {
  authenticate,
  requirePermission,
  AuthenticatedRequest,
} from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { auditLog } from '../services/auditService';

export const usersRouter = Router();

const BCRYPT_ROUNDS = 12;

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

/** Strip passwordHash and refreshToken from any user object */
function sanitizeUser<T extends { passwordHash?: string | null; refreshToken?: string | null }>(
  user: T,
): Omit<T, 'passwordHash' | 'refreshToken'> {
  const { passwordHash: _ph, refreshToken: _rt, ...safe } = user;
  return safe;
}

/** Select clause that never exposes credentials */
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  designation: true,
  role: true,
  accountStatus: true,
  microsoftEmail: true,
  m365Connected: true,
  lastLoginAt: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
} as const;

// ─── GET / — list users ───────────────────────────────────────────────────────

usersRouter.get(
  '/',
  authenticate,
  [
    query('role').optional().isIn(Object.values(UserRole)),
    query('status').optional().isIn(Object.values(AccountStatus)),
    query('search').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
      const { role, status, search } = req.query as Record<string, string | undefined>;

      const where: Record<string, unknown> = {};
      if (role) where.role = role as UserRole;
      if (status) where.accountStatus = status as AccountStatus;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { department: { contains: search, mode: 'insensitive' } },
          { designation: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: SAFE_USER_SELECT,
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        data: users,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id — user detail with assignments ──────────────────────────────────

usersRouter.get(
  '/:id',
  authenticate,
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
          ...SAFE_USER_SELECT,
          regionAssignments: {
            include: {
              region: { select: { id: true, regionCode: true, name: true, status: true } },
            },
          },
          siteAssignments: {
            include: {
              site: {
                select: {
                  id: true,
                  siteCode: true,
                  name: true,
                  status: true,
                  client: { select: { id: true, name: true, clientCode: true } },
                },
              },
            },
          },
        },
      });

      if (!user) throw createError('User not found.', 404);

      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / — create user ─────────────────────────────────────────────────────

usersRouter.post(
  '/',
  authenticate,
  requirePermission('USER_MANAGE'),
  [
    body('name').isString().trim().notEmpty().withMessage('name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
    body('password').isString().isLength({ min: 8 }).withMessage('password must be at least 8 characters.'),
    body('role').isIn(Object.values(UserRole)).withMessage('Invalid role.'),
    body('department').optional().isString().trim(),
    body('designation').optional().isString().trim(),
    body('isDemo').optional().isBoolean(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const { name, email, password, role, department, designation, isDemo } = req.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw createError('A user with this email already exists.', 409);

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          department,
          designation,
          isDemo: isDemo ?? false,
          accountStatus: AccountStatus.ACTIVE,
          createdById: req.user!.id,
        },
        select: SAFE_USER_SELECT,
      });

      await auditLog({
        userId: req.user!.id,
        action: 'CREATE',
        recordType: 'User',
        recordId: user.id,
        newValues: { name, email, role, department, designation },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: user });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id — update user ───────────────────────────────────────────────────

usersRouter.put(
  '/:id',
  authenticate,
  requirePermission('USER_MANAGE'),
  [
    param('id').isUUID(),
    body('name').optional().isString().trim().notEmpty(),
    body('department').optional().isString().trim(),
    body('designation').optional().isString().trim(),
    body('role').optional().isIn(Object.values(UserRole)).withMessage('Invalid role.'),
    body('email').optional().isEmail().normalizeEmail(),
    body('isDemo').optional().isBoolean(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) throw createError('User not found.', 404);

      // Only SUPER_ADMIN can change their own role or another user's role to/from SUPER_ADMIN
      if (req.body.role !== undefined) {
        const isSelf = req.user!.id === target.id;
        const isSuperAdmin = req.user!.role === UserRole.SUPER_ADMIN;
        if (isSelf && !isSuperAdmin) {
          throw createError('You cannot change your own role.', 403);
        }
        if (
          (req.body.role === UserRole.SUPER_ADMIN || target.role === UserRole.SUPER_ADMIN) &&
          !isSuperAdmin
        ) {
          throw createError('Only SUPER_ADMIN can assign or remove the SUPER_ADMIN role.', 403);
        }
      }

      const { name, department, designation, role, email, isDemo } = req.body;

      const updated = await prisma.user.update({
        where: { id: target.id },
        data: {
          ...(name !== undefined && { name }),
          ...(department !== undefined && { department }),
          ...(designation !== undefined && { designation }),
          ...(role !== undefined && { role }),
          ...(email !== undefined && { email }),
          ...(isDemo !== undefined && { isDemo }),
        },
        select: SAFE_USER_SELECT,
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'User',
        recordId: target.id,
        previousValues: sanitizeUser(target),
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

// ─── PATCH /:id/status — change account status ───────────────────────────────

usersRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('USER_MANAGE'),
  [
    param('id').isUUID(),
    body('status')
      .isIn(Object.values(AccountStatus))
      .withMessage('status must be ACTIVE, INACTIVE, SUSPENDED, or PENDING.'),
    body('reason').optional().isString().trim(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) throw createError('User not found.', 404);

      // Prevent non-SUPER_ADMIN from suspending/deactivating a SUPER_ADMIN account
      if (target.role === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
        throw createError('Only SUPER_ADMIN can change the status of another SUPER_ADMIN.', 403);
      }

      const previousStatus = target.accountStatus;
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { accountStatus: req.body.status },
        select: SAFE_USER_SELECT,
      });

      await auditLog({
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        recordType: 'User',
        recordId: target.id,
        previousValues: { accountStatus: previousStatus },
        newValues: { accountStatus: req.body.status },
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

// ─── POST /:id/regions — replace all region assignments ───────────────────────

usersRouter.post(
  '/:id/regions',
  authenticate,
  requirePermission('USER_MANAGE'),
  [
    param('id').isUUID(),
    body('regionIds')
      .isArray()
      .withMessage('regionIds must be an array.')
      .custom((arr: unknown[]) => arr.every((id) => typeof id === 'string'))
      .withMessage('Each regionId must be a string.'),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) throw createError('User not found.', 404);

      const regionIds: string[] = req.body.regionIds;

      // Validate all region IDs exist
      if (regionIds.length > 0) {
        const found = await prisma.region.findMany({
          where: { id: { in: regionIds } },
          select: { id: true },
        });
        if (found.length !== regionIds.length) {
          throw createError('One or more regionIds are invalid.', 400);
        }
      }

      // Replace all assignments in a transaction
      const assignments = await prisma.$transaction(async (tx) => {
        await tx.userRegionAssignment.deleteMany({ where: { userId: user.id } });
        if (regionIds.length > 0) {
          await tx.userRegionAssignment.createMany({
            data: regionIds.map((regionId) => ({ userId: user.id, regionId })),
            skipDuplicates: true,
          });
        }
        return tx.userRegionAssignment.findMany({
          where: { userId: user.id },
          include: { region: { select: { id: true, regionCode: true, name: true } } },
        });
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'UserRegionAssignment',
        recordId: user.id,
        newValues: { regionIds },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: assignments });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/sites — replace all site assignments ───────────────────────────

usersRouter.post(
  '/:id/sites',
  authenticate,
  requirePermission('USER_MANAGE'),
  [
    param('id').isUUID(),
    body('siteIds')
      .isArray()
      .withMessage('siteIds must be an array.')
      .custom((arr: unknown[]) => arr.every((id) => typeof id === 'string'))
      .withMessage('Each siteId must be a string.'),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) throw createError('User not found.', 404);

      const siteIds: string[] = req.body.siteIds;

      // Validate all site IDs exist
      if (siteIds.length > 0) {
        const found = await prisma.site.findMany({
          where: { id: { in: siteIds } },
          select: { id: true },
        });
        if (found.length !== siteIds.length) {
          throw createError('One or more siteIds are invalid.', 400);
        }
      }

      // Replace all assignments in a transaction
      const assignments = await prisma.$transaction(async (tx) => {
        await tx.userSiteAssignment.deleteMany({ where: { userId: user.id } });
        if (siteIds.length > 0) {
          await tx.userSiteAssignment.createMany({
            data: siteIds.map((siteId) => ({ userId: user.id, siteId })),
            skipDuplicates: true,
          });
        }
        return tx.userSiteAssignment.findMany({
          where: { userId: user.id },
          include: {
            site: {
              select: {
                id: true,
                siteCode: true,
                name: true,
                client: { select: { id: true, name: true } },
              },
            },
          },
        });
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'UserSiteAssignment',
        recordId: user.id,
        newValues: { siteIds },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: assignments });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/reset-password — admin reset ───────────────────────────────────

usersRouter.post(
  '/:id/reset-password',
  authenticate,
  requirePermission('USER_MANAGE'),
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) throw createError('User not found.', 404);

      // Generate a cryptographically random temporary password
      const tempPassword = crypto.randomBytes(10).toString('base64url').slice(0, 16);
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      // Store temp password hash; nullify refreshToken to force re-login.
      // We use a SystemSetting key per-user to flag force-change; alternatively,
      // a dedicated field could be added to User. Here we store a JSON flag via a
      // well-known key so downstream auth middleware can check it.
      await prisma.user.update({
        where: { id: target.id },
        data: {
          passwordHash,
          refreshToken: null,   // invalidate existing sessions
        },
      });

      // Persist a force-change-on-login flag in SystemSettings
      await prisma.systemSetting.upsert({
        where: { key: `force_password_change:${target.id}` },
        create: {
          key: `force_password_change:${target.id}`,
          value: 'true',
          description: `Force password change for user ${target.email} on next login`,
          updatedById: req.user!.id,
        },
        update: {
          value: 'true',
          updatedById: req.user!.id,
        },
      });

      await auditLog({
        userId: req.user!.id,
        action: 'UPDATE',
        recordType: 'User',
        recordId: target.id,
        newValues: { passwordReset: true, forceChangeOnLogin: true },
        changeReason: 'Admin-initiated password reset',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Return the temp password ONLY in the response — never log or store plaintext
      res.json({
        message: 'Password reset successfully. The user must change their password on next login.',
        temporaryPassword: tempPassword,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /:id — soft delete user ──────────────────────────────────────────

usersRouter.delete(
  '/:id',
  authenticate,
  requirePermission('USER_MANAGE'),
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return;

      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) throw createError('User not found.', 404);

      // Prevent self-deletion
      if (target.id === req.user!.id) {
        throw createError('You cannot delete your own account.', 400);
      }

      // Prevent deleting a SUPER_ADMIN unless caller is also SUPER_ADMIN
      if (target.role === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
        throw createError('Only SUPER_ADMIN can delete another SUPER_ADMIN account.', 403);
      }

      // Check if audit logs exist — if so, only soft-delete
      const auditLogCount = await prisma.auditLog.count({ where: { userId: target.id } });

      // Always perform soft delete (set INACTIVE). Physical delete is never performed.
      if (auditLogCount > 0) {
        // Soft delete: deactivate and clear credentials
        await prisma.user.update({
          where: { id: target.id },
          data: {
            accountStatus: AccountStatus.INACTIVE,
            refreshToken: null,
            passwordHash: null,
          },
        });
      } else {
        // No audit trail yet — still soft delete for safety
        await prisma.user.update({
          where: { id: target.id },
          data: {
            accountStatus: AccountStatus.INACTIVE,
            refreshToken: null,
            passwordHash: null,
          },
        });
      }

      await auditLog({
        userId: req.user!.id,
        action: 'DELETE',
        recordType: 'User',
        recordId: target.id,
        previousValues: sanitizeUser(target),
        newValues: { accountStatus: AccountStatus.INACTIVE },
        changeReason: 'Soft delete by admin',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        message: 'User deactivated successfully.',
        id: target.id,
      });
    } catch (err) {
      next(err);
    }
  },
);
