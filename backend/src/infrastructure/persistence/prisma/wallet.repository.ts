import { Prisma } from '@prisma/client';
import { DuplicateIdempotencyKey } from '../../../domain/errors';
import type { WalletRecord, WalletTransactionRecord } from '../../../domain/models';
import type {
  CreditRevealInput,
  WalletRepository,
  WalletTransactionView,
  WithdrawInput,
} from '../../../domain/ports/repositories';
import type { PrismaLike } from './client';
import { toWallet, toWalletTransaction } from './mappers';

export class PrismaWalletRepository implements WalletRepository {
  constructor(private readonly db: PrismaLike) {}

  async findByUserId(userId: string): Promise<WalletRecord | null> {
    const row = await this.db.wallet.findUnique({ where: { userId } });
    return row ? toWallet(row) : null;
  }

  async creditReveal(input: CreditRevealInput): Promise<WalletTransactionRecord> {
    let created;
    try {
      // El insert va primero a propósito: si la clave ya existe, el UNIQUE aborta
      // aquí y el saldo no se toca. El crédito no puede ocurrir dos veces.
      created = await this.db.walletTransaction.create({
        data: {
          walletId: input.walletId,
          eventId: input.eventId,
          amountCents: input.amountCents,
          type: 'REVEAL_PAYOUT',
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateIdempotencyKey(input.idempotencyKey);
      }
      throw err;
    }

    await this.db.wallet.update({
      where: { id: input.walletId },
      data: { balanceCents: { increment: input.amountCents } },
    });

    return toWalletTransaction(created);
  }

  /**
   * El asiento se guarda NEGATIVO y el saldo baja en la misma operación: así la
   * suma del ledger sigue siendo exactamente el balance. Debe llamarse con la
   * fila de la wallet ya bloqueada (ver PrismaWalletLocker).
   */
  async withdraw(input: WithdrawInput): Promise<WalletTransactionRecord> {
    const created = await this.db.walletTransaction.create({
      data: {
        walletId: input.walletId,
        amountCents: -input.amountCents,
        type: 'WITHDRAWAL',
        idempotencyKey: input.idempotencyKey,
      },
    });

    await this.db.wallet.update({
      where: { id: input.walletId },
      data: { balanceCents: { decrement: input.amountCents } },
    });

    return toWalletTransaction(created);
  }

  async sumLedger(walletId: string): Promise<number> {
    const agg = await this.db.walletTransaction.aggregate({
      where: { walletId },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0;
  }

  async listTransactions(walletId: string): Promise<WalletTransactionView[]> {
    const rows = await this.db.walletTransaction.findMany({
      where: { walletId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { event: { select: { title: true } } },
    });
    return rows.map((row) => ({ ...toWalletTransaction(row), eventTitle: row.event?.title ?? null }));
  }
}
