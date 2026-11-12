export interface Denom {
  v: number;
  c: string; // main color
  e: string; // edge stripe color
  t: string; // text color
}

export const DENOMS: Denom[] = [
  { v: 10000, c: '#0f766e', e: '#ccfbf1', t: '#fff' },
  { v: 5000, c: '#ea580c', e: '#fff7ed', t: '#fff' },
  { v: 1000, c: '#eab308', e: '#1c1917', t: '#1c1917' },
  { v: 500, c: '#7c3aed', e: '#f5f3ff', t: '#fff' },
  { v: 100, c: '#18181b', e: '#e4e4e7', t: '#fff' },
  { v: 25, c: '#16a34a', e: '#f0fdf4', t: '#fff' },
  { v: 5, c: '#dc2626', e: '#fef2f2', t: '#fff' },
  { v: 1, c: '#f4f4f5', e: '#2563eb', t: '#1e3a8a' },
];

export const denomFor = (v: number) => DENOMS.find((d) => d.v <= v) ?? DENOMS[DENOMS.length - 1];

/** Greedy breakdown of an amount into chip columns (highest first). */
export function breakdown(amount: number, maxCols = 4, maxPerCol = 10) {
  const cols: { d: Denom; n: number }[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of DENOMS) {
    if (rest < d.v) continue;
    const n = Math.floor(rest / d.v);
    rest -= n * d.v;
    cols.push({ d, n });
  }
  return cols.slice(0, maxCols).map((c) => ({ ...c, shown: Math.min(c.n, maxPerCol) }));
}

export const fmtChips = (n: number) => {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M`;
  if (n >= 1e4) return `${+(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return n.toLocaleString('en-US');
};

export const shortDenom = (v: number) => (v >= 1000 ? `${v / 1000}K` : String(v));
