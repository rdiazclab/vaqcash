import { DEFAULT_CURRENCY } from '../lib/money';
import { readLocal, writeLocal } from '../lib/storage';
import { DEMO_CREDENTIALS as CREDS } from './enable';
import type { PaymentMethod } from '../api/types';

/**
 * In-memory database for the mock API, mirrored into localStorage so the state
 * survives a reload and a client-side navigation. The real backend owns this
 * data; nothing here is a contract, only a plausible stand-in for one.
 */

export interface MockUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

export interface MockEnvelope {
  id: string;
  boxId: string;
  amountCents: number;
  /** The real name, kept even for anonymous envelopes, exactly like AuditLog. */
  realName: string;
  isAnonymous: boolean;
  message: string | null;
  method: PaymentMethod;
  paymentRef: string;
  createdAt: string;
}

export interface MockBox {
  id: string;
  uuid: string;
  ownerId: string;
  title: string;
  description: string | null;
  currency: string;
  revealAt: string | null;
  revealedAt: string | null;
  createdAt: string;
}

export interface MockTransaction {
  id: string;
  ownerId: string;
  /** Negative for a withdrawal, so the ledger still sums to the balance. */
  amountCents: number;
  type: 'CREDIT' | 'WITHDRAWAL' | 'REFUND';
  eventTitle: string;
  createdAt: string;
}

export interface MockDb {
  users: MockUser[];
  boxes: MockBox[];
  envelopes: MockEnvelope[];
  transactions: MockTransaction[];
  sessions: Record<string, string>;
}

const KEY = 'vaqcash:mockdb:v5';

export { DEMO_CREDENTIALS } from './enable';

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysAgo(days: number, hour = 12): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, (days * 7) % 60, 0, 0);
  return date.toISOString();
}

/**
 * The seed gives every screen a designed full state on first load. A freshly
 * registered organizer starts empty instead, which is how the empty states get
 * exercised.
 */
function seed(): MockDb {
  const owner: MockUser = {
    id: 'usr_ana',
    email: CREDS.email,
    password: CREDS.password,
    displayName: 'Ana Restrepo',
  };

  const sealed: MockBox = {
    id: 'box_grado',
    uuid: 'f7c1a94e-3b52-4d10-9a77-0e2b5c81d4aa',
    ownerId: owner.id,
    title: 'Grado de Mariana',
    description: 'Sobres para el grado. Nadie ve los montos hasta el brindis.',
    currency: DEFAULT_CURRENCY,
    revealAt: null,
    revealedAt: null,
    createdAt: daysAgo(6, 9),
  };

  const revealed: MockBox = {
    id: 'box_despedida',
    uuid: 'c3a9d0b1-77e4-4f8a-8c21-9b6f4e2d1a30',
    ownerId: owner.id,
    title: 'Despedida de Joaquín',
    description: 'Colecta de la oficina antes de que se mude a Medellín.',
    currency: DEFAULT_CURRENCY,
    revealAt: null,
    revealedAt: daysAgo(11, 20),
    createdAt: daysAgo(24, 10),
  };

  const envelopes: MockEnvelope[] = [
    mkEnvelope(sealed.id, 50000, 'Bruno Salas', false, 'Que te vaya bonito.', 'CARD', 5),
    mkEnvelope(sealed.id, 150000, 'Lucía Paredes', false, null, 'QR', 4),
    mkEnvelope(sealed.id, 80000, 'Tomás Vega', true, 'Con cariño.', 'LINK', 3),
    mkEnvelope(sealed.id, 200000, 'Camila Ortiz', false, '¡Felicidades, doctora!', 'CARD', 2),
    mkEnvelope(sealed.id, 120000, 'Ignacio Bermúdez', false, null, 'CARD', 1),

    mkEnvelope(revealed.id, 200000, 'Valeria Núñez', false, 'Buen viaje.', 'CARD', 26),
    mkEnvelope(revealed.id, 150000, 'Rodrigo Cárdenas', false, null, 'QR', 25),
    mkEnvelope(revealed.id, 50000, 'Sofía Miranda', true, null, 'LINK', 24),
  ];

  const revealedTotal = envelopes
    .filter((e) => e.boxId === revealed.id)
    .reduce((sum, e) => sum + e.amountCents, 0);

  return {
    users: [owner],
    boxes: [sealed, revealed],
    envelopes,
    transactions: [
      {
        id: 'txn_despedida',
        ownerId: owner.id,
        amountCents: revealedTotal,
        type: 'CREDIT',
        eventTitle: revealed.title,
        createdAt: revealed.revealedAt!,
      },
      {
        id: 'txn_retiro',
        ownerId: owner.id,
        amountCents: -100000,
        type: 'WITHDRAWAL',
        eventTitle: 'Retiro simulado',
        createdAt: daysAgo(9, 16),
      },
    ],
    sessions: {},
  };
}

function mkEnvelope(
  boxId: string,
  amountCents: number,
  realName: string,
  isAnonymous: boolean,
  message: string | null,
  method: PaymentMethod,
  days: number,
): MockEnvelope {
  return {
    id: uid('env'),
    boxId,
    amountCents,
    realName,
    isAnonymous,
    message,
    method,
    paymentRef: `PR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    createdAt: daysAgo(days),
  };
}

let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  const raw = readLocal(KEY);
  if (raw) {
    try {
      db = JSON.parse(raw) as MockDb;
      return db;
    } catch {
      // Corrupt snapshot: start from the seed rather than serving broken data.
    }
  }
  db = seed();
  persist();
  return db;
}

export function persist(): void {
  if (db) writeLocal(KEY, JSON.stringify(db));
}
