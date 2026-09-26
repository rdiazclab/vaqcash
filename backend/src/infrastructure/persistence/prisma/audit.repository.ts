import { Prisma } from '@prisma/client';
import type { AuditEntry, AuditRepository } from '../../../domain/ports/repositories';
import type { PrismaLike } from './client';

/**
 * Append-only de verdad: esta clase sólo sabe insertar. No hay update, no hay
 * delete y no hay find, porque ninguna ruta de la API devuelve auditoría.
 */
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly db: PrismaLike) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        action: entry.action,
        eventId: entry.eventId ?? null,
        contributionId: entry.contributionId ?? null,
        realSenderName: entry.realSenderName ?? null,
        realSenderEmail: entry.realSenderEmail ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: (entry.metadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
  }
}
