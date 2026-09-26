import type {
  AuditAction,
  ContributionRecord,
  EventRecord,
  LockedEvent,
  LockedWallet,
  PaymentMethod,
  PaymentStatus,
  UserRecord,
  WalletRecord,
  WalletTransactionRecord,
} from '../models';

// --- Usuarios --------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  currency: string;
}

export interface UserWithSecret {
  user: UserRecord;
  passwordHash: string;
}

export interface UserRepository {
  /**
   * Crea el usuario y su Wallet en la MISMA transacción: nunca existe un
   * organizador sin monedero. Lanza `EmailTaken` si el email ya está tomado.
   */
  createWithWallet(input: CreateUserInput): Promise<{ user: UserRecord; wallet: WalletRecord }>;
  findByEmailWithSecret(email: string): Promise<UserWithSecret | null>;
  findById(id: string): Promise<UserRecord | null>;
}

// --- Wallet ---------------------------------------------------------------

export interface CreditRevealInput {
  walletId: string;
  eventId: string;
  amountCents: number;
  /** "reveal:<eventId>". El UNIQUE sobre esta clave es lo que hace el pago exactamente-una-vez. */
  idempotencyKey: string;
}

export interface WalletTransactionView extends WalletTransactionRecord {
  eventTitle: string | null;
}

export interface WithdrawInput {
  walletId: string;
  /** Positivo: el importe que pide el organizador. El asiento se guarda en negativo. */
  amountCents: number;
  /** Única por retiro; el UNIQUE del ledger impide duplicar un asiento. */
  idempotencyKey: string;
}

export interface WalletRepository {
  findByUserId(userId: string): Promise<WalletRecord | null>;
  /**
   * Inserta el asiento en el ledger y acredita el saldo. Lanza
   * `DuplicateIdempotencyKey` si esa clave ya existe.
   */
  creditReveal(input: CreditRevealInput): Promise<WalletTransactionRecord>;
  listTransactions(walletId: string): Promise<WalletTransactionView[]>;
  /**
   * Asienta el retiro con `amountCents` NEGATIVO y baja el saldo en la misma
   * operación, para que la suma del ledger siga siendo exactamente el balance.
   * Sólo es seguro llamarlo con la fila de la wallet bloqueada.
   */
  withdraw(input: WithdrawInput): Promise<WalletTransactionRecord>;
  /** Suma de todo el ledger. Existe para auditar que el balance no derivó. */
  sumLedger(walletId: string): Promise<number>;
}

/**
 * Port del lock pesimista sobre la fila de la WALLET. Mismo patrón que
 * EventLocker, distinto recurso: aquí lo que se protege es el saldo. Comprobar
 * el saldo y gastarlo sin este lock es el doble gasto clásico.
 */
export interface WalletLocker {
  withWalletLock<T>(
    userId: string,
    fn: (locked: LockedWallet, repos: RepositoryBundle) => Promise<T>,
  ): Promise<T>;
}

// --- Cajitas --------------------------------------------------------------

export interface CreateEventInput {
  userId: string;
  uuid: string;
  slug: string;
  title: string;
  description: string | null;
  currency: string;
  revealAt: Date | null;
}

export interface EventSummary {
  id: string;
  uuid: string;
  title: string;
  envelopeCount: number;
  isRevealed: boolean;
  createdAt: Date;
}

export interface EventRepository {
  create(input: CreateEventInput): Promise<EventRecord>;
  findByUuid(uuid: string): Promise<EventRecord | null>;
  /** Propiedad y existencia en la misma consulta: la cajita ajena es indistinguible de la inexistente. */
  findOwned(id: string, userId: string): Promise<EventRecord | null>;
  listByUser(userId: string, now: Date): Promise<EventSummary[]>;
  markRevealed(id: string, revealedAt: Date, settledTotalCents: number): Promise<EventRecord>;
}

// --- Aportes --------------------------------------------------------------

export interface CreateContributionInput {
  eventId: string;
  amountCents: number;
  displayName: string;
  isAnonymous: boolean;
  message: string | null;
}

export interface ContributionRepository {
  create(input: CreateContributionInput): Promise<ContributionRecord>;
  setPaymentRef(id: string, paymentRef: string): Promise<void>;
  setStatus(id: string, status: PaymentStatus): Promise<ContributionRecord>;
  listByStatus(eventId: string, status: PaymentStatus): Promise<ContributionRecord[]>;
  countByStatus(eventId: string, status: PaymentStatus): Promise<number>;
  sumByStatus(eventId: string, status: PaymentStatus): Promise<number>;
}

// --- Auditoría ------------------------------------------------------------

export interface AuditEntry {
  action: AuditAction;
  eventId?: string | null;
  contributionId?: string | null;
  /** Identidad REAL del remitente, aunque el aporte se muestre como anónimo. */
  realSenderName?: string | null;
  realSenderEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Append-only: sólo inserta. No hay lectura porque la API no expone auditoría. */
export interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
}

// --- Transacciones con lock de fila --------------------------------------

/** Los repositorios ligados a una transacción abierta. */
export interface RepositoryBundle {
  events: EventRepository;
  contributions: ContributionRepository;
  wallets: WalletRepository;
  audit: AuditRepository;
}

/**
 * Port del lock pesimista. La implementación abre una transacción, fija
 * `lock_timeout` y toma `SELECT ... FOR UPDATE` sobre la fila del evento.
 * Que tanto el aporte como la revelación pasen por aquí es lo que hace verdad
 * que "el total anunciado nunca cambia".
 *
 * La contención se traduce a un 503 (`LOCK_BUSY`), nunca a un 500.
 */
export interface EventLocker {
  withEventLock<T>(
    eventId: string,
    fn: (locked: LockedEvent, repos: RepositoryBundle) => Promise<T>,
  ): Promise<T>;
}

/** Contexto de la petición que sólo la auditoría puede ver. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  method: PaymentMethod;
}
