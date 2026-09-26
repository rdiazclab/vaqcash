import { describe, expect, it } from 'vitest';
import type { DashboardData } from '../src/application/use-cases/get-dashboard';
import { toMajorString } from '../src/domain/money';
import type { ContributionRecord, EventRecord } from '../src/domain/models';
import { presentDashboard, presentPublicBox } from '../src/interfaces/http/presenters/event.presenter';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const WEB = 'http://localhost:5175';

/** Ids are letter-only on purpose: the JSON leak assertions must not trip on cuid digits. */
function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'evt-aaaa',
    uuid: 'uuid-aaaa',
    slug: 'boda-de-ana',
    userId: 'usr-aaaa',
    title: 'Boda de Ana',
    description: 'Sobres para la luna de miel',
    currency: 'COP',
    revealAt: null,
    isRevealed: false,
    revealedAt: null,
    settledTotalCents: null,
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    ...overrides,
  };
}

function makeContribution(overrides: Partial<ContributionRecord> = {}): ContributionRecord {
  return {
    id: 'ctr-aaaa',
    eventId: 'evt-aaaa',
    amountCents: 1234500,
    displayName: 'Pedro',
    isAnonymous: false,
    message: 'Felicidades',
    status: 'SUCCEEDED',
    paymentRef: 'simref',
    createdAt: new Date('2026-09-21T10:00:00.000Z'),
    ...overrides,
  };
}

const AMOUNTS = [1234500, 987600, 45000];
const TOTAL = AMOUNTS.reduce((a, b) => a + b, 0); // 2267100
const WALLET_BALANCE = 7654300;

const CONTRIBUTIONS: ContributionRecord[] = [
  makeContribution({ id: 'ctr-aaaa', amountCents: AMOUNTS[0], displayName: 'Pedro' }),
  makeContribution({
    id: 'ctr-bbbb',
    amountCents: AMOUNTS[1],
    displayName: 'Anónimo',
    isAnonymous: true,
    message: null,
    createdAt: new Date('2026-09-22T10:00:00.000Z'),
  }),
  makeContribution({
    id: 'ctr-cccc',
    amountCents: AMOUNTS[2],
    displayName: 'Lucía',
    createdAt: new Date('2026-09-23T10:00:00.000Z'),
  }),
];

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    event: makeEvent(),
    contributions: CONTRIBUTIONS,
    pendingRefundCount: 0,
    walletBalanceCents: WALLET_BALANCE,
    walletCredit: null,
    now: NOW,
    ...overrides,
  };
}

const view = (overrides: Partial<DashboardData> = {}) => presentDashboard(data(overrides), WEB);

/** The presenter returns a sealed|revealed union; widen it for assertions. */
type AnyEnvelope = {
  id: string;
  createdAt: string;
  isAnonymous: boolean;
  amountCents?: number;
  displayName?: string;
  message?: string | null;
};
function envelopesOf(v: ReturnType<typeof presentDashboard>): AnyEnvelope[] {
  return v.envelopes as AnyEnvelope[];
}

/** Every number anywhere in the payload, however deeply nested. */
function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

describe('presentDashboard — sealed box', () => {
  it('reports the envelope count but no numbers at all', () => {
    const v = view();

    expect(v.isRevealed).toBe(false);
    expect(v.envelopeCount).toBe(3);
    expect(v.totalCents).toBeNull();
    expect(v.envelopes).toHaveLength(3);
    for (const envelope of envelopesOf(v)) {
      expect(envelope).not.toHaveProperty('amountCents');
      expect(envelope).not.toHaveProperty('displayName');
      expect(envelope).not.toHaveProperty('message');
      // Sin isAnonymous: cruzarlo con createdAt desanonimiza por deducción.
      expect(envelope).not.toHaveProperty('isAnonymous');
      expect(Object.keys(envelope).sort()).toEqual(['createdAt', 'id']);
    }
  });

  it('REGRESSION GUARD: the serialized sealed view contains no amount substring', () => {
    const serialized = JSON.stringify(view());

    for (const amount of AMOUNTS) {
      expect(serialized).not.toContain(String(amount));
    }
    expect(serialized).not.toContain(String(TOTAL));
    expect(serialized).not.toContain('amountCents');
    expect(serialized).not.toContain('isAnonymous');
    // Ni colado como cadena en unidad mayor. El divisor sale del exponente de la
    // moneda, no de un 100 fijo: en COP la unidad mayor es el propio entero.
    for (const amount of [...AMOUNTS, TOTAL]) {
      expect(serialized).not.toContain(toMajorString(amount, 'COP'));
      expect(serialized).not.toContain(toMajorString(amount, 'USD'));
    }
  });

  it('REGRESSION GUARD: no number in the sealed payload equals an amount or the total', () => {
    const numbers = collectNumbers(view());
    for (const forbidden of [...AMOUNTS, TOTAL]) {
      expect(numbers).not.toContain(forbidden);
    }
  });

  it('REGRESSION GUARD: the wallet balance is not serialized while sealed either', () => {
    const v = view();
    const serialized = JSON.stringify(v);

    expect(v).not.toHaveProperty('walletBalanceCents');
    expect(v).not.toHaveProperty('settledTotalCents');
    expect(v).not.toHaveProperty('pendingRefundCount');
    expect(serialized).not.toContain(String(WALLET_BALANCE));
  });

  it('REGRESSION GUARD: walletCredit never appears while sealed, even if handed one', () => {
    const v = view({ walletCredit: { amountCents: TOTAL, transactionId: 'wtx-aaaa' } });
    expect(v).not.toHaveProperty('walletCredit');
    expect(JSON.stringify(v)).not.toContain(String(TOTAL));
  });

  it('stays sealed when revealAt is in the future', () => {
    const v = view({ event: makeEvent({ revealAt: new Date(NOW.getTime() + 3_600_000) }) });
    expect(v.isRevealed).toBe(false);
    expect(v.totalCents).toBeNull();
    expect(JSON.stringify(v)).not.toContain(String(AMOUNTS[0]));
  });

  it('exposes the identity fields the organizer needs while sealed', () => {
    const v = view();
    expect(v.uuid).toBe('uuid-aaaa');
    expect(v.shareUrl).toBe(`${WEB}/caja/uuid-aaaa`);
    expect(v.currency).toBe('COP');
    expect(v.revealedAt).toBeNull();
    // El slug interno no forma parte del contrato y no sale.
    expect(v).not.toHaveProperty('slug');
    expect(JSON.stringify(v)).not.toContain('boda-de-ana');
  });

  it('a sealed box with zero envelopes still hides the total', () => {
    const v = view({ contributions: [] });
    expect(v.envelopeCount).toBe(0);
    expect(v.totalCents).toBeNull();
    expect(v.envelopes).toEqual([]);
  });
});

describe('presentDashboard — revealed box', () => {
  const revealedEvent = makeEvent({ isRevealed: true, revealedAt: NOW, settledTotalCents: TOTAL });

  it('manual reveal exposes the exact total and every amount', () => {
    const v = view({ event: revealedEvent });

    expect(v.isRevealed).toBe(true);
    expect(v.totalCents).toBe(TOTAL);
    expect(v.revealedAt).toBe(NOW.toISOString());
    expect(envelopesOf(v).map((e) => e.amountCents)).toEqual(AMOUNTS);
  });

  it('exposes settledTotalCents, the wallet balance and the refund COUNT', () => {
    const v = presentDashboard(data({ event: revealedEvent, pendingRefundCount: 2 }), WEB) as Record<string, unknown>;

    expect(v.settledTotalCents).toBe(TOTAL);
    expect(v.walletBalanceCents).toBe(WALLET_BALANCE);
    expect(v.pendingRefundCount).toBe(2);
  });

  it('pendingRefundCount is a count: the VOIDED amounts are never in the payload', () => {
    const voidedAmount = 6543200;
    const v = presentDashboard(data({ event: revealedEvent, pendingRefundCount: 1 }), WEB);
    expect(JSON.stringify(v)).not.toContain(String(voidedAmount));
    expect((v as Record<string, unknown>).pendingRefundCount).toBe(1);
    expect(v).not.toHaveProperty('pendingRefunds');
  });

  it('walletCredit only appears when one is handed in (it is the reveal response)', () => {
    const without = view({ event: revealedEvent });
    expect(without).not.toHaveProperty('walletCredit');

    const withCredit = presentDashboard(
      data({ event: revealedEvent, walletCredit: { amountCents: TOTAL, transactionId: 'wtx-aaaa' } }),
      WEB,
    ) as Record<string, unknown>;
    expect(withCredit.walletCredit).toEqual({ amountCents: TOTAL, transactionId: 'wtx-aaaa' });
  });

  it('scheduled reveal in the past opens it without the manual flag', () => {
    const v = view({ event: makeEvent({ revealAt: new Date(NOW.getTime() - 1) }) });
    expect(v.isRevealed).toBe(true);
    expect(v.totalCents).toBe(TOTAL);
    // Un revealAt vencido no pasa por la liquidación, así que no hay total liquidado.
    expect((v as Record<string, unknown>).settledTotalCents).toBeNull();
  });

  it('anonymous envelopes are labelled "Anónimo"', () => {
    const envelopes = envelopesOf(view({ event: revealedEvent }));

    expect(envelopes[0].displayName).toBe('Pedro');
    expect(envelopes[1].isAnonymous).toBe(true);
    expect(envelopes[1].displayName).toBe('Anónimo');
    expect(envelopes[2].displayName).toBe('Lucía');
  });

  it('REGRESSION GUARD: an anonymous row whose displayName was tampered with still reads "Anónimo"', () => {
    // Defensa en profundidad: aunque alguien escribiera el nombre real en la
    // fila, el presenter sigue siendo la última palabra.
    const tampered = makeContribution({ id: 'ctr-eeee', isAnonymous: true, displayName: 'Nombre Real Filtrado' });
    const v = view({ event: revealedEvent, contributions: [tampered] });

    expect(envelopesOf(v)[0].displayName).toBe('Anónimo');
    expect(JSON.stringify(v)).not.toContain('Nombre Real Filtrado');
  });

  it('an empty revealed box totals zero, not null', () => {
    const v = view({ event: makeEvent({ isRevealed: true, settledTotalCents: 0 }), contributions: [] });
    expect(v.totalCents).toBe(0);
    expect(v.envelopeCount).toBe(0);
  });
});

describe('presentPublicBox', () => {
  it('never exposes totals, envelopes or the internal id', () => {
    const v = presentPublicBox({ event: makeEvent(), envelopeCount: 3, now: NOW });
    const serialized = JSON.stringify(v);

    expect(v.uuid).toBe('uuid-aaaa');
    expect(v.envelopeCount).toBe(3);
    expect(v.isRevealed).toBe(false);
    expect(v).not.toHaveProperty('totalCents');
    expect(v).not.toHaveProperty('envelopes');
    expect(v).not.toHaveProperty('id');
    expect(v).not.toHaveProperty('userId');
    expect(serialized).not.toContain('evt-aaaa');
    expect(serialized).not.toContain('usr-aaaa');
    for (const amount of AMOUNTS) expect(serialized).not.toContain(String(amount));
  });

  it('mirrors the reveal policy once the schedule has passed', () => {
    const event = makeEvent({ revealAt: new Date(NOW.getTime() - 1) });
    expect(presentPublicBox({ event, envelopeCount: 1, now: NOW }).isRevealed).toBe(true);
  });
});
