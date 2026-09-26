import type { Clock } from '../../domain/ports/clock';
import type { EventRepository, EventSummary } from '../../domain/ports/repositories';

export class ListEvents {
  constructor(
    private readonly events: EventRepository,
    private readonly clock: Clock,
  ) {}

  execute(userId: string): Promise<EventSummary[]> {
    return this.events.listByUser(userId, this.clock.now());
  }
}
