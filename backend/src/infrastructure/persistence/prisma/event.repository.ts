import type { EventRecord, PaymentStatus } from '../../../domain/models';
import { isEffectivelyRevealed } from '../../../domain/policies/reveal.policy';
import type {
  CreateEventInput,
  EventRepository,
  EventSummary,
} from '../../../domain/ports/repositories';
import type { PrismaLike } from './client';
import { toEvent } from './mappers';

const SUCCEEDED: PaymentStatus = 'SUCCEEDED';

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly db: PrismaLike) {}

  async create(input: CreateEventInput): Promise<EventRecord> {
    return toEvent(
      await this.db.event.create({
        data: {
          userId: input.userId,
          uuid: input.uuid,
          slug: input.slug,
          title: input.title,
          description: input.description,
          currency: input.currency,
          revealAt: input.revealAt,
        },
      }),
    );
  }

  async findByUuid(uuid: string): Promise<EventRecord | null> {
    const row = await this.db.event.findUnique({ where: { uuid } });
    return row ? toEvent(row) : null;
  }

  async findOwned(id: string, userId: string): Promise<EventRecord | null> {
    // El userId va en el WHERE, no en un `if` posterior: una cajita ajena
    // simplemente no existe para este organizador.
    const row = await this.db.event.findFirst({ where: { id, userId } });
    return row ? toEvent(row) : null;
  }

  async listByUser(userId: string, now: Date): Promise<EventSummary[]> {
    const rows = await this.db.event.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (rows.length === 0) return [];

    const counts = await this.db.contribution.groupBy({
      by: ['eventId'],
      where: { eventId: { in: rows.map((r) => r.id) }, status: SUCCEEDED },
      _count: { _all: true },
    });
    const byEvent = new Map(counts.map((c) => [c.eventId, c._count._all]));

    return rows.map((row) => ({
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      envelopeCount: byEvent.get(row.id) ?? 0,
      isRevealed: isEffectivelyRevealed(row, now),
      createdAt: row.createdAt,
    }));
  }

  async markRevealed(id: string, revealedAt: Date, settledTotalCents: number): Promise<EventRecord> {
    return toEvent(
      await this.db.event.update({
        where: { id },
        data: { isRevealed: true, revealedAt, settledTotalCents },
      }),
    );
  }
}
