import { NotFound } from '../../domain/errors';
import type { QrGenerator } from '../../domain/ports/qr-generator';
import type { EventRepository } from '../../domain/ports/repositories';
import { boxShareUrl } from '../../domain/share-url';

export class GetEventQr {
  constructor(
    private readonly events: EventRepository,
    private readonly qr: QrGenerator,
    private readonly publicWebUrl: string,
  ) {}

  async execute(eventId: string, userId: string): Promise<{ shareUrl: string; qrDataUrl: string }> {
    const event = await this.events.findOwned(eventId, userId);
    if (!event) throw NotFound('Cajita no encontrada');

    const shareUrl = boxShareUrl(this.publicWebUrl, event.uuid);
    return { shareUrl, qrDataUrl: await this.qr.toDataUrl(shareUrl) };
  }
}
