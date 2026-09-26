import { Link } from 'react-router-dom';
import { CaretRight, CheckCircle, Lock, Plus, Stack } from '@phosphor-icons/react';
import { api } from '../api/client';
import { humanMessage } from '../api/errors';
import { useAsync } from '../lib/useAsync';
import { formatDate } from '../lib/money';
import { ButtonLink } from '../ui/Button';
import { EmptyState, ErrorState } from '../ui/States';
import { AppShell } from '../components/AppShell';
import { LogoMark } from '../components/Logo';

export function Cajitas() {
  const { status, data, error, reload } = useAsync(() => api.listEvents(), []);

  return (
    <AppShell>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter text-ink md:text-4xl">
            Mis cajitas
          </h1>
          <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-muted">
            Cada cajita junta los sobres de un grupo. Los montos aparecen cuando la abres.
          </p>
        </div>
        <ButtonLink to="/cajitas/nueva" variant="ink" className="shrink-0">
          <Plus size={17} aria-hidden="true" />
          Crear cajita
        </ButtonLink>
      </header>

      <div className="mt-8">
        {status === 'loading' ? <ListSkeleton /> : null}

        {status === 'error' ? (
          <ErrorState
            title="No pudimos cargar tus cajitas"
            body={humanMessage(error)}
            onRetry={reload}
          />
        ) : null}

        {status === 'ready' && data.length === 0 ? (
          <EmptyState
            icon={Stack}
            // First run: the one screen where the cow introduces herself rather
            // than a glyph naming what is absent.
            illustration={<LogoMark size={52} tone="ink" className="text-ink-muted" />}
            title="Todavía no tienes cajitas"
            body="Crea la primera, comparte el link en el grupo y los sobres empiezan a llegar sellados."
            action={
              <ButtonLink to="/cajitas/nueva" variant="ink">
                <Plus size={17} aria-hidden="true" />
                Crear mi primera cajita
              </ButtonLink>
            }
          />
        ) : null}

        {status === 'ready' && data.length > 0 ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-[12px] border border-rule bg-surface">
            {data.map((box) => (
              <li key={box.id}>
                <Link
                  to={`/cajitas/${box.id}`}
                  className="flex min-h-[76px] items-center gap-4 px-4 py-4 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:px-5"
                >
                  {box.isRevealed ? (
                    <CheckCircle
                      size={22}
                      weight="fill"
                      className="shrink-0 text-accent"
                      aria-hidden="true"
                    />
                  ) : (
                    <Lock size={22} className="shrink-0 text-ink-muted" aria-hidden="true" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium text-ink">{box.title}</p>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      <span className={box.isRevealed ? 'text-accent' : undefined}>
                        {box.isRevealed ? 'Abierta' : 'Sellada'}
                      </span>
                      <span className="px-1.5 text-rule" aria-hidden="true">
                        /
                      </span>
                      <span className="num">{box.envelopeCount}</span>{' '}
                      {box.envelopeCount === 1 ? 'sobre' : 'sobres'}
                      <span className="px-1.5 text-rule" aria-hidden="true">
                        /
                      </span>
                      <span className="num">{formatDate(box.createdAt)}</span>
                    </p>
                  </div>

                  <CaretRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}

/** Same rows, same heights, so nothing jumps when the data lands. */
function ListSkeleton() {
  return (
    <ul
      className="divide-y divide-rule overflow-hidden rounded-[12px] border border-rule bg-surface"
      aria-hidden="true"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <li key={index} className="flex min-h-[76px] items-center gap-4 px-4 py-4 sm:px-5">
          <div className="skeleton size-[22px] rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton mt-2 h-3 w-52" />
          </div>
        </li>
      ))}
    </ul>
  );
}
