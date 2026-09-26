import type { PaymentMethod } from '../models';

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  /** Idempotency / traceability reference owned by the caller (contribution id). */
  reference: string;
  /** Sólo afecta a la simulación de la pasarela; la regla de negocio no lo mira. */
  method: PaymentMethod;
}

export interface ChargeResult {
  ok: boolean;
  providerRef: string;
  declineReason?: string;
}

/**
 * Port. The event/contribution domain depends on this abstraction only,
 * so swapping the fake gateway for Stripe/MercadoPago touches no business rule.
 */
export interface PaymentGateway {
  charge(req: ChargeRequest): Promise<ChargeResult>;
}
