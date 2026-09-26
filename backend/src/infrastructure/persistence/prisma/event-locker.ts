import type { PrismaClient } from '@prisma/client';
import { NotFound, ServiceUnavailable } from '../../../domain/errors';
import type { LockedEvent } from '../../../domain/models';
import type { EventLocker, RepositoryBundle } from '../../../domain/ports/repositories';
import { PrismaAuditRepository } from './audit.repository';
import type { PrismaLike } from './client';
import { PrismaContributionRepository } from './contribution.repository';
import { PrismaEventRepository } from './event.repository';
import { PrismaWalletRepository } from './wallet.repository';

/** Espera máxima por el lock de la fila; por debajo del timeout de transacción de Prisma. */
export const LOCK_TIMEOUT = '3s';

/** Transacción abortada por Prisma, o lock no disponible en Postgres (55P03). */
export function isLockContention(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === 'P2028') return true;
  const message = err instanceof Error ? err.message : String(err);
  return /55P03|lock timeout|canceling statement due to lock timeout/i.test(message);
}

/** Los repositorios de este bundle escriben todos dentro de la MISMA transacción. */
export function bundleFor(tx: PrismaLike): RepositoryBundle {
  return {
    events: new PrismaEventRepository(tx),
    contributions: new PrismaContributionRepository(tx),
    wallets: new PrismaWalletRepository(tx),
    audit: new PrismaAuditRepository(tx),
  };
}

/**
 * Lock pesimista sobre la fila del evento.
 *
 * `SELECT ... FOR UPDATE` serializa a todo el que quiera tocar esta cajita, y
 * `SET LOCAL lock_timeout` acota la espera: sin él, una fila retenida por otra
 * transacción cuelga la petición del invitado hasta que Prisma mata la
 * transacción. La contención se traduce a 503, jamás a 500.
 */
export class PrismaEventLocker implements EventLocker {
  constructor(private readonly db: PrismaClient) {}

  async withEventLock<T>(
    eventId: string,
    fn: (locked: LockedEvent, repos: RepositoryBundle) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        const rows = await tx.$queryRaw<LockedEvent[]>`
          SELECT id, "isRevealed", "revealAt" FROM "Event" WHERE id = ${eventId} FOR UPDATE
        `;
        const locked = rows[0];
        if (!locked) throw NotFound('Cajita no encontrada');
        return fn(locked, bundleFor(tx));
      });
    } catch (err) {
      if (isLockContention(err)) {
        throw ServiceUnavailable('LOCK_BUSY', 'La cajita está recibiendo muchos aportes a la vez. Reintenta.');
      }
      throw err;
    }
  }
}
