export interface RevealState {
  isRevealed: boolean;
  revealAt: Date | null;
}

/**
 * Single source of truth for "can amounts be seen?".
 * Manual reveal wins; a scheduled revealAt in the past also opens the chest.
 */
export function isEffectivelyRevealed(event: RevealState, now: Date = new Date()): boolean {
  if (event.isRevealed) return true;
  return event.revealAt !== null && event.revealAt.getTime() <= now.getTime();
}
