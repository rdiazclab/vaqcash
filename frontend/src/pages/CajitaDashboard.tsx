import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Envelope, Lock } from '@phosphor-icons/react';
import { api } from '../api/client';
import { ApiError, humanMessage } from '../api/errors';
import { isRevealed, type DashboardView, type RevealedDashboardView } from '../api/types';
import { formatDateTime } from '../lib/money';
import { useAsync } from '../lib/useAsync';
import { usePolling } from '../lib/usePolling';
import { ButtonLink } from '../ui/Button';
import { EmptyState, ErrorState, FormError, Skeleton } from '../ui/States';
import { AppShell } from '../components/AppShell';
import { ShareCard } from '../components/ShareCard';
import { EnvelopeGrid, EnvelopeGridSkeleton } from '../components/EnvelopeGrid';
import { RevealButton } from '../components/RevealButton';
import { RevealConfetti } from '../components/RevealConfetti';
import {
  RevealedTotalPanel,
  SealedTotalPanel,
  TotalPanelSkeleton,
} from '../components/TotalPanel';

export function CajitaDashboard() {
  const { id = '' } = useParams();
  const { status, data, error, reload, refresh, replace } = useAsync(
    () => api.getDashboard(id),
    [id],
  );

  /** Distinguishes "just opened by this click" from "was already open on load". */
  const [justRevealed, setJustRevealed] = useState(false);
  const [revealPending, setRevealPending] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  /*
   * Envelopes arrive while the organizer watches this screen, so it polls
   * instead of waiting for a reload. Only while the box is sealed: once it is
   * open nothing can change, and refetching forever would be pure noise. It
   * also pauses during the reveal itself, so a poll landing mid-request cannot
   * overwrite the revealed view with a stale sealed one.
   */
  const sealed = data ? !isRevealed(data) : false;
  usePolling(refresh, { enabled: sealed && !revealPending, intervalMs: 6000 });

  const reveal = useCallback(async () => {
    setRevealPending(true);
    setRevealError(null);
    try {
      const view = await api.reveal(id);
      setJustRevealed(true);
      replace(view);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ALREADY_REVEALED') {
        // Somebody else already opened it. Show the truth instead of the error.
        await reload();
      } else {
        setRevealError(humanMessage(caught));
      }
    } finally {
      setRevealPending(false);
    }
  }, [id, reload, replace]);

  return (
    <AppShell>
      <Link
        to="/cajitas"
        className="inline-flex min-h-11 items-center gap-2 text-[14px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Mis cajitas
      </Link>

      {status === 'loading' ? <DashboardSkeleton /> : null}

      {status === 'error' ? (
        <div className="mt-6">
          <ErrorState
            title={
              error instanceof ApiError && error.code === 'NOT_FOUND'
                ? 'Esta cajita no existe'
                : 'No pudimos cargar la cajita'
            }
            body={humanMessage(error)}
            onRetry={error instanceof ApiError && error.code === 'NOT_FOUND' ? undefined : reload}
          />
          {error instanceof ApiError && error.code === 'NOT_FOUND' ? (
            <ButtonLink to="/cajitas" variant="outline" className="mt-4">
              Volver a mis cajitas
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      {status === 'ready' ? (
        <Loaded
          view={data}
          justRevealed={justRevealed}
          revealPending={revealPending}
          revealError={revealError}
          onReveal={reveal}
        />
      ) : null}
    </AppShell>
  );
}

function Loaded({
  view,
  justRevealed,
  revealPending,
  revealError,
  onReveal,
}: {
  view: DashboardView;
  justRevealed: boolean;
  revealPending: boolean;
  revealError: string | null;
  onReveal: () => void;
}) {
  const revealed = isRevealed(view);

  return (
    <div className="mt-6">
      {/* Only on the press, never on a later visit to an already open box. */}
      {justRevealed ? <RevealConfetti /> : null}

      <header>
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          {revealed ? (
            <Envelope size={15} weight="duotone" aria-hidden="true" />
          ) : (
            <Lock size={15} aria-hidden="true" />
          )}
          {revealed && view.revealedAt
            ? `Abierta el ${formatDateTime(view.revealedAt)}`
            : 'Sellada. Nadie ve los montos, tú incluido.'}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-ink md:text-4xl">
          {view.title}
        </h1>
        {view.description ? (
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
            {view.description}
          </p>
        ) : null}
      </header>

      {/* The reveal is announced, not only animated. */}
      <p aria-live="polite" className="sr-only">
        {revealed
          ? `Cajita abierta. ${view.envelopeCount} sobres revelados.`
          : `Cajita sellada con ${view.envelopeCount} sobres.`}
      </p>

      <div className="mt-7">
        {revealed ? (
          <RevealedTotalPanel
            totalCents={view.totalCents}
            settledTotalCents={(view as RevealedDashboardView).settledTotalCents}
            pendingRefundCount={(view as RevealedDashboardView).pendingRefundCount}
            currency={view.currency}
            envelopeCount={view.envelopeCount}
            walletBalanceCents={(view as RevealedDashboardView).walletBalanceCents}
            walletCredit={view.walletCredit}
            justRevealed={justRevealed}
          />
        ) : (
          <SealedTotalPanel envelopeCount={view.envelopeCount} />
        )}
      </div>

      {!revealed ? (
        <div className="mt-5 flex flex-col gap-4">
          {revealError ? <FormError>{revealError}</FormError> : null}
          <RevealButton
            envelopeCount={view.envelopeCount}
            pending={revealPending}
            onConfirm={onReveal}
          />
        </div>
      ) : null}

      {!revealed ? (
        <div className="mt-8">
          <ShareCard eventId={view.id} shareUrl={view.shareUrl} />
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          {revealed ? 'Sobres abiertos' : 'Sobres recibidos'}
        </h2>

        <div className="mt-4">
          {view.envelopes.length === 0 ? (
            <EmptyState
              icon={Envelope}
              title="Todavía no llega ningún sobre"
              body="Comparte el link de arriba en el grupo. Cada aporte aparecerá aquí como un sobre cerrado."
            />
          ) : (
            <EnvelopeGrid
              envelopes={view.envelopes}
              currency={view.currency}
              animate={justRevealed}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-6" aria-busy="true">
      <Skeleton className="h-3.5 w-48" />
      <Skeleton className="mt-3 h-9 w-64 md:h-10" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-7">
        <TotalPanelSkeleton />
      </div>
      <Skeleton className="mt-5 h-11 w-44 rounded-full" />
      <Skeleton className="mt-10 h-3 w-36" />
      <div className="mt-4">
        <EnvelopeGridSkeleton />
      </div>
    </div>
  );
}
