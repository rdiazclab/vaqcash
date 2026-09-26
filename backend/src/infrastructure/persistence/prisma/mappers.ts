import type { Contribution, Event, User, Wallet, WalletTransaction } from '@prisma/client';
import type {
  ContributionRecord,
  EventRecord,
  UserRecord,
  WalletRecord,
  WalletTransactionRecord,
} from '../../../domain/models';

/**
 * Frontera entre el ORM y el dominio. Lo importante de `toUser` es lo que NO
 * copia: `passwordHash` no puede viajar en un UserRecord ni por accidente.
 */
export const toUser = (row: User): UserRecord => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  createdAt: row.createdAt,
});

export const toWallet = (row: Wallet): WalletRecord => ({
  id: row.id,
  userId: row.userId,
  balanceCents: row.balanceCents,
  currency: row.currency,
});

export const toWalletTransaction = (row: WalletTransaction): WalletTransactionRecord => ({
  id: row.id,
  walletId: row.walletId,
  eventId: row.eventId,
  amountCents: row.amountCents,
  type: row.type,
  idempotencyKey: row.idempotencyKey,
  createdAt: row.createdAt,
});

export const toEvent = (row: Event): EventRecord => ({
  id: row.id,
  uuid: row.uuid,
  slug: row.slug,
  userId: row.userId,
  title: row.title,
  description: row.description,
  currency: row.currency,
  revealAt: row.revealAt,
  isRevealed: row.isRevealed,
  revealedAt: row.revealedAt,
  settledTotalCents: row.settledTotalCents,
  createdAt: row.createdAt,
});

export const toContribution = (row: Contribution): ContributionRecord => ({
  id: row.id,
  eventId: row.eventId,
  amountCents: row.amountCents,
  displayName: row.displayName,
  isAnonymous: row.isAnonymous,
  message: row.message,
  status: row.status,
  paymentRef: row.paymentRef,
  createdAt: row.createdAt,
});
