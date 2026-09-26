import { UnsupportedCurrency } from '../../domain/errors';
import { DEFAULT_CURRENCY, isSupportedCurrency } from '../../domain/money';
import type { EventRecord } from '../../domain/models';
import type { IdGenerator } from '../../domain/ports/id-generator';
import type { QrGenerator } from '../../domain/ports/qr-generator';
import type { EventRepository } from '../../domain/ports/repositories';
import { boxShareUrl } from '../../domain/share-url';

export interface CreateEventCommand {
  userId: string;
  title: string;
  description?: string | null;
  currency?: string;
  revealAt?: string | null;
}

export interface CreateEventResult {
  event: EventRecord;
  shareUrl: string;
  qrDataUrl: string;
}

export class CreateEvent {
  constructor(
    private readonly events: EventRepository,
    private readonly ids: IdGenerator,
    private readonly qr: QrGenerator,
    private readonly publicWebUrl: string,
  ) {}

  async execute(cmd: CreateEventCommand): Promise<CreateEventResult> {
    // La moneda se elige aquí y es inmutable: no hay ninguna ruta que la cambie.
    const currency = (cmd.currency ?? DEFAULT_CURRENCY).toUpperCase();
    if (!isSupportedCurrency(currency)) throw UnsupportedCurrency(currency);

    const event = await this.events.create({
      userId: cmd.userId,
      uuid: this.ids.uuid(),
      slug: this.ids.slug(cmd.title),
      title: cmd.title,
      description: cmd.description ?? null,
      currency,
      revealAt: cmd.revealAt ? new Date(cmd.revealAt) : null,
    });

    const shareUrl = boxShareUrl(this.publicWebUrl, event.uuid);
    return { event, shareUrl, qrDataUrl: await this.qr.toDataUrl(shareUrl) };
  }
}
