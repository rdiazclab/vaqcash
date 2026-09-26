import type { UserRecord, WalletRecord } from '../../../domain/models';
import type { WalletTransactionView } from '../../../domain/ports/repositories';

/** `passwordHash` no existe en UserRecord, así que no puede filtrarse desde aquí. */
export function presentUser(user: UserRecord) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function presentWalletSummary(wallet: WalletRecord) {
  return { balanceCents: wallet.balanceCents, currency: wallet.currency };
}

export function presentWallet(wallet: WalletRecord, transactions: WalletTransactionView[]) {
  return {
    balanceCents: wallet.balanceCents,
    currency: wallet.currency,
    transactions: transactions.map((t) => ({
      id: t.id,
      amountCents: t.amountCents,
      type: t.type,
      eventTitle: t.eventTitle,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
