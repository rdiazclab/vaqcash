import { motion, useReducedMotion } from 'motion/react';
import { LogoMark, type LogoTone } from './Logo';

/**
 * The mark at poster scale, cropped by the edge of its container, so the cow
 * reads as peeking into the page rather than as a logo dropped on it.
 *
 * It carries the same rule as everything else here: `ink` is the resting tone
 * and the only one allowed on a sealed surface, because LogoMark's ink tone is
 * pure currentColor and never touches --accent. `brand` exists for the single
 * revealed moment, where carmine is the point.
 *
 * Purely decorative: aria-hidden, never a pointer target, and quiet enough that
 * text keeps its contrast at full strength over it. It paints at -z-10, so the
 * container must carry `isolate` or the cow falls behind its own background.
 */
export function CowWatermark({
  tone = 'ink',
  size = 340,
  /** Rises into place once, for the reveal. Ignored when motion is reduced. */
  enter = false,
  className = '',
  markClassName = '',
}: {
  tone?: LogoTone;
  size?: number;
  enter?: boolean;
  className?: string;
  /** Responsive sizing escape, e.g. "size-[120px] sm:size-[170px]". CSS wins
   *  over the width/height attributes, so `size` stays the fallback. */
  markClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  // Carmine is far more saturated than ink, so it needs less of itself to sit
  // at the same visual weight.
  const opacity = tone === 'brand' ? 0.09 : 0.06;
  const animated = enter && !reduceMotion;

  return (
    <motion.div
      aria-hidden="true"
      initial={animated ? { opacity: 0, y: 28 } : false}
      animate={animated ? { opacity, y: 0 } : undefined}
      // Lands after the total has started counting: the number is the moment,
      // the cow is the company it keeps.
      transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={animated ? undefined : { opacity }}
      className={`pointer-events-none absolute -z-10 select-none ${className}`}
    >
      {/* LogoMark paints its structure in currentColor and reserves --accent
          for the patches, so a brand watermark has to carry the accent as its
          text colour or it comes out grey with pink freckles. At this opacity
          the patches merge into the silhouette, which is what a watermark
          wants: one solid shape, with the eyes punched through in paper. */}
      <LogoMark
        size={size}
        tone={tone}
        className={`${tone === 'brand' ? 'text-accent' : 'text-ink'} ${markClassName}`}
      />
    </motion.div>
  );
}
