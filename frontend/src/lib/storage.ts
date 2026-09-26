/**
 * localStorage throws outright in private mode on some browsers, so every
 * access is wrapped. Losing persistence is acceptable; crashing is not.
 */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable. The in-memory value keeps this session working.
  }
}

export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if we could never write.
  }
}
