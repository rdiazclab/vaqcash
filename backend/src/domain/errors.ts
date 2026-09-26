export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Datos que el cliente necesita para actuar, p.ej. la referencia de un cobro a reembolsar. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const NotFound = (msg = 'Recurso no encontrado') => new AppError(404, 'NOT_FOUND', msg);
export const Unauthorized = (msg = 'No autorizado') => new AppError(401, 'UNAUTHORIZED', msg);
export const Conflict = (code: string, msg: string, details?: Record<string, unknown>) =>
  new AppError(409, code, msg, details);
export const PaymentDeclined = (msg = 'El pago fue rechazado') => new AppError(402, 'PAYMENT_DECLINED', msg);
export const ServiceUnavailable = (code: string, msg: string, details?: Record<string, unknown>) =>
  new AppError(503, code, msg, details);

/** Email ya registrado. Lo lanza el adaptador de persistencia al chocar el UNIQUE. */
export const EmailTaken = (msg = 'Ese email ya está registrado') =>
  new AppError(409, 'EMAIL_TAKEN', msg);

/**
 * Colisión del UNIQUE de `idempotencyKey`: alguien ya acreditó este pago.
 * Es la red de seguridad del pago exactamente-una-vez, no un error del usuario.
 */
export class DuplicateIdempotencyKey extends Error {
  constructor(readonly key: string) {
    super(`El movimiento ${key} ya fue registrado`);
  }
}

/** Moneda fuera de la tabla soportada. */
export const UnsupportedCurrency = (currency: string) =>
  new AppError(422, 'UNSUPPORTED_CURRENCY', `La moneda ${currency} no está soportada`, {
    currency,
  });

/** Retiro por encima del saldo. Lleva el saldo real para que la UI pueda corregirse. */
export const InsufficientFunds = (balanceCents: number) =>
  new AppError(409, 'INSUFFICIENT_FUNDS', 'Saldo insuficiente para este retiro', { balanceCents });
