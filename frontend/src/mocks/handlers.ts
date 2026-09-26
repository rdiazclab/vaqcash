import { HttpResponse, delay, http } from 'msw';
import QRCode from 'qrcode';
import type {
  ContributionInput,
  DashboardView,
  EventListItem,
  OpenEnvelope,
  Receipt,
  SealedEnvelope,
} from '../api/types';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../lib/money';
import {
  getDb,
  persist,
  uid,
  type MockBox,
  type MockDb,
  type MockEnvelope,
} from './db';

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
const url = (path: string) => `${BASE}${path}`;

type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'EVENT_CLOSED'
  | 'ALREADY_REVEALED'
  | 'PAYMENT_DECLINED'
  | 'INSUFFICIENT_FUNDS'
  | 'UNSUPPORTED_CURRENCY';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  EVENT_CLOSED: 409,
  ALREADY_REVEALED: 409,
  PAYMENT_DECLINED: 402,
  INSUFFICIENT_FUNDS: 409,
  UNSUPPORTED_CURRENCY: 422,
};

function fail(code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return HttpResponse.json({ error: { code, message, details } }, { status: STATUS[code] });
}

function currentUser(request: Request, db: MockDb) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = db.sessions[token];
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

const publicUser = (u: { id: string; email: string; displayName: string }) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
});

const shareUrlFor = (uuid: string) => `${window.location.origin}/caja/${uuid}`;

const qrFor = (uuid: string) =>
  QRCode.toDataURL(shareUrlFor(uuid), {
    margin: 1,
    width: 512,
    errorCorrectionLevel: 'M',
    // Monochrome on purpose: the QR belongs to the sealed half of the product.
    color: { dark: '#17171A', light: '#FFFFFF' },
  });

function balanceOf(db: MockDb, ownerId: string): number {
  return db.transactions
    .filter((t) => t.ownerId === ownerId)
    .reduce((sum, t) => sum + t.amountCents, 0);
}

/**
 * The single presenter. Everything that serializes a box goes through here, so
 * the invariant "a sealed box carries no amounts" is enforced in one place
 * instead of being re-checked at every call site.
 */
function present(
  db: MockDb,
  box: MockBox,
  options: { includeWalletCredit?: { amountCents: number; transactionId: string } } = {},
): DashboardView {
  const envelopes = db.envelopes
    .filter((e) => e.boxId === box.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const common = {
    id: box.id,
    uuid: box.uuid,
    title: box.title,
    description: box.description,
    currency: box.currency,
    revealAt: box.revealAt,
    revealedAt: box.revealedAt,
    envelopeCount: envelopes.length,
    shareUrl: shareUrlFor(box.uuid),
  };

  if (!box.revealedAt) {
    // No amount and no anonymity flag: two sealed envelopes are identical, so
    // nobody can deduce who contributed anonymously from the list alone.
    const sealed: SealedEnvelope[] = envelopes.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
    }));
    return { ...common, isRevealed: false, totalCents: null, envelopes: sealed };
  }

  const open: OpenEnvelope[] = envelopes.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    isAnonymous: e.isAnonymous,
    amountCents: e.amountCents,
    // The real identity of an anonymous envelope never leaves AuditLog.
    displayName: e.isAnonymous ? 'Anónimo' : e.realName,
    message: e.message,
  }));
  const total = open.reduce((sum, e) => sum + e.amountCents, 0);

  return {
    ...common,
    isRevealed: true,
    totalCents: total,
    settledTotalCents: total,
    walletBalanceCents: balanceOf(db, box.ownerId),
    pendingRefundCount: 0,
    ...(options.includeWalletCredit ? { walletCredit: options.includeWalletCredit } : {}),
    envelopes: open,
  };
}

/**
 * Reserved amount for the simulated gateway, so a decline is reachable without
 * inventing a field the contract does not have: 402 cents mirrors HTTP 402.
 */
const DECLINED_AMOUNT_CENTS = 402;

export const handlers = [
  http.post(url('/auth/register'), async ({ request }) => {
    const db = getDb();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? '';
    if (!email.includes('@') || (body.password ?? '').length < 8 || !body.displayName?.trim()) {
      return fail('VALIDATION_ERROR', 'Datos de registro inválidos.');
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return fail('EMAIL_TAKEN', 'Ese correo ya tiene cuenta.');
    }
    const user = {
      id: uid('usr'),
      email,
      password: body.password!,
      displayName: body.displayName.trim(),
    };
    db.users.push(user);
    const token = uid('tok');
    db.sessions[token] = user.id;
    persist();
    await delay(320);
    return HttpResponse.json({ token, user: publicUser(user) }, { status: 201 });
  }),

  http.post(url('/auth/login'), async ({ request }) => {
    const db = getDb();
    const body = (await request.json()) as { email?: string; password?: string };
    const user = db.users.find(
      (u) => u.email.toLowerCase() === (body.email ?? '').trim().toLowerCase(),
    );
    if (!user || user.password !== body.password) {
      return fail('UNAUTHORIZED', 'Correo o contraseña incorrectos.');
    }
    const token = uid('tok');
    db.sessions[token] = user.id;
    persist();
    await delay(280);
    return HttpResponse.json({ token, user: publicUser(user) });
  }),

  http.get(url('/me'), async ({ request }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    return HttpResponse.json({
      user: publicUser(user),
      wallet: { balanceCents: balanceOf(db, user.id), currency: DEFAULT_CURRENCY },
    });
  }),

  http.get(url('/events'), async ({ request }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    await delay(340);
    const list: EventListItem[] = db.boxes
      .filter((b) => b.ownerId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => ({
        id: b.id,
        uuid: b.uuid,
        title: b.title,
        envelopeCount: db.envelopes.filter((e) => e.boxId === b.id).length,
        isRevealed: Boolean(b.revealedAt),
        createdAt: b.createdAt,
      }));
    return HttpResponse.json(list);
  }),

  http.post(url('/events'), async ({ request }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      currency?: string;
      revealAt?: string | null;
    };
    if (!body.title?.trim() || body.title.trim().length < 3) {
      return fail('VALIDATION_ERROR', 'El nombre de la cajita es obligatorio.');
    }
    const currency = body.currency?.trim().toUpperCase() || DEFAULT_CURRENCY;
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
      return fail('UNSUPPORTED_CURRENCY', `La moneda ${currency} no está soportada.`);
    }
    const box: MockBox = {
      id: uid('box'),
      uuid: crypto.randomUUID(),
      ownerId: user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      currency,
      revealAt: body.revealAt ?? null,
      revealedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.boxes.push(box);
    persist();
    await delay(420);
    return HttpResponse.json(
      {
        event: present(db, box),
        shareUrl: shareUrlFor(box.uuid),
        qrDataUrl: await qrFor(box.uuid),
      },
      { status: 201 },
    );
  }),

  http.get(url('/events/:id/dashboard'), async ({ request, params }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    const box = db.boxes.find((b) => b.id === params.id && b.ownerId === user.id);
    // Someone else's box is a 404: we never confirm that it exists.
    if (!box) return fail('NOT_FOUND', 'Cajita no encontrada.');
    await delay(360);
    return HttpResponse.json(present(db, box));
  }),

  http.get(url('/events/:id/qr'), async ({ request, params }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    const box = db.boxes.find((b) => b.id === params.id && b.ownerId === user.id);
    if (!box) return fail('NOT_FOUND', 'Cajita no encontrada.');
    return HttpResponse.json({ qrDataUrl: await qrFor(box.uuid), shareUrl: shareUrlFor(box.uuid) });
  }),

  http.post(url('/events/:id/reveal'), async ({ request, params }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    const box = db.boxes.find((b) => b.id === params.id && b.ownerId === user.id);
    if (!box) return fail('NOT_FOUND', 'Cajita no encontrada.');
    if (box.revealedAt) return fail('ALREADY_REVEALED', 'Esta cajita ya se abrió.');

    const total = db.envelopes
      .filter((e) => e.boxId === box.id)
      .reduce((sum, e) => sum + e.amountCents, 0);

    box.revealedAt = new Date().toISOString();
    const transactionId = uid('txn');
    db.transactions.push({
      id: transactionId,
      ownerId: user.id,
      amountCents: total,
      type: 'CREDIT',
      eventTitle: box.title,
      createdAt: box.revealedAt,
    });
    persist();
    await delay(700);
    return HttpResponse.json(
      present(db, box, { includeWalletCredit: { amountCents: total, transactionId } }),
    );
  }),

  http.get(url('/caja/:uuid'), async ({ params }) => {
    const db = getDb();
    const box = db.boxes.find((b) => b.uuid === params.uuid);
    if (!box) return fail('NOT_FOUND', 'Cajita no encontrada.');
    await delay(300);
    return HttpResponse.json({
      uuid: box.uuid,
      title: box.title,
      description: box.description,
      currency: box.currency,
      envelopeCount: db.envelopes.filter((e) => e.boxId === box.id).length,
      isRevealed: Boolean(box.revealedAt),
    });
  }),

  http.post(url('/caja/:uuid/contributions'), async ({ request, params }) => {
    const db = getDb();
    const box = db.boxes.find((b) => b.uuid === params.uuid);
    if (!box) return fail('NOT_FOUND', 'Cajita no encontrada.');
    if (box.revealedAt) return fail('EVENT_CLOSED', 'La cajita ya se abrió.');

    const body = (await request.json()) as ContributionInput;
    if (!Number.isInteger(body.amountCents) || body.amountCents < 100) {
      return fail('VALIDATION_ERROR', 'El monto no es válido.');
    }
    if (!body.isAnonymous && !body.displayName?.trim()) {
      return fail('VALIDATION_ERROR', 'Falta tu nombre.');
    }
    if (!['CARD', 'QR', 'LINK'].includes(body.method)) {
      return fail('VALIDATION_ERROR', 'Método de pago desconocido.');
    }

    // Gateway simulation: believable latency, and one reserved card that fails.
    await delay(1500);
    if (body.amountCents === DECLINED_AMOUNT_CENTS) {
      return fail('PAYMENT_DECLINED', 'El emisor rechazó el cobro.');
    }

    const envelope: MockEnvelope = {
      id: uid('env'),
      boxId: box.id,
      amountCents: body.amountCents,
      realName: body.displayName?.trim() || 'Sin nombre',
      isAnonymous: body.isAnonymous,
      message: body.message?.trim() || null,
      method: body.method,
      paymentRef: `PR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };
    db.envelopes.push(envelope);
    persist();

    const receipt: Receipt = {
      id: envelope.id,
      status: 'SETTLED',
      amountCents: envelope.amountCents,
      currency: box.currency,
      paymentRef: envelope.paymentRef,
      boxTitle: box.title,
      createdAt: envelope.createdAt,
    };
    return HttpResponse.json(receipt, { status: 201 });
  }),

  http.post(url('/wallet/withdrawals'), async ({ request }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');

    const body = (await request.json()) as { amountCents?: unknown };
    const amountCents = body.amountCents;
    if (!Number.isInteger(amountCents) || (amountCents as number) <= 0) {
      return fail('VALIDATION_ERROR', 'El monto del retiro no es válido.');
    }

    const balanceCents = balanceOf(db, user.id);
    if ((amountCents as number) > balanceCents) {
      // The real balance travels in details so the UI can state it exactly.
      return fail('INSUFFICIENT_FUNDS', 'Saldo insuficiente.', { balanceCents });
    }

    await delay(650);
    const transactionId = uid('txn');
    db.transactions.push({
      id: transactionId,
      ownerId: user.id,
      amountCents: -(amountCents as number),
      type: 'WITHDRAWAL',
      eventTitle: 'Retiro simulado',
      createdAt: new Date().toISOString(),
    });
    persist();

    return HttpResponse.json(
      {
        transactionId,
        amountCents: amountCents as number,
        balanceCents: balanceOf(db, user.id),
      },
      { status: 201 },
    );
  }),

  http.get(url('/wallet'), async ({ request }) => {
    const db = getDb();
    const user = currentUser(request, db);
    if (!user) return fail('UNAUTHORIZED', 'Falta el token.');
    await delay(340);
    return HttpResponse.json({
      balanceCents: balanceOf(db, user.id),
      currency: DEFAULT_CURRENCY,
      transactions: db.transactions
        .filter((t) => t.ownerId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ ownerId: _ownerId, ...t }) => t),
    });
  }),
];
