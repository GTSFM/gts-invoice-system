import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../services/auditService';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').notEmpty().withMessage('Password required.'),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }
      if (user.accountStatus !== 'ACTIVE') {
        res.status(403).json({ error: `Account is ${user.accountStatus.toLowerCase()}. Contact your administrator.` });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      const secret = process.env.JWT_SECRET!;
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        secret,
        { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any }
      );
      const refreshToken = jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET || secret,
        { expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as any }
      );

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), refreshToken },
      });

      await auditLog({
        userId: user.id,
        action: 'LOGIN',
        recordType: 'USER',
        recordId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          designation: user.designation,
          m365Connected: user.m365Connected,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ error: 'Refresh token required.' });
    return;
  }
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET!
    ) as { id: string };

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.refreshToken !== refreshToken || user.accountStatus !== 'ACTIVE') {
      res.status(401).json({ error: 'Invalid refresh token.' });
      return;
    }

    const secret = process.env.JWT_SECRET!;
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      secret,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any }
    );

    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null },
      });
      await auditLog({
        userId: req.user.id,
        action: 'LOGOUT',
        recordType: 'USER',
        recordId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, email: true, role: true, department: true,
        designation: true, accountStatus: true, m365Connected: true,
        lastLoginAt: true,
        regionAssignments: {
          include: { region: { select: { id: true, name: true, regionCode: true } } },
        },
      },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
authRouter.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { currentPassword, newPassword } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user?.passwordHash) {
        res.status(400).json({ error: 'Password change not available for this account.' });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
      const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      await auditLog({ userId: user.id, action: 'UPDATE', recordType: 'USER', recordId: user.id, newValues: { passwordChanged: true } });
      res.json({ message: 'Password changed successfully.' });
    } catch (err) {
      next(err);
    }
  }
);
