import { memo, useMemo } from 'react';
import { boardCount, computePots, totalPot } from '../../shared/engine';
import type { Player, PublicRoom } from '../../shared/types';
import { useApp } from '../ctx';
import { fmt } from '../i18n';
import { AVATAR_COLORS, initials } from '../lib/avatars';
import { fmtChips } from '../lib/chips';
import { BoardCard } from './Card';
import { ChipStack } from './Chip';

/** Seat positions around an oval, starting with "me" at the bottom. */
function layout(n: number) {
  const pos: { x: number; y: number; bx: number; by: number; side: 'top' | 'bottom' | 'left' | 'right' }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Squash into a superellipse so seats hug the rounded-rect table
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.7);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.7);
    pos.push({
      x: 50 + sx * 41,
      y: 50 + sy * 41,
      bx: 50 + sx * 41 * 0.58,
      by: 50 + sy * 41 * 0.62,
      side: Math.abs(s) > 0.6 ? (s > 0 ? 'bottom' : 'top') : c > 0 ? 'right' : 'left',
    });
  }
  return pos;
}

const Seat = memo(function Seat({
  p,
  room,
  me,
  pos,
  onTap,
}: {
  p: Player;
  room: PublicRoom;
  me: boolean;
  pos: ReturnType<typeof layout>[number];
  onTap: (p: Player) => void;
}) {
  const { t } = useApp();
  const turn = room.toAct === p.id;
  const [c1, c2] = AVATAR_COLORS[p.avatar % AVATAR_COLORS.length];
  const inPlay = room.street !== 'lobby' && room.street !== 'complete';
  const out = inPlay && (!p.inHand || p.folded);
  const winner = room.street === 'complete' && room.lastResult?.pots.some((pt) => pt.winners.includes(p.id));
  const action = p.lastAction;
  const actionLabel = action
    ? action.type === 'sb'
      ? 'SB'
      : action.type === 'bb'
        ? 'BB'
        : action.type === 'allin'
          ? t.allInTag
          : t[action.type]
    : null;

  return (
    <>
      <button
        type="button"
        className={`seat side-${pos.side} ${turn ? 'turn' : ''} ${out ? 'out' : ''} ${me ? 'me' : ''} ${winner ? 'winner' : ''}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        data-seat={p.id}
        onClick={() => onTap(p)}
      >
        <span className="avatar" style={{ '--a1': c1, '--a2': c2 } as React.CSSProperties}>
          {initials(p.name)}
          {turn && <span className="turn-ring" />}
          {room.dealerId === p.id && room.street !== 'lobby' && <span className="dealer-btn">D</span>}
          {room.hostId === p.id && <span className="host-crown">♛</span>}
        </span>
        <span className="seat-info">
          <span className="seat-name">{me ? `${p.name}` : p.name}</span>
          <span className="seat-stack">{p.sittingOut ? t.sittingOut : fmtChips(p.stack)}</span>
        </span>
        {inPlay && p.inHand && (p.folded || p.allIn || actionLabel) && (
          <span className={`seat-tag ${p.allIn ? 'allin' : p.folded ? 'fold' : ''}`}>
            {p.folded ? t.folded : p.allIn ? t.allInTag : actionLabel}
          </span>
        )}
      </button>
      <div className="seat-bet" data-bet={p.id} style={{ left: `${pos.bx}%`, top: `${pos.by}%` }}>
        {p.bet > 0 && <ChipStack amount={p.bet} size={20} maxCols={2} maxPerCol={6} />}
      </div>
    </>
  );
});

export function Table({
  room,
  meId,
  onSeat,
  onBoard,
}: {
  room: PublicRoom;
  meId: string;
  onSeat: (p: Player) => void;
  onBoard?: (i: number) => void;
}) {
  const { t } = useApp();
  const ordered = useMemo(() => {
    const i = Math.max(0, room.players.findIndex((p) => p.id === meId));
    return [...room.players.slice(i), ...room.players.slice(0, i)];
  }, [room.players, meId]);
  const pos = useMemo(() => layout(Math.max(ordered.length, 2)), [ordered.length]);

  const dealtCount = boardCount(room);
  const pots = room.street === 'complete' ? [] : computePots(room.players);
  const collected = room.street === 'complete' ? 0 : totalPot(room) - room.players.reduce((s, p) => s + p.bet, 0);
  const showPots = pots.length > 1 && room.players.some((p) => p.allIn && p.inHand);
  const streetLabel = room.street === 'showdown' ? t.showdown : t[room.street];

  return (
    <div className="table-area">
      <div className="table-felt">
        <div className="felt-inner" />
        <div className="felt-logo">ChipStack</div>
      </div>
      <div className="table-center">
        <div className="street-pill">
          {room.handNo > 0 && <span>{fmt(t.hand, { n: room.handNo })}</span>}
          <b>{streetLabel}</b>
        </div>
        <div className="board">
          {room.board.map((c, i) => (
            <BoardCard
              key={i}
              index={i}
              dealt={i < dealtCount}
              card={c}
              onClick={onBoard && i < dealtCount ? () => onBoard(i) : undefined}
            />
          ))}
        </div>
        <div className="pot" id="pot">
          {collected > 0 ? (
            <ChipStack amount={collected} size={28} maxCols={4} maxPerCol={9} showLabel={false} />
          ) : (
            <div className="pot-empty" />
          )}
          {room.street !== 'complete' && room.street !== 'lobby' && (
            <div className="pot-amt">
              <small>{t.pot}</small> {fmtChips(totalPot(room))}
            </div>
          )}
          {showPots && (
            <div className="side-pots">
              {pots.map((pt, i) => (
                <span key={i}>
                  {i === 0 ? t.mainPot : `${t.sidePot} ${i}`}: <b>{fmtChips(pt.amount)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {ordered.map((p, i) => (
        <Seat key={p.id} p={p} room={room} me={p.id === meId} pos={pos[i]} onTap={onSeat} />
      ))}
      {ordered.length < 2 && <div className="table-empty">{t.emptyTable}</div>}
    </div>
  );
}
