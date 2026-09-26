/** The error codes the API commits to, plus the transport failure case. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'EVENT_CLOSED'
  | 'EVENT_CLOSED_MID_PAYMENT'
  | 'ALREADY_REVEALED'
  | 'PAYMENT_DECLINED'
  | 'INSUFFICIENT_FUNDS'
  | 'UNSUPPORTED_CURRENCY'
  | 'LOCK_BUSY'
  | 'SETTLEMENT_BUSY'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status = 0,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Whether retrying the exact same request can plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.code === 'NETWORK_ERROR' || this.code === 'LOCK_BUSY' || this.code === 'SETTLEMENT_BUSY'
    );
  }

  get paymentRef(): string | null {
    const ref = this.details?.paymentRef;
    return typeof ref === 'string' ? ref : null;
  }

  /** INSUFFICIENT_FUNDS carries the real balance, so the UI can state it. */
  get balanceCents(): number | null {
    const balance = this.details?.balanceCents;
    return typeof balance === 'number' ? balance : null;
  }
}

/** Copy the user actually reads. Written per code, never a raw server string. */
const MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
  UNAUTHORIZED: 'Tu sesión no es válida. Vuelve a entrar.',
  NOT_FOUND: 'No encontramos esta cajita.',
  EMAIL_TAKEN: 'Ya existe una cuenta con ese correo.',
  EVENT_CLOSED: 'Esta cajita ya se abrió y no acepta más sobres.',
  EVENT_CLOSED_MID_PAYMENT: 'La cajita se abrió mientras procesábamos tu pago.',
  ALREADY_REVEALED: 'Esta cajita ya estaba abierta.',
  PAYMENT_DECLINED: 'El pago fue rechazado. Prueba con otro método.',
  INSUFFICIENT_FUNDS: 'No tienes saldo suficiente para ese retiro.',
  UNSUPPORTED_CURRENCY: 'Esa moneda no está disponible todavía.',
  LOCK_BUSY: 'Hay otra operación en curso. Inténtalo en un momento.',
  SETTLEMENT_BUSY: 'Estamos cerrando cuentas de esta cajita. Inténtalo de nuevo.',
  NETWORK_ERROR: 'No pudimos conectar con el servidor.',
  UNKNOWN: 'Algo salió mal de nuestro lado.',
};

export function humanMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? error.message;
  return MESSAGES.UNKNOWN;
}
