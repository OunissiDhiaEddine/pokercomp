export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export interface Creds {
  pid: string;
  token: string;
  at: number;
}

const CREDS = 'chipstack:creds';

export function getCreds(code: string): Creds | null {
  return load<Record<string, Creds>>(CREDS, {})[code] ?? null;
}

export function setCreds(code: string, creds: Omit<Creds, 'at'> | null) {
  const all = load<Record<string, Creds>>(CREDS, {});
  if (creds) all[code] = { ...creds, at: Date.now() };
  else delete all[code];
  // keep the 8 most recent
  const entries = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  save(CREDS, Object.fromEntries(entries));
}

export function recentCodes(): string[] {
  const all = load<Record<string, Creds>>(CREDS, {});
  return Object.entries(all)
    .filter(([, c]) => Date.now() - c.at < 24 * 3600 * 1000)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([code]) => code);
}
