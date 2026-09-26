import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';

/**
 * A read-only link with a copy button that reports what actually happened:
 * "Copiado" on success, "No se pudo copiar" when the clipboard is blocked,
 * and it selects the text so the user can copy it by hand either way.
 */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    inputRef.current?.select();
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2400);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          readOnly
          value={value}
          aria-label={label}
          data-testid="share-url"
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 w-full min-w-0 flex-1 truncate rounded-[12px] border border-rule bg-sunken px-3.5 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-paper transition-transform duration-150 active:scale-[0.98] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {state === 'copied' ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Copy size={17} aria-hidden="true" />
          )}
          {state === 'copied' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p aria-live="polite" className="min-h-[18px] text-[13px] leading-snug text-ink-muted">
        {state === 'copied' ? 'Link copiado al portapapeles.' : null}
        {state === 'failed'
          ? 'No pudimos usar el portapapeles. El link quedó seleccionado para copiarlo a mano.'
          : null}
      </p>
    </div>
  );
}
