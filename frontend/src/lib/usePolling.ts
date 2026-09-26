import { useEffect, useRef } from 'react';

/**
 * Runs `tick` on an interval while `enabled`, and only while the tab is
 * actually being looked at.
 *
 * The visibility rule is not an optimisation detail: a dashboard left open in a
 * background tab would otherwise keep hitting the API all afternoon for a
 * screen nobody is reading. Coming back to the tab fires an immediate tick, so
 * returning to the page shows the current state at once instead of after the
 * next interval.
 *
 * `tick` is held in a ref, so a caller may pass an inline function without
 * restarting the timer on every render.
 */
export function usePolling(
  tick: () => void | Promise<void>,
  { enabled, intervalMs }: { enabled: boolean; intervalMs: number },
) {
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => void latest.current(), intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void latest.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}
