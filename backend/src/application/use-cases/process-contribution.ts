import { AppError, Conflict, NotFound, PaymentDeclined, ServiceUnavailable } from '../../domain/errors';
import { ANONYMOUS_DISPLAY_NAME, type PaymentMethod } from '../../domain/models';
import { isEffectivelyRevealed } from '../../domain/policies/reveal.policy';
import type { Clock } from '../../domain/ports/clock';
import type { PaymentGateway } from '../../domain/ports/payment-gateway';
import type {
  ContributionRepository,
  EventLocker,
  EventRepository,
  RequestContext,
} from '../../domain/ports/repositories';
import type { AuditService } from '../services/audit.service';

export interface ContributeCommand {
  amountCents: number;
  /** Lo que escribió el invitado. Si aporta como anónimo, esto NO llega a Contribution. */
  displayName?: string | null;
  isAnonymous: boolean;
  message?: string | null;
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

/**
 * Orquesta: reservar cupo sellado -> cobrar -> liquidar.
 * La mecánica del cobro vive detrás de PaymentGateway; las reglas de revelación,
 * en reveal.policy. Este caso de uso no sabe que existe una base de datos.
 */
export class ProcessContribution {
  constructor(
    private readonly events: EventRepository,
    private readonly contributions: ContributionRepository,
    private readonly locker: EventLocker,
    private readonly payments: PaymentGateway,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async execute(uuid: string, cmd: ContributeCommand, ctx: RequestContext): Promise<Receipt> {
    const event = await this.events.findByUuid(uuid);
    if (!event) throw NotFound('Cajita no encontrada');

    // --- Reserva: la fila PENDING sólo nace si el cofre sigue cerrado bajo el lock.
    const pending = await this.locker.withEventLock(event.id, async (locked, repos) => {
      if (isEffectivelyRevealed(locked, this.clock.now())) {
        throw Conflict('EVENT_CLOSED', 'Esta cajita ya fue revelada y no acepta nuevos aportes');
      }
      return repos.contributions.create({
        eventId: locked.id,
        // La cajita sólo puede mostrar "Anónimo". El nombre real va a AuditLog.
        displayName: cmd.isAnonymous ? ANONYMOUS_DISPLAY_NAME : (cmd.displayName ?? ANONYMOUS_DISPLAY_NAME),
        amountCents: cmd.amountCents,
        isAnonymous: cmd.isAnonymous,
        message: cmd.message ?? null,
      });
    });

    // La auditoría guarda la identidad REAL, la IP y el user-agent. Nunca se expone.
    await this.audit.safeRecord({
      action: 'CONTRIBUTION_CREATED',
      eventId: event.id,
      contributionId: pending.id,
      realSenderName: cmd.displayName ?? null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        amountCents: cmd.amountCents,
        currency: event.currency,
        method: ctx.method,
        isAnonymous: cmd.isAnonymous,
      },
    });

    const charge = await this.payments.charge({
      amountCents: pending.amountCents,
      currency: event.currency,
      reference: pending.id,
      method: ctx.method,
    });

    // El rastro del cobro se persiste ANTES de pelear por el lock. Si algo falla
    // más abajo, el peor caso es una fila PENDING *con* referencia — reconciliable.
    // Guardarlo sólo dentro del lock dejaba dinero cobrado e ilocalizable.
    await this.contributions.setPaymentRef(pending.id, charge.providerRef);

    if (!charge.ok) {
      await this.contributions.setStatus(pending.id, 'FAILED');
      await this.audit.safeRecord({
        action: 'PAYMENT_DECLINED',
        eventId: event.id,
        contributionId: pending.id,
        realSenderName: cmd.displayName ?? null,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { paymentRef: charge.providerRef, declineReason: charge.declineReason ?? null },
      });
      throw PaymentDeclined(`Pago rechazado (${charge.declineReason})`);
    }

    // --- Liquidación bajo el mismo lock: si el cofre se abrió mientras cobrábamos,
    // este sobre NO puede entrar a un total ya anunciado.
    let settled;
    try {
      settled = await this.locker.withEventLock(event.id, async (locked, repos) =>
        repos.contributions.setStatus(
          pending.id,
          isEffectivelyRevealed(locked, this.clock.now()) ? 'VOIDED' : 'SUCCEEDED',
        ),
      );
    } catch (err) {
      if (err instanceof AppError && err.code === 'LOCK_BUSY') {
        throw ServiceUnavailable(
          'SETTLEMENT_BUSY',
          'Tu pago se registró pero no pudimos confirmarlo a tiempo. Guarda esta referencia para reclamar.',
          { paymentRef: charge.providerRef, contributionId: pending.id },
        );
      }
      throw err;
    }

    const auditBase = {
      eventId: event.id,
      contributionId: settled.id,
      realSenderName: cmd.displayName ?? null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    };

    if (settled.status === 'VOIDED') {
      await this.audit.safeRecord({
        ...auditBase,
        action: 'PAYMENT_VOIDED',
        metadata: {
          paymentRef: settled.paymentRef,
          amountCents: settled.amountCents,
          reason: 'event_closed_mid_payment',
        },
      });
      throw Conflict(
        'EVENT_CLOSED_MID_PAYMENT',
        'La cajita se abrió mientras procesábamos tu pago. El cobro será reembolsado.',
        { paymentRef: settled.paymentRef, contributionId: settled.id },
      );
    }

    await this.audit.safeRecord({
      ...auditBase,
      action: 'PAYMENT_SETTLED',
      metadata: {
        paymentRef: settled.paymentRef,
        amountCents: settled.amountCents,
        method: ctx.method,
      },
    });

    // Recibo del aportante: ve SU monto, jamás el total.
    return {
      id: settled.id,
      status: settled.status,
      amountCents: settled.amountCents,
      currency: event.currency,
      paymentRef: settled.paymentRef,
      boxTitle: event.title,
      createdAt: settled.createdAt.toISOString(),
    };
  }
}
