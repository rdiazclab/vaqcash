import { ArrowDownLeft, ArrowUpRight, Receipt as ReceiptIcon } from '@phosphor-icons/react';
import { api } from '../api/client';
import { humanMessage } from '../api/errors';
import { formatDate, formatMoney } from '../lib/money';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { AppShell } from '../components/AppShell';
import { WithdrawPanel } from '../components/WithdrawPanel';

/**
 * The wallet only ever holds money that came out of an opened cajita, so the
 * accent is at home here: this screen is the far side of the reveal.
 */
export function Wallet() {
  const { status, data, error, reload, refresh } = useAsync(() => api.wallet(), []);

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tighter text-ink md:text-4xl">Wallet</h1>
      <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-muted">
        Aquí cae el dinero de cada cajita en el momento en que la abres.
      </p>

      <div className="mt-8">
        {status === 'loading' ? <WalletSkeleton /> : null}

        {status === 'error' ? (
          <ErrorState
            title="No pudimos cargar tu wallet"
            body={humanMessage(error)}
            onRetry={reload}
          />
        ) : null}

        {status === 'ready' ? (
          <>
            <section className="rounded-[12px] border border-rule bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
              <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                Saldo disponible
              </h2>
              <p
                data-testid="wallet-balance"
                className="num mt-2.5 text-4xl font-semibold leading-none tracking-tighter text-accent md:text-5xl"
              >
                {formatMoney(data.balanceCents, data.currency)}
              </p>

              <WithdrawPanel
                balanceCents={data.balanceCents}
                currency={data.currency}
                onWithdrawn={refresh}
              />
            </section>

            <section className="mt-10">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                Movimientos
              </h2>

              <div className="mt-4">
                {data.transactions.length === 0 ? (
                  <EmptyState
                    icon={ReceiptIcon}
                    title="Sin movimientos todavía"
                    body="Cuando abras tu primera cajita, el total entra aquí como un solo movimiento."
                  />
                ) : (
                  <ul className="divide-y divide-rule overflow-hidden rounded-[12px] border border-rule bg-surface">
                    {data.transactions.map((transaction) => {
                      const incoming = transaction.amountCents >= 0;
                      return (
                        <li
                          key={transaction.id}
                          className="flex min-h-[68px] items-center gap-3.5 px-4 py-3.5 sm:px-5"
                        >
                          {incoming ? (
                            <ArrowDownLeft
                              size={19}
                              className="shrink-0 text-accent"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowUpRight
                              size={19}
                              className="shrink-0 text-ink-muted"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium text-ink">
                              {transaction.eventTitle}
                            </p>
                            <p className="num mt-0.5 text-[12px] text-ink-muted">
                              {formatDate(transaction.createdAt)}
                            </p>
                          </div>
                          <p
                            className={`num shrink-0 text-[15px] font-semibold tabular-nums ${
                              incoming ? 'text-accent' : 'text-ink'
                            }`}
                          >
                            {incoming ? '+' : '-'}
                            {formatMoney(Math.abs(transaction.amountCents), data.currency)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function WalletSkeleton() {
  return (
    <div aria-busy="true">
      <section className="rounded-[12px] border border-rule bg-surface p-5 sm:p-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-11 w-60 md:h-12" />
        <Skeleton className="mt-4 h-3 w-10" />
      </section>
      <Skeleton className="mt-10 h-3 w-28" />
      <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-[12px] border border-rule bg-surface">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="flex min-h-[68px] items-center gap-3.5 px-4 py-3.5 sm:px-5">
            <div className="skeleton size-5 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-4 w-44" />
              <div className="skeleton mt-2 h-2.5 w-16" />
            </div>
            <div className="skeleton h-4 w-24" />
          </li>
        ))}
      </ul>
    </div>
  );
}
