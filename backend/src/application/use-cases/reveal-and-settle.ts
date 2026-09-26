import { Conflict, DuplicateIdempotencyKey, NotFound } from '../../domain/errors';
import type { EventRecord } from '../../domain/models';
import { isEffectivelyRevealed } from '../../domain/policies/reveal.policy';
import type { Clock } from '../../domain/ports/clock';
import type {
  EventLocker,
  EventRepository,
  RequestContext,
  WalletRepository,
} from '../../domain/ports/repositories';
import type { WalletCredit } from './get-dashboard';

/** Clave de idempotencia del traspaso. Una por cajita, para siempre. */
export function revealIdempotencyKey(eventId: string): string {
  return `reveal:${eventId}`;
}

export interface RevealResult {
  event: EventRecord;
  walletCredit: WalletCredit;
}

/**
 * Revelar y pagar son un solo hecho contable.
 *
 * Todo ocurre dentro de UNA transacción que sostiene el lock de la fila del
 * evento: marcar revelada, sumar los SUCCEEDED, escribir `settledTotalCents`,
 * insertar el asiento del ledger y acreditar el saldo. Si algo falla, no queda
 * ni la revelación ni el crédito.
 *
 * El UNIQUE de `idempotencyKey` es la red de seguridad: incluso si dos
 * revelaciones lograran pasar el lock, sólo una fila de ledger puede existir.
 */
export class RevealAndSettle {
  constructor(
    private readonly events: EventRepository,
    private readonly wallets: WalletRepository,
    private readonly locker: EventLocker,
    private readonly clock: Clock,
  ) {}

  async execute(
    eventId: string,
    userId: string,
    ctx: Pick<RequestContext, 'ipAddress' | 'userAgent'>,
  ): Promise<RevealResult> {
    const owned = await this.events.findOwned(eventId, userId);
    // Cajita ajena => 404, igual que una inexistente.
    if (!owned) throw NotFound('Cajita no encontrada');

    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) throw NotFound('Monedero no encontrado');

    return this.locker.withEventLock(owned.id, async (locked, repos) => {
      if (isEffectivelyRevealed(locked, this.clock.now())) {
        throw Conflict('ALREADY_REVEALED', 'Los sobres ya fueron revelados');
      }

      const settledTotalCents = await repos.contributions.sumByStatus(locked.id, 'SUCCEEDED');
      const revealedAt = this.clock.now();
      const event = await repos.events.markRevealed(locked.id, revealedAt, settledTotalCents);

      let transactionId: string;
      try {
        const tx = await repos.wallets.creditReveal({
          walletId: wallet.id,
          eventId: event.id,
          amountCents: settledTotalCents,
          idempotencyKey: revealIdempotencyKey(event.id),
        });
        transactionId = tx.id;
      } catch (err) {
        // El ledger ya tenía el asiento: esta cajita se pagó antes. La transacción
        // se deshace entera, así que la revelación de esta llamada tampoco cuenta.
        if (err instanceof DuplicateIdempotencyKey) {
          throw Conflict('ALREADY_REVEALED', 'Los sobres ya fueron revelados');
        }
        throw err;
      }

      // Estos dos registros son parte del mismo hecho contable, así que van
      // dentro de la transacción: si no se pueden escribir, no hay pago.
      await repos.audit.record({
        action: 'EVENT_REVEALED',
        eventId: event.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { settledTotalCents, revealedAt: revealedAt.toISOString() },
      });
      await repos.audit.record({
        action: 'WALLET_CREDITED',
        eventId: event.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          walletId: wallet.id,
          amountCents: settledTotalCents,
          transactionId,
          idempotencyKey: revealIdempotencyKey(event.id),
        },
      });

      return { event, walletCredit: { amountCents: settledTotalCents, transactionId } };
    });
  }
}
