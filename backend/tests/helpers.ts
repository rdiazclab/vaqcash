import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';

/**
 * Wipes every table so each test starts from an empty database. El orden lo
 * resuelve CASCADE, pero se listan todas para que añadir una tabla y olvidarla
 * salte como fallo y no como test contaminado.
 */
export async function resetDb(db: PrismaClient) {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "WalletTransaction", "Contribution", "Event", "Wallet", "User" RESTART IDENTITY CASCADE',
  );
}

export type AnyEnvelope = {
  id: string;
  createdAt: string;
  isAnonymous: boolean;
  amountCents?: number;
  displayName?: string;
  message?: string | null;
};

export type DashboardBody = {
  id: string;
  uuid: string;
  title: string;
  description: string | null;
  currency: string;
  revealAt: string | null;
  revealedAt: string | null;
  envelopeCount: number;
  isRevealed: boolean;
  shareUrl: string;
  totalCents: number | null;
  settledTotalCents?: number | null;
  walletBalanceCents?: number;
  pendingRefundCount?: number;
  walletCredit?: { amountCents: number; transactionId: string };
  envelopes: AnyEnvelope[];
};

export type WalletBody = {
  balanceCents: number;
  currency: string;
  transactions: { id: string; amountCents: number; type: string; eventTitle: string | null; createdAt: string }[];
};

/** Every number anywhere in a payload, however deeply nested. */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

/**
 * Polls a real condition instead of sleeping a guessed amount of time.
 * Throws with the label so a broken race test fails loudly instead of flaking.
 */
export async function waitFor(
  label: string,
  predicate: () => Promise<boolean>,
  { timeoutMs = 5_000, intervalMs = 5 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// --- Actores -------------------------------------------------------------

let emailSeq = 0;

export interface Organizer {
  token: string;
  userId: string;
  email: string;
  password: string;
  auth: <T extends { set: (k: string, v: string) => T }>(req: T) => T;
}

/** Da de alta un organizador real por HTTP: su wallet nace con él. */
export async function registerOrganizer(app: Express, displayName = 'Organizadora'): Promise<Organizer> {
  emailSeq += 1;
  const email = `org${emailSeq}.${Date.now()}@sobres.test`;
  const password = 'contrasena-larga-1';

  const res = await request(app).post('/api/auth/register').send({ email, password, displayName }).expect(201);
  return {
    token: res.body.token as string,
    userId: res.body.user.id as string,
    email,
    password,
    auth: (req) => req.set('authorization', `Bearer ${res.body.token}`),
  };
}

export interface Box {
  id: string;
  uuid: string;
  shareUrl: string;
  qrDataUrl: string;
  body: Record<string, unknown>;
}

export async function createBox(
  app: Express,
  org: Organizer,
  payload: Record<string, unknown> = {},
): Promise<Box> {
  const res = await org
    .auth(request(app).post('/api/events'))
    .send({ title: 'Boda de Ana', ...payload })
    .expect(201);
  return {
    id: res.body.event.id as string,
    uuid: res.body.event.uuid as string,
    shareUrl: res.body.shareUrl as string,
    qrDataUrl: res.body.qrDataUrl as string,
    body: res.body,
  };
}
