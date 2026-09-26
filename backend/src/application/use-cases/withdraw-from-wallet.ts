import { AppError, InsufficientFunds } from '../../domain/errors';
import type { IdGenerator } from '../../domain/ports/id-generator';
import type { RequestContext, WalletLocker } from '../../domain/ports/repositories';

export interface WithdrawResult {
  transactionId: string;
  /** Lo retirado, en positivo: el asiento del ledger es el negativo de esto. */
  amountCents: number;
  balanceCents: number;
}

/**
 * Retiro SIMULADO: no sale dinero a ninguna parte, sólo baja el saldo y queda
 * el asiento.
 *
 * Leer el saldo y gastarlo son un solo hecho: van dentro de UNA transacción que
 * sostiene `SELECT ... FOR UPDATE` sobre la fila de la wallet. Sin ese lock, dos
 * retiros simultáneos leen el mismo saldo, los dos se creen alcanzables y el
 * balance acaba en negativo — el doble gasto clásico.
 */
export class WithdrawFromWallet {
  constructor(
    private readonly locker: WalletLocker,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    userId: string,
    amountCents: number,
    ctx: Pick<RequestContext, 'ipAddress' | 'userAgent'>,
  ): Promise<WithdrawResult> {
    // Defensa en profundidad: el schema HTTP ya lo rechaza con 422, pero el caso
    // de uso no confía en que su llamador haya validado.
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'El monto del retiro debe ser un entero positivo');
    }

    return this.locker.withWalletLock(userId, async (wallet, repos) => {
      // Este saldo se leyó BAJO el lock, así que nadie puede gastarlo en paralelo.
      if (wallet.balanceCents < amountCents) {
        throw InsufficientFunds(wallet.balanceCents);
      }

      const tx = await repos.wallets.withdraw({
        walletId: wallet.id,
        amountCents,
        idempotencyKey: `withdraw:${wallet.id}:${this.ids.uuid()}`,
      });
      const balanceCents = wallet.balanceCents - amountCents;

      await repos.audit.record({
        action: 'WALLET_WITHDRAWN',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          walletId: wallet.id,
          amountCents,
          ledgerAmountCents: tx.amountCents,
          balanceAfterCents: balanceCents,
          currency: wallet.currency,
          simulated: true,
        },
      });

      return { transactionId: tx.id, amountCents, balanceCents };
    });
  }
}
