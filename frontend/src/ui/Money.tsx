import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { formatMoney } from '../lib/money';

/** Static amount. Mono and tabular so columns of money line up. */
export function Money({
  cents,
  currency,
  className = '',
}: {
  cents: number;
  currency: string;
  className?: string;
}) {
  return <span className={`num ${className}`}>{formatMoney(cents, currency)}</span>;
}

/**
 * The total climbs from zero over 900 ms at the moment of the reveal.
 * Justification: it holds attention on the figure, which is the climax.
 * Under prefers-reduced-motion it renders the final value immediately, and the
 * reveal still lands because the colour and the type carry it.
 */
export function CountUpMoney({
  cents,
  currency,
  className = '',
  durationMs = 900,
}: {
  cents: number;
  currency: string;
  className?: string;
  durationMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(() => (reduceMotion ? cents : 0));

  useEffect(() => {
    if (reduceMotion) {
      setValue(cents);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(cents * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents, durationMs, reduceMotion]);

  return <span className={`num ${className}`}>{formatMoney(value, currency)}</span>;
}
