import { memo } from 'react';
import { breakdown, fmtChips, shortDenom, type Denom } from '../lib/chips';

/** Flat chip face (used for buttons). */
export function ChipFace({ d, size = 44, label = true }: { d: Denom; size?: number; label?: boolean }) {
  return (
    <span
      className="chip-face"
      style={{ '--c': d.c, '--e': d.e, '--t': d.t, width: size, height: size, fontSize: size * 0.28 } as React.CSSProperties}
    >
      {label && <span>{shortDenom(d.v)}</span>}
    </span>
  );
}

/** Isometric 3D stacks of chips representing an amount. */
export const ChipStack = memo(function ChipStack({
  amount,
  size = 26,
  maxCols = 3,
  maxPerCol = 8,
  showLabel = true,
  className = '',
}: {
  amount: number;
  size?: number;
  maxCols?: number;
  maxPerCol?: number;
  showLabel?: boolean;
  className?: string;
}) {
  if (amount <= 0) return null;
  const cols = breakdown(amount, maxCols, maxPerCol);
  const thick = Math.max(2, size * 0.13);
  return (
    <div className={`chipstack ${className}`} style={{ '--s': `${size}px`, '--th': `${thick}px` } as React.CSSProperties}>
      <div className="cols">
        {cols.map(({ d, shown }, ci) => (
          <div className="col" key={d.v} style={{ height: size * 0.5 + shown * thick, zIndex: 10 - ci }}>
            {Array.from({ length: shown }, (_, i) => (
              <span
                key={i}
                className="disc"
                style={{ '--c': d.c, '--e': d.e, bottom: i * thick, animationDelay: `${i * 18}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        ))}
      </div>
      {showLabel && <span className="amt">{fmtChips(amount)}</span>}
    </div>
  );
});
