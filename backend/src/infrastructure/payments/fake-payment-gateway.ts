import { randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import type { ChargeRequest, ChargeResult, PaymentGateway } from '../../domain/ports/payment-gateway';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Simulated PSP: network latency + configurable failure rate. No business logic here. */
export class FakePaymentGateway implements PaymentGateway {
  constructor(
    private readonly latencyMs = env.payment.latencyMs,
    private readonly failureRate = env.payment.failureRate,
  ) {}

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    await sleep(this.latencyMs);
    const providerRef = `sim_${req.reference.slice(0, 8)}_${randomBytes(4).toString('hex')}`;

    if (Math.random() < this.failureRate) {
      return { ok: false, providerRef, declineReason: 'insufficient_funds' };
    }
    return { ok: true, providerRef };
  }
}
