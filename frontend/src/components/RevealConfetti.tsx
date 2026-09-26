import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * The paper that comes out when the envelopes open.
 *
 * Deliberately not rainbow confetti: the pieces are carmine and ink chips, the
 * two colours this product owns, so the burst reads as the reveal spending its
 * accent rather than as a generic celebration bolted on. No library either —
 * `motion` is already here, and thirty absolutely positioned chips cost less
 * than a canvas dependency for a moment that lasts two seconds.
 *
 * It fires once, unmounts itself when the last chip lands, never intercepts a
 * pointer, and renders nothing at all when the visitor asked for less motion.
 */
const COUNT = 30;
const LIFETIME_MS = 2600;

interface Chip {
  left: number;
  drift: number;
  delay: number;
  duration: number;
  spin: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

function buildChips(): Chip[] {
  return Array.from({ length: COUNT }, () => {
    // Carmine leads; ink keeps the burst from turning into a single red smear.
    const carmine = Math.random() > 0.35;
    return {
      left: Math.random() * 100,
      drift: (Math.random() - 0.5) * 140,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 0.7,
      spin: (Math.random() - 0.5) * 900,
      width: 6 + Math.random() * 6,
      height: 9 + Math.random() * 9,
      color: carmine ? 'var(--accent)' : 'var(--ink)',
      opacity: carmine ? 0.95 : 0.6,
    };
  });
}

export function RevealConfetti() {
  const reduceMotion = useReducedMotion();
  const [spent, setSpent] = useState(false);
  const chips = useMemo(buildChips, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setSpent(true), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  if (reduceMotion || spent) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {chips.map((chip, index) => (
        <motion.span
          key={index}
          initial={{ top: '-8%', x: 0, rotate: 0, opacity: chip.opacity }}
          animate={{ top: '108%', x: chip.drift, rotate: chip.spin, opacity: [chip.opacity, chip.opacity, 0] }}
          transition={{
            duration: chip.duration,
            delay: chip.delay,
            // Paper falls, it does not ease out of a spring.
            ease: [0.35, 0.1, 0.55, 1],
            opacity: { duration: chip.duration, delay: chip.delay, times: [0, 0.75, 1] },
          }}
          style={{
            left: `${chip.left}%`,
            width: chip.width,
            height: chip.height,
            backgroundColor: chip.color,
            borderRadius: 1,
          }}
          className="absolute block"
        />
      ))}
    </div>
  );
}
