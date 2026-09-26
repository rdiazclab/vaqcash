import type { DashboardData } from '../../../application/use-cases/get-dashboard';
import type { PublicBoxData } from '../../../application/use-cases/get-public-box';
import { ANONYMOUS_DISPLAY_NAME, type EventRecord } from '../../../domain/models';
import { isEffectivelyRevealed } from '../../../domain/policies/reveal.policy';
import { boxShareUrl } from '../../../domain/share-url';
import type { EventSummary } from '../../../domain/ports/repositories';

/**
 * Mientras la cajita está sellada los sobres son INDISTINGUIBLES entre sí.
 * Tampoco viaja `isAnonymous`: ese flag, cruzado con la hora de llegada y pocos
 * aportantes, desanonimiza por deducción — el anfitrión sabe quién le escribió a
 * qué hora. Sólo aparece al abrir, donde ya no añade información nueva porque el
 * displayName es Anónimo.
 */
export interface SealedEnvelope {
  id: string;
  createdAt: string;
}

export interface OpenEnvelope extends SealedEnvelope {
  isAnonymous: boolean;
  amountCents: number;
  displayName: string;
  message: string | null;
}

/** Campos comunes a sellada y revelada. Ni uno de ellos es una cifra de dinero. */
function baseView(event: EventRecord, revealed: boolean, envelopeCount: number, shareUrl: string) {
  return {
    id: event.id,
    uuid: event.uuid,
    title: event.title,
    description: event.description,
    currency: event.currency,
    revealAt: event.revealAt?.toISOString() ?? null,
    revealedAt: event.revealedAt?.toISOString() ?? null,
    envelopeCount,
    isRevealed: revealed,
    shareUrl,
  };
}

/**
 * The ONLY place allowed to decide which numbers leave the server.
 *
 * Mientras la cajita está sellada no se serializa NINGÚN monto: ni el total, ni
 * el de cada sobre, ni el saldo del monedero — nada que permita deducirlos.
 * Y ni sellada ni revelada sale de aquí la identidad real de un anónimo: el
 * presenter sólo ve `displayName`, que para un anónimo ya es "Anónimo".
 */
export function presentDashboard(data: DashboardData, publicWebUrl: string) {
  const { event, contributions } = data;
  const revealed = isEffectivelyRevealed(event, data.now);
  const base = baseView(event, revealed, contributions.length, boxShareUrl(publicWebUrl, event.uuid));

  if (!revealed) {
    return {
      ...base,
      totalCents: null,
      envelopes: contributions.map<SealedEnvelope>((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  return {
    ...base,
    totalCents: contributions.reduce((sum, c) => sum + c.amountCents, 0),
    settledTotalCents: event.settledTotalCents,
    walletBalanceCents: data.walletBalanceCents,
    /**
     * Sólo el conteo: el creador no puede reembolsar nada, así que ver el monto de
     * un sobre anulado le daría un dato sobre el que no puede actuar, de una
     * transacción que además se está revirtiendo. Basta con que sepa que ocurrió.
     */
    pendingRefundCount: data.pendingRefundCount,
    ...(data.walletCredit ? { walletCredit: data.walletCredit } : {}),
    envelopes: contributions.map<OpenEnvelope>((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      isAnonymous: c.isAnonymous,
      amountCents: c.amountCents,
      displayName: c.isAnonymous ? ANONYMOUS_DISPLAY_NAME : c.displayName,
      message: c.message,
    })),
  };
}

/** Guest-facing view: never exposes totals or other people's envelopes. */
export function presentPublicBox(data: PublicBoxData) {
  return {
    uuid: data.event.uuid,
    title: data.event.title,
    description: data.event.description,
    currency: data.event.currency,
    envelopeCount: data.envelopeCount,
    isRevealed: isEffectivelyRevealed(data.event, data.now),
    revealAt: data.event.revealAt?.toISOString() ?? null,
  };
}

/** Listado del organizador: títulos y conteos, nunca importes. */
export function presentEventSummary(summary: EventSummary) {
  return {
    id: summary.id,
    uuid: summary.uuid,
    title: summary.title,
    envelopeCount: summary.envelopeCount,
    isRevealed: summary.isRevealed,
    createdAt: summary.createdAt.toISOString(),
  };
}
