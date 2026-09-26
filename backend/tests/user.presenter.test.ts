import { describe, expect, it } from 'vitest';
import type { UserRecord, WalletRecord } from '../src/domain/models';
import { presentUser, presentWallet, presentWalletSummary } from '../src/interfaces/http/presenters/user.presenter';

const USER: UserRecord = {
  id: 'usr-aaaa',
  email: 'ana@sobres.test',
  displayName: 'Ana',
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
};

const WALLET: WalletRecord = { id: 'wal-aaaa', userId: 'usr-aaaa', balanceCents: 245000, currency: 'COP' };

describe('presentUser', () => {
  it('devuelve exactamente id, email y displayName', () => {
    expect(Object.keys(presentUser(USER)).sort()).toEqual(['displayName', 'email', 'id']);
  });

  it('no puede filtrar passwordHash: no existe en el registro de dominio', () => {
    const serialized = JSON.stringify(presentUser({ ...USER, ...({ passwordHash: '$argon2id$secreto' } as object) }));
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('argon2');
  });
});

describe('presentWallet', () => {
  it('el resumen de /me sólo lleva saldo y moneda', () => {
    expect(presentWalletSummary(WALLET)).toEqual({ balanceCents: 245000, currency: 'COP' });
  });

  it('el ledger no expone walletId ni idempotencyKey', () => {
    const view = presentWallet(WALLET, [
      {
        id: 'wtx-aaaa',
        walletId: 'wal-aaaa',
        eventId: 'evt-aaaa',
        amountCents: 245000,
        type: 'REVEAL_PAYOUT',
        idempotencyKey: 'reveal:evt-aaaa',
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
        eventTitle: 'Boda de Ana',
      },
    ]);

    expect(view.balanceCents).toBe(245000);
    expect(Object.keys(view.transactions[0]).sort()).toEqual([
      'amountCents',
      'createdAt',
      'eventTitle',
      'id',
      'type',
    ]);
    expect(JSON.stringify(view)).not.toContain('idempotencyKey');
  });
});
