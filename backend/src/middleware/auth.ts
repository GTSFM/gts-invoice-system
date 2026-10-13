import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { UserRole } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  };
  [key: string]: any;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured.');
    const decoded = jwt.verify(token, secret) as {
      id: string;
      email: string;
      role: UserRole;
      name: string;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      return;
    }
    next();
  };
}

export function requirePermission(permissionCode: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    // Super admin always passes
    if (req.user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }
    try {
      const permission = await prisma.permission.findUnique({ where: { code: permissionCode } });
      if (!permission) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }
      const grant = await prisma.rolePermission.findUnique({
        where: {
          role_permissionId: { role: req.user.role, permissionId: permission.id },
        },
      });
      if (!grant?.granted) {
        res.status(403).json({ error: 'Access denied. You do not have permission for this action.' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRegionAccess() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.user.role === UserRole.SUPER_ADMIN || req.user.role === UserRole.MANAGEMENT || req.user.role === UserRole.CENTRAL_BILLING || req.user.role === UserRole.FINANCE_COLLECTIONS) {
      next();
      return;
    }

    const regionId = req.params.regionId || req.query.regionId as string || req.body.regionId;
    if (!regionId) {
      next();
      return;
    }

    const assignment = await prisma.userRegionAssignment.findUnique({
      where: { userId_regionId: { userId: req.user.id, regionId } },
    });

    if (!assignment) {
      res.status(403).json({ error: 'Access denied. You are not assigned to this region.' });
      return;
    }
    next();
  };
}
