import { describe, expect, it } from 'vitest';
import { isEffectivelyRevealed } from '../src/domain/policies/reveal.policy';

const NOW = new Date('2026-09-26T12:00:00.000Z');

describe('isEffectivelyRevealed', () => {
  it('manual reveal wins even with no schedule', () => {
    expect(isEffectivelyRevealed({ isRevealed: true, revealAt: null }, NOW)).toBe(true);
  });

  it('manual reveal wins even when the schedule is still in the future', () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(isEffectivelyRevealed({ isRevealed: true, revealAt: future }, NOW)).toBe(true);
  });

  it('a revealAt in the past opens the chest', () => {
    const past = new Date(NOW.getTime() - 1);
    expect(isEffectivelyRevealed({ isRevealed: false, revealAt: past }, NOW)).toBe(true);
  });

  it('a revealAt in the future keeps it sealed', () => {
    const future = new Date(NOW.getTime() + 1);
    expect(isEffectivelyRevealed({ isRevealed: false, revealAt: future }, NOW)).toBe(false);
  });

  it('revealAt null with no manual reveal keeps it sealed', () => {
    expect(isEffectivelyRevealed({ isRevealed: false, revealAt: null }, NOW)).toBe(false);
  });

  it('exact boundary: revealAt === now counts as revealed (policy is <=)', () => {
    expect(isEffectivelyRevealed({ isRevealed: false, revealAt: new Date(NOW) }, NOW)).toBe(true);
  });

  it('defaults `now` to the current instant', () => {
    const past = new Date(Date.now() - 10_000);
    const future = new Date(Date.now() + 10_000);
    expect(isEffectivelyRevealed({ isRevealed: false, revealAt: past })).toBe(true);
    expect(isEffectivelyRevealed({ isRevealed: false, revealAt: future })).toBe(false);
  });
});
