/**
 * Mirrors docs/API.md (v2) literally. Money is always an integer number of
 * cents; nothing in this file ever holds a decimal amount.
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthPayload {
  token: string;
  user: User;
}

export interface WalletSummary {
  balanceCents: number;
  currency: string;
}

export interface Withdrawal {
  transactionId: string;
  amountCents: number;
  balanceCents: number;
}

export interface MeResponse {
  user: User;
  wallet: WalletSummary;
}

/**
 * While the box is sealed the server sends no amount, and no anonymity flag
 * either: with few contributors, "envelope 3 is anonymous" plus its timestamp
 * is enough to deduce who it was. Every sealed envelope looks the same.
 */
export interface SealedEnvelope {
  id: string;
  createdAt: string;
}

export interface OpenEnvelope extends SealedEnvelope {
  isAnonymous: boolean;
  amountCents: number;
  displayName: string;
  message: string | null;
}

export type Envelope = SealedEnvelope | OpenEnvelope;

interface DashboardCommon {
  id: string;
  uuid: string;
  title: string;
  description: string | null;
  currency: string;
  revealAt: string | null;
  revealedAt: string | null;
  envelopeCount: number;
  isRevealed: boolean;
  shareUrl: string;
}

export interface SealedDashboardView extends DashboardCommon {
  isRevealed: false;
  totalCents: null;
  envelopes: SealedEnvelope[];
}

export interface WalletCredit {
  amountCents: number;
  transactionId: string;
}

export interface RevealedDashboardView extends DashboardCommon {
  isRevealed: true;
  totalCents: number;
  settledTotalCents: number;
  walletBalanceCents: number;
  pendingRefundCount: number;
  /** Only present on the POST /reveal response. */
  walletCredit?: WalletCredit;
  envelopes: OpenEnvelope[];
}

export type DashboardView = SealedDashboardView | RevealedDashboardView;

export interface EventListItem {
  id: string;
  uuid: string;
  title: string;
  envelopeCount: number;
  isRevealed: boolean;
  createdAt: string;
}

export interface CreateEventResponse {
  event: DashboardView;
  shareUrl: string;
  qrDataUrl: string;
}

export interface QrResponse {
  qrDataUrl: string;
  shareUrl: string;
}

/** What a guest is allowed to know. No totals, ever. */
export interface PublicBoxView {
  uuid: string;
  title: string;
  description: string | null;
  currency: string;
  envelopeCount: number;
  isRevealed: boolean;
}

export type PaymentMethod = 'CARD' | 'QR' | 'LINK';

export interface ContributionInput {
  amountCents: number;
  displayName?: string;
  isAnonymous: boolean;
  message?: string;
  method: PaymentMethod;
}

export interface Receipt {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  paymentRef: string | null;
  boxTitle: string;
  createdAt: string;
}

export type WalletTransactionType = 'CREDIT' | 'WITHDRAWAL' | 'REFUND' | string;

export interface WalletTransaction {
  id: string;
  amountCents: number;
  type: WalletTransactionType;
  eventTitle: string;
  createdAt: string;
}

export interface WalletView {
  balanceCents: number;
  currency: string;
  transactions: WalletTransaction[];
}

export function isOpenEnvelope(envelope: Envelope): envelope is OpenEnvelope {
  return 'amountCents' in envelope;
}

export function isRevealed(view: DashboardView): view is RevealedDashboardView {
  return view.isRevealed;
}
