import { prisma } from '../config/database';
import { AuditAction } from '@prisma/client';
import { logger } from '../index';

interface AuditOptions {
  userId?: string;
  action: AuditAction | string;
  recordType?: string;
  entityType?: string;
  recordId?: string;
  entityId?: string;
  previousValues?: object;
  newValues?: object;
  changeReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function auditLog(opts: AuditOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId,
        action: opts.action as AuditAction,
        recordType: opts.recordType || opts.entityType || 'UNKNOWN',
        recordId: opts.recordId || opts.entityId || 'UNKNOWN',
        previousValues: opts.previousValues as any,
        newValues: opts.newValues as any,
        changeReason: opts.changeReason,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
      },
    });
  } catch (err) {
    // Audit log failures must not break the main operation
    logger.error('Audit log write failed: ' + String(err));
  }
}
