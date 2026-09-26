import type { PrismaClient } from '@prisma/client';
import { NotFound, ServiceUnavailable } from '../../../domain/errors';
import type { LockedWallet } from '../../../domain/models';
import type { RepositoryBundle, WalletLocker } from '../../../domain/ports/repositories';
import { bundleFor, isLockContention, LOCK_TIMEOUT } from './event-locker';

/**
 * Lock pesimista sobre la fila de la WALLET.
 *
 * Mismo patrón que PrismaEventLocker, distinto recurso: aquí lo que se serializa
 * es el gasto del saldo. El `FOR UPDATE` hace que el saldo leído dentro de la
 * transacción no pueda cambiar bajo los pies de quien lo está gastando, que es
 * lo único que evita dos retiros concurrentes dejando el balance en negativo.
 */
export class PrismaWalletLocker implements WalletLocker {
  constructor(private readonly db: PrismaClient) {}

  async withWalletLock<T>(
    userId: string,
    fn: (locked: LockedWallet, repos: RepositoryBundle) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        const rows = await tx.$queryRaw<LockedWallet[]>`
          SELECT id, "userId", "balanceCents", currency FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE
        `;
        const locked = rows[0];
        if (!locked) throw NotFound('Monedero no encontrado');
        return fn(locked, bundleFor(tx));
      });
    } catch (err) {
      if (isLockContention(err)) {
        throw ServiceUnavailable('LOCK_BUSY', 'El monedero está ocupado con otra operación. Reintenta.');
      }
      throw err;
    }
  }
}
