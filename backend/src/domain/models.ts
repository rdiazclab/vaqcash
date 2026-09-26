/**
 * Formas puras del dominio. Son estructuras, no filas de Prisma: la capa de
 * aplicación razona sobre estas y nunca sobre los tipos generados por el ORM.
 */

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'VOIDED';
export type WalletTxType = 'REVEAL_PAYOUT' | 'WITHDRAWAL' | 'ADJUSTMENT';
export type PaymentMethod = 'CARD' | 'QR' | 'LINK';

export type AuditAction =
  | 'CONTRIBUTION_CREATED'
  | 'PAYMENT_SETTLED'
  | 'PAYMENT_DECLINED'
  | 'PAYMENT_VOIDED'
  | 'EVENT_REVEALED'
  | 'WALLET_CREDITED'
  | 'WALLET_WITHDRAWN';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export interface WalletRecord {
  id: string;
  userId: string;
  balanceCents: number;
  currency: string;
}

export interface WalletTransactionRecord {
  id: string;
  walletId: string;
  eventId: string | null;
  amountCents: number;
  type: WalletTxType;
  idempotencyKey: string;
  createdAt: Date;
}

export interface EventRecord {
  id: string;
  uuid: string;
  slug: string;
  userId: string;
  title: string;
  description: string | null;
  currency: string;
  revealAt: Date | null;
  isRevealed: boolean;
  revealedAt: Date | null;
  settledTotalCents: number | null;
  createdAt: Date;
}

export interface ContributionRecord {
  id: string;
  eventId: string;
  amountCents: number;
  /** Lo ÚNICO que puede pintarse en pantalla: el nombre elegido, o "Anónimo". */
  displayName: string;
  isAnonymous: boolean;
  message: string | null;
  status: PaymentStatus;
  paymentRef: string | null;
  createdAt: Date;
}

/** La fila mínima del evento que se bloquea con SELECT ... FOR UPDATE. */
export interface LockedEvent {
  id: string;
  isRevealed: boolean;
  revealAt: Date | null;
}

/**
 * La fila de la wallet bloqueada con SELECT ... FOR UPDATE. Sin este lock, dos
 * retiros concurrentes leen el mismo saldo y lo dejan en negativo.
 */
export interface LockedWallet {
  id: string;
  userId: string;
  balanceCents: number;
  currency: string;
}

/** Etiqueta con la que la UI puede referirse a un aporte anónimo. */
export const ANONYMOUS_DISPLAY_NAME = 'Anónimo';
