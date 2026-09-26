import { NotFound } from '../../domain/errors';
import type { EventRecord } from '../../domain/models';
import type { Clock } from '../../domain/ports/clock';
import type { ContributionRepository, EventRepository } from '../../domain/ports/repositories';

export interface PublicBoxData {
  event: EventRecord;
  envelopeCount: number;
  now: Date;
}

export class GetPublicBox {
  constructor(
    private readonly events: EventRepository,
    private readonly contributions: ContributionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(uuid: string): Promise<PublicBoxData> {
    const event = await this.events.findByUuid(uuid);
    if (!event) throw NotFound('Cajita no encontrada');

    const envelopeCount = await this.contributions.countByStatus(event.id, 'SUCCEEDED');
    return { event, envelopeCount, now: this.clock.now() };
  }
}
