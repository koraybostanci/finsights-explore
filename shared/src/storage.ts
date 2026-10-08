/**
 * Small persistent settings in localStorage, as JSON under a per-app key prefix.
 * Every call is wrapped in try/catch: in a private window or with full storage
 * reads fall back and writes are dropped, so the app keeps working for the session.
 */

export interface AppStorage {
  /** The stored value, or `fallback` when the key is missing or unreadable. */
  lsGet<T>(key: string, fallback: T): T;
  lsSet(key: string, value: unknown): void;
  lsRemove(key: string): void;
}

export function createStorage(prefix: string): AppStorage {
  return {
    lsGet<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    lsSet(key: string, value: unknown): void {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* private window or full storage: the setting lasts only for this session */
      }
    },
    lsRemove(key: string): void {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
    },
  };
}
