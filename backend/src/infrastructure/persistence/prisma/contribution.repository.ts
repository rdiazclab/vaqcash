import type { ContributionRecord, PaymentStatus } from '../../../domain/models';
import type {
  ContributionRepository,
  CreateContributionInput,
} from '../../../domain/ports/repositories';
import type { PrismaLike } from './client';
import { toContribution } from './mappers';

export class PrismaContributionRepository implements ContributionRepository {
  constructor(private readonly db: PrismaLike) {}

  async create(input: CreateContributionInput): Promise<ContributionRecord> {
    return toContribution(
      await this.db.contribution.create({
        data: {
          eventId: input.eventId,
          amountCents: input.amountCents,
          displayName: input.displayName,
          isAnonymous: input.isAnonymous,
          message: input.message,
          status: 'PENDING',
        },
      }),
    );
  }

  async setPaymentRef(id: string, paymentRef: string): Promise<void> {
    await this.db.contribution.update({ where: { id }, data: { paymentRef } });
  }

  async setStatus(id: string, status: PaymentStatus): Promise<ContributionRecord> {
    return toContribution(await this.db.contribution.update({ where: { id }, data: { status } }));
  }

  async listByStatus(eventId: string, status: PaymentStatus): Promise<ContributionRecord[]> {
    const rows = await this.db.contribution.findMany({
      where: { eventId, status },
      // createdAt asc con desempate por id: el orden de los sobres es determinista
      // incluso si dos inserts caen en el mismo milisegundo.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toContribution);
  }

  countByStatus(eventId: string, status: PaymentStatus): Promise<number> {
    return this.db.contribution.count({ where: { eventId, status } });
  }

  async sumByStatus(eventId: string, status: PaymentStatus): Promise<number> {
    const agg = await this.db.contribution.aggregate({
      where: { eventId, status },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0;
  }
}
