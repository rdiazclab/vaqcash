import { useId } from 'react';

/**
 * The VaqCash mark: a little cow, because "hacer una vaca" is how a group in
 * Colombia says "let's all chip in".
 *
 * It is drawn inline rather than loaded from /logo-mark.svg on purpose. An
 * <img> hides its colours from getComputedStyle, which would let carmine onto
 * a sealed screen without assertNoAccentPainted ever noticing. Inline, the
 * guard sees every fill.
 *
 * Structural shapes use currentColor, so the mark inverts with the theme on
 * its own and the ink variant needs no separate artwork.
 */
export type LogoTone = 'ink' | 'brand';

export function LogoMark({
  size = 24,
  tone = 'ink',
  className = '',
}: {
  size?: number;
  tone?: LogoTone;
  className?: string;
}) {
  const clipId = useId();
  // Carmine belongs to the revealed state, so the ink tone borrows the head's
  // own colour at low opacity for the patches instead of dropping them.
  const patch = tone === 'brand' ? 'var(--accent)' : 'currentColor';
  const patchOpacity = tone === 'brand' ? 1 : 0.55;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="VaqCash"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M64 24 C86 24 104 38 104 60 C104 72 99 82 93 90 C86 99 76 108 64 108 C52 108 42 99 35 90 C29 82 24 72 24 60 C24 38 42 24 64 24 Z" />
        </clipPath>
      </defs>

      {/* horns */}
      <path d="M44 31 Q27 15 13 21 Q27 26 37 41 Z" fill="currentColor" />
      <path d="M84 31 Q101 15 115 21 Q101 26 91 41 Z" fill="currentColor" />

      {/* ears */}
      <ellipse cx="21" cy="56" rx="20" ry="11.5" fill="currentColor" transform="rotate(-32 21 56)" />
      <ellipse cx="107" cy="56" rx="20" ry="11.5" fill="currentColor" transform="rotate(32 107 56)" />

      {/* head */}
      <path
        d="M64 24 C86 24 104 38 104 60 C104 72 99 82 93 90 C86 99 76 108 64 108 C52 108 42 99 35 90 C29 82 24 72 24 60 C24 38 42 24 64 24 Z"
        fill="currentColor"
      />

      {/* patches, clipped to the head */}
      <g clipPath={`url(#${clipId})`} opacity={patchOpacity}>
        <path d="M30 33 C42 25 57 31 56 43 C55 54 41 59 32 52 C25 46 23 38 30 33 Z" fill={patch} />
        <path d="M100 47 C111 55 111 72 101 79 C92 85 83 79 85 67 C87 55 93 43 100 47 Z" fill={patch} />
        <ellipse cx="64" cy="90" rx="26" ry="17.5" fill={patch} />
      </g>

      {/* eyes and nostrils, in the page surface so they read in both themes */}
      <ellipse cx="48" cy="59" rx="6" ry="6.6" fill="var(--paper)" />
      <ellipse cx="80" cy="59" rx="6" ry="6.6" fill="var(--paper)" />
      <ellipse cx="55" cy="88" rx="3.4" ry="4.8" fill="var(--paper)" />
      <ellipse cx="73" cy="88" rx="3.4" ry="4.8" fill="var(--paper)" />
    </svg>
  );
}
