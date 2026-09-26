import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: unknown };

/**
 * Minimal load/error/retry for a single GET. Enough for this app, and it keeps
 * the three designed states (loading, empty, error) explicit at every call site.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ status: 'loading', data: null, error: null });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await loader();
      if (alive.current) setState({ status: 'ready', data, error: null });
    } catch (error) {
      if (alive.current) setState({ status: 'error', data: null, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  /**
   * Refetches while leaving the current data on screen. A background refresh
   * must not unmount the subtree: doing so throws away whatever state the user
   * was in, such as a confirmation they have not read yet.
   */
  const refresh = useCallback(async () => {
    try {
      const data = await loader();
      if (alive.current) setState({ status: 'ready', data, error: null });
    } catch {
      // The stale data on screen is better than an error over a done action.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /** Replaces the data without flashing a skeleton, for in-place updates. */
  const replace = useCallback((data: T) => {
    if (alive.current) setState({ status: 'ready', data, error: null });
  }, []);

  return { ...state, reload: run, refresh, replace };
}
