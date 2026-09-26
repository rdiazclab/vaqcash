import { clearToken, getToken } from '../lib/session';
import { ApiError, type ApiErrorCode } from './errors';
import type {
  AuthPayload,
  ContributionInput,
  CreateEventResponse,
  DashboardView,
  EventListItem,
  MeResponse,
  PublicBoxView,
  QrResponse,
  Receipt,
  WalletView,
  Withdrawal,
} from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

interface Options {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Guest routes are public: sending a stale Bearer would only invite a 401. */
  auth?: boolean;
}

async function request<T>(path: string, { method = 'GET', body, auth = true }: Options = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'No pudimos conectar con el servidor.');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const code = (payload?.error?.code ?? 'UNKNOWN') as ApiErrorCode;
    // A dead token is worse than no token: drop it so the UI can offer a login.
    if (code === 'UNAUTHORIZED') clearToken();
    throw new ApiError(code, payload?.error?.message ?? 'Error', response.status, payload?.error?.details);
  }

  return payload as T;
}

export const api = {
  register: (input: { email: string; password: string; displayName: string }) =>
    request<AuthPayload>('/auth/register', { method: 'POST', body: input, auth: false }),

  login: (input: { email: string; password: string }) =>
    request<AuthPayload>('/auth/login', { method: 'POST', body: input, auth: false }),

  me: () => request<MeResponse>('/me'),

  listEvents: () => request<EventListItem[]>('/events'),

  createEvent: (input: {
    title: string;
    description?: string | null;
    currency?: string;
    revealAt?: string | null;
  }) => request<CreateEventResponse>('/events', { method: 'POST', body: input }),

  getDashboard: (id: string) => request<DashboardView>(`/events/${id}/dashboard`),

  reveal: (id: string) => request<DashboardView>(`/events/${id}/reveal`, { method: 'POST' }),

  getQr: (id: string) => request<QrResponse>(`/events/${id}/qr`),

  getPublicBox: (uuid: string) => request<PublicBoxView>(`/caja/${uuid}`, { auth: false }),

  contribute: (uuid: string, input: ContributionInput) =>
    request<Receipt>(`/caja/${uuid}/contributions`, { method: 'POST', body: input, auth: false }),

  wallet: () => request<WalletView>('/wallet'),

  withdraw: (amountCents: number) =>
    request<Withdrawal>('/wallet/withdrawals', { method: 'POST', body: { amountCents } }),
};
