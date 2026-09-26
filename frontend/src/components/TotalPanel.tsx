import { CheckCircle, Lock } from '@phosphor-icons/react';
import { CountUpMoney, Money } from '../ui/Money';
import type { WalletCredit } from '../api/types';

/**
 * The hinge of the whole design. Sealed: ink only, the total is three marks.
 * Revealed: carmine arrives for the first time, on the figure itself.
 */
export function SealedTotalPanel({ envelopeCount }: { envelopeCount: number }) {
  return (
    <section className="rounded-[12px] border border-rule bg-surface p-5 sm:p-7">
      <div className="flex items-center gap-2 text-ink-muted">
        <Lock size={16} aria-hidden="true" />
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em]">Total sellado</h2>
      </div>

      <p
        data-testid="total-value"
        className="num mt-3 text-4xl font-semibold leading-none tracking-tighter text-ink md:text-5xl lg:text-6xl"
      >
        ? ? ?
      </p>

      <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">
        Ni tú ni nosotros mostramos los montos todavía. Se revelan cuando abras la cajita, y
        entonces pasan a tu wallet.
      </p>

      <dl className="mt-5 flex items-center gap-8 border-t border-rule pt-5">
        <div>
          <dt className="text-[12px] uppercase tracking-[0.12em] text-ink-muted">Sobres</dt>
          <dd
            data-testid="envelope-count"
            className="num mt-1 text-2xl font-semibold tracking-tight text-ink"
          >
            {envelopeCount}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] uppercase tracking-[0.12em] text-ink-muted">Estado</dt>
          <dd className="mt-1 text-[15px] font-medium text-ink">Sellada</dd>
        </div>
      </dl>
    </section>
  );
}

export function RevealedTotalPanel({
  totalCents,
  settledTotalCents,
  pendingRefundCount,
  currency,
  envelopeCount,
  walletBalanceCents,
  walletCredit,
  justRevealed,
}: {
  totalCents: number;
  settledTotalCents: number;
  pendingRefundCount: number;
  currency: string;
  envelopeCount: number;
  walletBalanceCents: number;
  walletCredit?: WalletCredit;
  justRevealed: boolean;
}) {
  const hasPending = pendingRefundCount > 0 || settledTotalCents !== totalCents;
  return (
    <section className="rounded-[12px] border border-rule bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div className="flex items-center gap-2 text-accent">
        <CheckCircle size={16} weight="fill" aria-hidden="true" />
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em]">Total revelado</h2>
      </div>

      <p
        data-testid="total-value"
        className="num mt-3 text-4xl font-semibold leading-none tracking-tighter text-accent md:text-5xl lg:text-6xl"
      >
        {justRevealed ? (
          <CountUpMoney cents={totalCents} currency={currency} />
        ) : (
          <Money cents={totalCents} currency={currency} />
        )}
      </p>

      <dl className="mt-5 grid gap-5 border-t border-rule pt-5 sm:grid-cols-3">
        <div>
          <dt className="text-[12px] uppercase tracking-[0.12em] text-ink-muted">Sobres abiertos</dt>
          <dd className="num mt-1 text-2xl font-semibold tracking-tight text-ink">
            {envelopeCount}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] uppercase tracking-[0.12em] text-ink-muted">Saldo en wallet</dt>
          <dd className="mt-1">
            <Money
              cents={walletBalanceCents}
              currency={currency}
              className="text-2xl font-semibold tracking-tight text-ink"
            />
          </dd>
        </div>
        {walletCredit ? (
          <div>
            <dt className="text-[12px] uppercase tracking-[0.12em] text-ink-muted">
              Movimiento
            </dt>
            <dd className="num mt-1 truncate text-[13px] text-ink-muted" title={walletCredit.transactionId}>
              {walletCredit.transactionId}
            </dd>
          </div>
        ) : null}
      </dl>

      {hasPending ? (
        <p className="mt-5 border-l-2 border-ink bg-sunken px-4 py-3.5 text-[14px] leading-snug text-ink">
          Liquidado hasta ahora:{' '}
          <Money cents={settledTotalCents} currency={currency} className="font-semibold" />.{' '}
          {pendingRefundCount > 0
            ? `Quedan ${pendingRefundCount} ${pendingRefundCount === 1 ? 'aporte' : 'aportes'} en devolución.`
            : 'El resto sigue en proceso.'}
        </p>
      ) : null}

      {walletCredit ? (
        <p
          data-testid="wallet-seal"
          className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] bg-sunken px-4 py-3.5 text-[14px] leading-snug text-ink"
        >
          <CheckCircle size={17} weight="fill" className="text-accent" aria-hidden="true" />
          <span>
            <Money
              cents={walletCredit.amountCents}
              currency={currency}
              className="font-semibold text-accent"
            />{' '}
            pasaron a tu wallet.
          </span>
        </p>
      ) : null}
    </section>
  );
}

export function TotalPanelSkeleton() {
  return (
    <section className="rounded-[12px] border border-rule bg-surface p-5 sm:p-7" aria-hidden="true">
      <div className="skeleton h-3.5 w-28" />
      <div className="skeleton mt-4 h-12 w-56 md:h-14 md:w-72" />
      <div className="skeleton mt-5 h-3.5 w-full max-w-sm" />
      <div className="mt-6 flex gap-8 border-t border-rule pt-5">
        <div>
          <div className="skeleton h-2.5 w-14" />
          <div className="skeleton mt-2 h-7 w-10" />
        </div>
        <div>
          <div className="skeleton h-2.5 w-14" />
          <div className="skeleton mt-2 h-7 w-20" />
        </div>
      </div>
    </section>
  );
}
