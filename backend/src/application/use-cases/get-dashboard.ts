import { NotFound } from '../../domain/errors';
import type { ContributionRecord, EventRecord } from '../../domain/models';
import type { Clock } from '../../domain/ports/clock';
import type {
  ContributionRepository,
  EventRepository,
  WalletRepository,
} from '../../domain/ports/repositories';

export interface WalletCredit {
  amountCents: number;
  transactionId: string;
}

/** Todo lo que el presenter necesita para decidir qué cifras salen del servidor. */
export interface DashboardData {
  event: EventRecord;
  contributions: ContributionRecord[];
  pendingRefundCount: number;
  walletBalanceCents: number;
  walletCredit: WalletCredit | null;
  now: Date;
}

export class GetDashboard {
  constructor(
    private readonly events: EventRepository,
    private readonly contributions: ContributionRepository,
    private readonly wallets: WalletRepository,
    private readonly clock: Clock,
  ) {}

  async execute(eventId: string, userId: string): Promise<DashboardData> {
    const event = await this.events.findOwned(eventId, userId);
    // Cajita ajena y cajita inexistente dan exactamente la misma respuesta.
    if (!event) throw NotFound('Cajita no encontrada');
    return this.forEvent(event, userId, null);
  }

  /** Reutilizable por RevealAndSettle, que ya tiene el evento recién actualizado. */
  async forEvent(
    event: EventRecord,
    userId: string,
    walletCredit: WalletCredit | null,
  ): Promise<DashboardData> {
    const [contributions, pendingRefundCount, wallet] = await Promise.all([
      this.contributions.listByStatus(event.id, 'SUCCEEDED'),
      this.contributions.countByStatus(event.id, 'VOIDED'),
      this.wallets.findByUserId(userId),
    ]);

    return {
      event,
      contributions,
      pendingRefundCount,
      walletBalanceCents: wallet?.balanceCents ?? 0,
      walletCredit,
      now: this.clock.now(),
    };
  }
}
