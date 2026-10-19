// Tiny wrapper around localStorage. Wrapped in try/catch because private
// browsing and some embedded views block storage entirely: the game must still
// work, it just forgets.

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: the game still works, it just forgets.
  }
}

/** Parse a JSON value, falling back to `fallback` if it's missing or broken. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = read(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  write(key, JSON.stringify(value));
}
