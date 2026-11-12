import { useEffect, useMemo, useState } from 'react';
import { canRaise, minRaiseTo, totalPot } from '../../shared/engine';
import type { Intent, Player, PublicRoom } from '../../shared/types';
import { useApp } from '../ctx';
import { DENOMS, fmtChips } from '../lib/chips';
import { haptic } from '../lib/fx';
import { ChipFace, ChipStack } from './Chip';
import { Sheet } from './Sheet';

type Act = (i: Intent) => Promise<unknown>;

export function useBetMath(room: PublicRoom, p: Player) {
  return useMemo(() => {
    const owe = Math.max(0, room.currentBet - p.bet);
    const max = p.stack + p.bet;
    const min = minRaiseTo(room, p);
    const pot = totalPot(room);
    const raiseOk = canRaise(room, p);
    const potRaise = (f: number) => {
      // Pot-sized raise: call first, then raise by a fraction of the resulting pot
      const v = room.currentBet + Math.round((pot + owe) * f);
      return Math.min(max, Math.max(min, v));
    };
    return { owe, max, min, pot, raiseOk, potRaise, callAmt: Math.min(owe, p.stack) };
  }, [room, p]);
}

export function ActionButtons({ room, p, act, onDone }: { room: PublicRoom; p: Player; act: Act; onDone?: () => void }) {
  const { t } = useApp();
  const m = useBetMath(room, p);
  const [busy, setBusy] = useState(false);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const as = p.id;
  const go = async (i: Intent) => {
    if (busy) return;
    setBusy(true);
    haptic(15);
    try {
      await act(i);
      onDone?.();
    } finally {
      setBusy(false);
    }
  };
  const canCheck = m.owe === 0;
  const callIsAllIn = m.owe >= p.stack;
  return (
    <>
      <div className="actions">
        <button className="act fold" disabled={busy} onClick={() => go({ type: 'fold', as })}>
          {t.fold}
        </button>
        {canCheck ? (
          <button className="act check" disabled={busy} onClick={() => go({ type: 'check', as })}>
            {t.check}
          </button>
        ) : (
          <button
            className={`act call ${callIsAllIn ? 'allin' : ''}`}
            disabled={busy}
            onClick={() => go({ type: callIsAllIn ? 'allin' : 'call', as })}
          >
            {callIsAllIn ? t.allin : t.call}
            <small>{fmtChips(m.callAmt)}</small>
          </button>
        )}
        {m.raiseOk && (
          <button className="act raise" disabled={busy} onClick={() => setRaiseOpen(true)}>
            {room.currentBet === 0 ? t.bet : t.raise}
            <small>
              {m.min >= m.max ? t.allin : `${t.min} ${fmtChips(m.min)}`}
            </small>
          </button>
        )}
      </div>
      <RaiseSheet
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        room={room}
        p={p}
        onConfirm={(to) => {
          setRaiseOpen(false);
          go(to >= m.max ? { type: 'allin', as } : { type: 'raise', to, as });
        }}
      />
    </>
  );
}

function RaiseSheet({
  open,
  onClose,
  room,
  p,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  room: PublicRoom;
  p: Player;
  onConfirm: (to: number) => void;
}) {
  const { t } = useApp();
  const m = useBetMath(room, p);
  const [to, setTo] = useState(m.min);
  useEffect(() => {
    if (open) setTo(m.min);
  }, [open, m.min]);
  const clamp = (v: number) => Math.min(m.max, Math.max(m.min, Math.round(v)));
  const step = Math.max(1, room.settings.sb || 1);
  const isBet = room.currentBet === 0;
  const presets: [string, number][] = [
    [t.min, m.min],
    [t.halfPot, m.potRaise(0.5)],
    [t.pot3_4, m.potRaise(0.75)],
    [t.fullPot, m.potRaise(1)],
    [t.allin, m.max],
  ];
  const chipDenoms = DENOMS.filter((d) => d.v <= Math.max(m.max - m.min, 1) && d.v >= Math.min(step, 100)).slice(-5).reverse();
  const added = to - p.bet;
  return (
    <Sheet open={open} onClose={onClose} title={isBet ? t.bet : t.raiseTo} className="raise-sheet">
      <div className="raise-display">
        <ChipStack amount={to} size={34} maxCols={4} maxPerCol={10} showLabel={false} />
        <div className="raise-amt">{fmtChips(to)}</div>
        {p.bet > 0 && <div className="raise-sub">+{fmtChips(added)}</div>}
      </div>
      <input
        className="slider"
        type="range"
        min={m.min}
        max={m.max}
        step={step}
        value={to}
        onChange={(e) => setTo(clamp(Number(e.target.value)))}
        style={{ '--pct': `${((to - m.min) / Math.max(1, m.max - m.min)) * 100}%` } as React.CSSProperties}
      />
      <div className="presets">
        {presets.map(([label, v]) => (
          <button key={label} className={`preset ${v === to ? 'on' : ''}`} onClick={() => setTo(v)}>
            {label}
          </button>
        ))}
      </div>
      {chipDenoms.length > 0 && (
        <div className="chip-adders">
          {chipDenoms.map((d) => (
            <button
              key={d.v}
              className="chip-add"
              onClick={() => {
                haptic(8);
                setTo((v) => clamp(v + d.v));
              }}
            >
              <ChipFace d={d} size={46} />
            </button>
          ))}
          <button className="chip-reset" onClick={() => setTo(m.min)}>
            ↺
          </button>
        </div>
      )}
      <button className="btn primary big" onClick={() => onConfirm(to)}>
        {to >= m.max ? t.allin : isBet ? t.bet : t.raiseTo} {fmtChips(to)}
      </button>
    </Sheet>
  );
}
