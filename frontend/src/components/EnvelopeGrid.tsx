import { motion, useReducedMotion } from 'motion/react';
import { Envelope, EnvelopeOpen } from '@phosphor-icons/react';
import { formatDate } from '../lib/money';
import { Money } from '../ui/Money';
import { isOpenEnvelope, type Envelope as EnvelopeModel } from '../api/types';

/**
 * Stagger of 70 ms per envelope on reveal. Justification: it narrates opening
 * them one by one, which is the ritual this product digitises. Collapses to the
 * final state instantly under prefers-reduced-motion.
 */
const STAGGER_MS = 70;

export function EnvelopeGrid({
  envelopes,
  currency,
  animate,
}: {
  envelopes: EnvelopeModel[];
  currency: string;
  /** True only for the frame right after a reveal, so a reload does not replay it. */
  animate: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {envelopes.map((envelope, index) => {
        const open = isOpenEnvelope(envelope);
        const shouldAnimate = animate && open && !reduceMotion;

        return (
          <motion.li
            key={envelope.id}
            initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.97 } : false}
            animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{
              duration: 0.42,
              delay: (index * STAGGER_MS) / 1000,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`flex min-h-[124px] flex-col rounded-[12px] p-3.5 ${
              open ? 'envelope-open envelope--open' : 'envelope-sealed envelope--sealed'
            }`}
          >
            {open ? (
              <>
                <EnvelopeOpen
                  size={20}
                  weight="duotone"
                  className="text-accent"
                  aria-hidden="true"
                />
                <Money
                  cents={envelope.amountCents}
                  currency={currency}
                  className="mt-2 text-[17px] font-semibold text-accent"
                />
                <p className="mt-0.5 truncate text-[13px] font-medium text-ink">
                  {envelope.displayName}
                </p>
                {envelope.message ? (
                  <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-ink-muted">
                    {envelope.message}
                  </p>
                ) : null}
                <span className="num mt-auto pt-2 text-[11px] text-ink-muted">
                  {formatDate(envelope.createdAt)}
                </span>
              </>
            ) : (
              <>
                <Envelope size={20} weight="duotone" className="text-ink-muted" aria-hidden="true" />
                <p className="mt-2 text-[13px] font-medium text-ink">Sobre sellado</p>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                  Se abre con la cajita
                </p>
                <span className="num mt-auto pt-2 text-[11px] text-ink-muted">
                  {formatDate(envelope.createdAt)}
                </span>
              </>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

export function EnvelopeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="envelope-sealed flex min-h-[124px] flex-col rounded-[12px] p-3.5">
          <div className="skeleton size-5 rounded-full" />
          <div className="skeleton mt-3 h-3.5 w-24" />
          <div className="skeleton mt-2 h-3 w-20" />
          <div className="skeleton mt-auto h-2.5 w-10" />
        </li>
      ))}
    </ul>
  );
}
