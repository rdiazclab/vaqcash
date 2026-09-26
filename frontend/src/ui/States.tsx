import type { Icon } from '@phosphor-icons/react';
import { ArrowClockwise } from '@phosphor-icons/react';
import { Button } from './Button';

/** Skeletons carry the shape of the content that replaces them. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({
  icon: IconGlyph,
  title,
  body,
  action,
}: {
  icon: Icon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[12px] border border-dashed border-rule bg-surface px-6 py-14 text-center">
      <IconGlyph size={32} weight="duotone" className="text-ink-muted" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-medium tracking-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-relaxed text-ink-muted">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel = 'Reintentar',
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-rule bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <h2 className="text-lg font-medium tracking-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">{body}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <ArrowClockwise size={17} aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Inline form-level error. Never a toast: the fix is right here. */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-[12px] border-l-2 border-ink bg-sunken px-3.5 py-3 text-[14px] leading-snug text-ink"
    >
      {children}
    </p>
  );
}
