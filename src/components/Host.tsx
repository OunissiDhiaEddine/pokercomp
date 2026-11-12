import { useEffect, useMemo, useState } from 'react';
import { computePots, handInProgress } from '../../shared/engine';
import type { Intent, Player, PublicRoom } from '../../shared/types';
import { useApp } from '../ctx';
import { fmt } from '../i18n';
import { AVATAR_COLORS, initials } from '../lib/avatars';
import { fmtChips } from '../lib/chips';
import { ActionButtons } from './Actions';
import { CardFace, RANKS, SUIT_KEYS } from './Card';
import { Sheet } from './Sheet';

type Act = (i: Intent) => Promise<unknown>;

export function Avatar({ p, size = 36 }: { p: Player; size?: number }) {
  const [c1, c2] = AVATAR_COLORS[p.avatar % AVATAR_COLORS.length];
  return (
    <span className="avatar" style={{ '--a1': c1, '--a2': c2, width: size, height: size, fontSize: size * 0.38 } as React.CSSProperties}>
      {initials(p.name)}
    </span>
  );
}

/** The big contextual button the host uses to drive the hand. */
export function HostPrimary({ room, act, onAward }: { room: PublicRoom; act: Act; onAward: () => void }) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);
  const go = async (i: Intent) => {
    setBusy(true);
    try {
      await act(i);
    } finally {
      setBusy(false);
    }
  };
  const ready = room.players.filter((p) => !p.sittingOut && p.stack > 0).length >= 2;
  if (room.street === 'lobby' || room.street === 'complete') {
    return (
      <button className="btn primary big host-go" disabled={busy || !ready} onClick={() => go({ type: 'start_hand' })}>
        {ready ? `♠ ${t.startHand}` : t.needTwo}
      </button>
    );
  }
  if (room.street === 'showdown') {
    return (
      <button className="btn gold big host-go pulse" onClick={onAward}>
        🏆 {t.chooseWinners}
      </button>
    );
  }
  if (room.awaitingDeal) {
    const label = room.street === 'preflop' ? t.dealFlop : room.street === 'flop' ? t.dealTurn : t.dealRiver;
    return (
      <button className="btn gold big host-go pulse" disabled={busy} onClick={() => go({ type: 'deal_next' })}>
        ✦ {label}
      </button>
    );
  }
  return null;
}

export function AwardSheet({ open, onClose, room, act }: { open: boolean; onClose: () => void; room: PublicRoom; act: Act }) {
  const { t } = useApp();
  const pots = useMemo(() => computePots(room.players), [room.players]);
  const [sel, setSel] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSel(pots.map((p) => (p.eligible.length === 1 ? [...p.eligible] : [])));
  }, [open, pots]);
  const toggle = (i: number, id: string) =>
    setSel((s) =>
      s.map((w, j) => {
        if (j !== i) return w;
        return w.includes(id) ? w.filter((x) => x !== id) : [...w, id];
      }),
    );
  const ok = sel.length === pots.length && sel.every((w) => w.length > 0);
  const name = (id: string) => room.players.find((p) => p.id === id);
  return (
    <Sheet open={open} onClose={onClose} title={t.chooseWinners}>
      <p className="hint">{t.chooseWinnersHint}</p>
      {pots.map((pot, i) => (
        <div className="award-pot" key={i}>
          <div className="award-head">
            <span>{pots.length > 1 ? (i === 0 ? t.mainPot : `${t.sidePot} ${i}`) : t.pot}</span>
            <b>{fmtChips(pot.amount)}</b>
          </div>
          <div className="award-players">
            {pot.eligible.map((id) => {
              const p = name(id)!;
              const on = sel[i]?.includes(id);
              return (
                <button key={id} className={`award-p ${on ? 'on' : ''}`} onClick={() => toggle(i, id)} disabled={pot.eligible.length === 1}>
                  <Avatar p={p} size={40} />
                  <span>{p.name}</span>
                  {on && sel[i].length > 1 && <small>{fmtChips(Math.floor(pot.amount / sel[i].length))}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        className="btn gold big"
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await act({ type: 'award', winners: sel });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        🏆 {t.awardPot}
      </button>
    </Sheet>
  );
}

export function PlayerSheet({
  player,
  onClose,
  room,
  meId,
  act,
}: {
  player: Player | null;
  onClose: () => void;
  room: PublicRoom;
  meId: string;
  act: Act;
}) {
  const { t } = useApp();
  const p = player ? room.players.find((x) => x.id === player.id) ?? null : null;
  const [stack, setStack] = useState('');
  useEffect(() => {
    if (p) setStack(String(p.stack));
  }, [p?.id, p?.stack]);
  if (!p) return null;
  const isHost = room.hostId === meId;
  const self = p.id === meId;
  const inPlay = handInProgress(room);
  const canActFor = isHost && !self && room.toAct === p.id && !room.awaitingDeal;
  const run = (i: Intent) => act(i).catch(() => {});
  return (
    <Sheet
      open={!!p}
      onClose={onClose}
      title={
        <span className="ps-title">
          <Avatar p={p} size={32} /> {p.name}
          {room.hostId === p.id && <span className="badge gold">{t.host}</span>}
          {self && <span className="badge">{t.you}</span>}
        </span>
      }
    >
      <div className="ps-stack">
        <span>{t.setStack}</span>
        <b>{fmtChips(p.stack)}</b>
      </div>
      {canActFor && (
        <div className="ps-section">
          <h3>{fmt(t.actFor, { name: p.name })}</h3>
          <ActionButtons room={room} p={p} act={act} onDone={onClose} />
        </div>
      )}
      {isHost && (
        <div className="ps-section">
          <h3>{t.rebuy}</h3>
          <div className="row">
            <input
              className="input"
              inputMode="numeric"
              value={stack}
              onChange={(e) => setStack(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn" onClick={() => run({ type: 'set_stack', target: p.id, stack: Number(stack) })}>
              {t.save}
            </button>
          </div>
          <div className="row quick">
            {[room.settings.bb * 10, room.settings.bb * 50, room.settings.startingStack].map((v, i) => (
              <button key={i} className="chip-btn" onClick={() => setStack(String((Number(stack) || 0) + v))}>
                +{fmtChips(v)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="ps-actions">
        {(isHost || self) && (
          <button className="btn" onClick={() => run({ type: 'sit', target: p.id, out: !p.sittingOut })}>
            {p.sittingOut ? t.sitIn : t.sitOut}
          </button>
        )}
        {isHost && !self && (
          <button className="btn" onClick={() => run({ type: 'make_host', target: p.id }).then(onClose)}>
            ♛ {t.makeHost}
          </button>
        )}
        {isHost && !self && !(inPlay && p.inHand) && (
          <button className="btn danger" onClick={() => run({ type: 'kick', target: p.id }).then(onClose)}>
            {t.remove}
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function CardPicker({
  index,
  onClose,
  room,
  act,
}: {
  index: number | null;
  onClose: () => void;
  room: PublicRoom;
  act: Act;
}) {
  const { t } = useApp();
  if (index === null) return null;
  const used = new Set(room.board.filter((c, i) => c && i !== index));
  const set = (card: string | null) => act({ type: 'set_board', index, card }).then(onClose, () => {});
  return (
    <Sheet open onClose={onClose} title={t.pickCard} className="card-picker">
      <p className="hint">{t.boardHint}</p>
      <div className="cp-grid">
        {SUIT_KEYS.map((s) =>
          RANKS.map((r) => {
            const c = r + s;
            return (
              <button key={c} className={`cp-card ${room.board[index] === c ? 'on' : ''}`} disabled={used.has(c)} onClick={() => set(c)}>
                <CardFace card={c} small />
              </button>
            );
          }),
        )}
      </div>
      <button className="btn" onClick={() => set(null)}>
        {t.clear}
      </button>
    </Sheet>
  );
}

export function SettingsSheet({ open, onClose, room, act }: { open: boolean; onClose: () => void; room: PublicRoom; act: Act }) {
  const { t, toast } = useApp();
  const [sb, setSb] = useState(String(room.settings.sb));
  const [bb, setBb] = useState(String(room.settings.bb));
  const [st, setSt] = useState(String(room.settings.startingStack));
  useEffect(() => {
    if (open) {
      setSb(String(room.settings.sb));
      setBb(String(room.settings.bb));
      setSt(String(room.settings.startingStack));
    }
  }, [open]);
  const num = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => f(e.target.value.replace(/\D/g, ''));
  return (
    <Sheet open={open} onClose={onClose} title={t.settings}>
      <div className="grid2">
        <label className="field">
          <span>{t.smallBlind}</span>
          <input className="input" inputMode="numeric" value={sb} onChange={num(setSb)} />
        </label>
        <label className="field">
          <span>{t.bigBlind}</span>
          <input className="input" inputMode="numeric" value={bb} onChange={num(setBb)} />
        </label>
      </div>
      <label className="field">
        <span>{t.startingStack}</span>
        <input className="input" inputMode="numeric" value={st} onChange={num(setSt)} />
      </label>
      <button
        className="btn primary big"
        onClick={() =>
          act({ type: 'settings', sb: Number(sb), bb: Number(bb), startingStack: Number(st) })
            .then(() => {
              toast('✓', 'info');
              onClose();
            })
            .catch(() => {})
        }
      >
        {t.save}
      </button>
    </Sheet>
  );
}
