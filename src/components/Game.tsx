import { useCallback, useEffect, useRef, useState } from 'react';
import { handInProgress } from '../../shared/engine';
import type { Intent, Player, PublicRoom } from '../../shared/types';
import { errText, useApp } from '../ctx';
import { fmt, LANG_NAMES, type Lang } from '../i18n';
import { ApiError, leaveGame, useRoom } from '../lib/api';
import { fmtChips } from '../lib/chips';
import { chime, flyChips, haptic, swoosh } from '../lib/fx';
import type { Creds } from '../lib/storage';
import { wakeLockSupported } from '../lib/wakelock';
import { ActionButtons } from './Actions';
import { AwardSheet, CardPicker, HostPrimary, PlayerSheet, SettingsSheet } from './Host';
import { ShareSheet } from './Share';
import { Sheet } from './Sheet';
import { Table } from './Table';

export function Game({
  code,
  creds,
  initial,
  onExit,
}: {
  code: string;
  creds: Creds;
  initial: PublicRoom | null;
  onExit: () => void;
}) {
  const { t, prefs, setPrefs, toast, openRules } = useApp();
  const { room, error, offline, act: rawAct, store } = useRoom(code, creds, initial);
  const [share, setShare] = useState(false);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [award, setAward] = useState(false);
  const [seat, setSeat] = useState<Player | null>(null);
  const [cardIdx, setCardIdx] = useState<number | null>(null);

  const act = useCallback(
    async (i: Intent) => {
      try {
        return await rawAct(i);
      } catch (e) {
        const c = (e as ApiError).code;
        toast(errText(t, c), 'error');
        haptic([30, 40, 30]);
        throw e;
      }
    },
    [rawAct, t, toast],
  );

  useEffect(() => {
    if (error === 'room_not_found') {
      toast(errText(t, error), 'error');
      onExit();
    }
  }, [error]);

  // Animate new game events (chips flying, cards dealt)
  const lastEvent = useRef<number | null>(null);
  useEffect(() => {
    if (!room) return;
    if (lastEvent.current === null || room.eventSeq < lastEvent.current) {
      lastEvent.current = room.eventSeq;
      return;
    }
    const fresh = room.events.filter((e) => e.id > lastEvent.current!);
    lastEvent.current = room.eventSeq;
    fresh.forEach((e, i) => {
      setTimeout(() => {
        const seatEl = e.pid ? document.querySelector(`[data-seat="${e.pid}"]`) : null;
        if (e.k === 'bet') flyChips(seatEl, document.querySelector(`[data-bet="${e.pid}"]`), e.a ?? 1);
        else if (e.k === 'win') {
          flyChips(document.getElementById('pot'), seatEl, e.a ?? 1, { count: 8 });
          if (e.pid === creds.pid) {
            chime([660, 880, 1320], 0.1);
            haptic([40, 60, 40]);
          }
        } else if (e.k === 'deal' || e.k === 'start') swoosh();
      }, i * 120);
    });
  }, [room?.eventSeq]);

  // Notify when it becomes my turn
  const myTurn = !!room && room.toAct === creds.pid && !room.awaitingDeal;
  useEffect(() => {
    if (myTurn) {
      chime([880, 1175], 0.08, 0.08);
      haptic([60, 50, 60]);
    }
  }, [myTurn, room?.street]);

  if (!room) {
    return (
      <div className="loading">
        <div className="spinner-chip" />
      </div>
    );
  }

  const me = room.players.find((p) => p.id === creds.pid);
  if (!me) {
    return (
      <div className="loading">
        <p>{t.e.not_in_room}</p>
        <button className="btn primary" onClick={onExit}>
          {t.back}
        </button>
      </div>
    );
  }
  const isHost = room.hostId === me.id;
  const toAct = room.players.find((p) => p.id === room.toAct);
  const inPlay = handInProgress(room);
  const allInRunout = inPlay && room.awaitingDeal && room.players.filter((p) => p.inHand && !p.folded && !p.allIn).length < 2;

  let status = '';
  if (room.street === 'showdown') status = t.waitingShowdown;
  else if (room.awaitingDeal) status = allInRunout ? t.everyoneAllIn : fmt(t.waitingDeal, { street: t[room.street === 'preflop' ? 'flop' : room.street === 'flop' ? 'turn' : 'river'] });
  else if (toAct && !myTurn) status = fmt(t.waitingFor, { name: toAct.name });
  else if (!inPlay) status = isHost ? '' : t.waitingHost;

  const result = room.street === 'complete' ? room.lastResult : null;
  const winTotals: Record<string, number> = {};
  result?.pots.forEach((pt) => Object.entries(pt.shares).forEach(([id, a]) => (winTotals[id] = (winTotals[id] ?? 0) + a)));
  const owe = Math.max(0, room.currentBet - me.bet);

  return (
    <div className={`game ${myTurn ? 'my-turn' : ''}`}>
      <header className="topbar">
        <button className="code-chip" onClick={() => setShare(true)} dir="ltr">
          <small>CODE</small>
          <b>{room.code}</b>
          <span className="share-ico">⤴</span>
        </button>
        <div className="blinds-pill" dir="ltr">
          {fmtChips(room.settings.sb)}/{fmtChips(room.settings.bb)}
        </div>
        <div className="top-actions">
          {isHost && (
            <button className="icon-btn" onClick={() => setSettings(true)} aria-label={t.settings}>
              ⚙
            </button>
          )}
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t.menu}>
            ☰
          </button>
        </div>
      </header>

      {(offline || store === 'memory') && (
        <div className={`banner ${offline ? '' : 'warn'}`}>{offline ? t.offline : t.memoryWarn}</div>
      )}

      <Table
        room={room}
        meId={me.id}
        onSeat={(p) => setSeat(p)}
        onBoard={isHost ? (i) => setCardIdx(i) : undefined}
      />

      {result && Object.keys(winTotals).length > 0 && (
        <div className="win-banner" key={result.handNo}>
          {Object.entries(winTotals).map(([id, a]) => (
            <div key={id}>
              🏆 {fmt(t.wins, { name: room.players.find((p) => p.id === id)?.name ?? '?', amount: fmtChips(a) })}
            </div>
          ))}
        </div>
      )}

      <footer className="dock">
        <div className="me-row">
          <div className="me-stack">
            <small>{me.name}</small>
            <b>{fmtChips(me.stack)}</b>
          </div>
          {myTurn ? (
            <div className="turn-label">
              {t.yourTurn}
              {owe > 0 && (
                <small>
                  {fmtChips(Math.min(owe, me.stack))} {t.toCall}
                </small>
              )}
            </div>
          ) : (
            <div className="status">{status}</div>
          )}
        </div>
        {myTurn && <ActionButtons room={room} p={me} act={act} />}
        {isHost && (
          <div className="host-row">
            <HostPrimary room={room} act={act} onAward={() => setAward(true)} />
            <div className="host-mini">
              <button className="mini" disabled={!room.canUndo} onClick={() => act({ type: 'undo' }).catch(() => {})}>
                ↶ {t.undo}
              </button>
              {inPlay && (
                <button
                  className="mini"
                  onClick={() => {
                    if (confirm(t.cancelHand + '?')) act({ type: 'end_hand' }).catch(() => {});
                  }}
                >
                  ✕ {t.cancelHand}
                </button>
              )}
              {toAct && !myTurn && (
                <button className="mini" onClick={() => setSeat(toAct)}>
                  ☝ {fmt(t.actFor, { name: toAct.name })}
                </button>
              )}
            </div>
          </div>
        )}
      </footer>

      <ShareSheet open={share} onClose={() => setShare(false)} code={room.code} />
      <AwardSheet open={award && room.street === 'showdown'} onClose={() => setAward(false)} room={room} act={act} />
      <PlayerSheet player={seat} onClose={() => setSeat(null)} room={room} meId={me.id} act={act} />
      <CardPicker index={cardIdx} onClose={() => setCardIdx(null)} room={room} act={act} />
      {isHost && <SettingsSheet open={settings} onClose={() => setSettings(false)} room={room} act={act} />}

      <Sheet open={menu} onClose={() => setMenu(false)} title={t.menu}>
        <div className="menu">
          <div className="field">
            <span>{t.language}</span>
            <div className="seg">
              {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
                <button key={l} className={l === prefs.lang ? 'on' : ''} onClick={() => setPrefs({ lang: l })}>
                  {LANG_NAMES[l]}
                </button>
              ))}
            </div>
          </div>
          <label className="toggle">
            <span>🔊 {t.sound}</span>
            <input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} />
          </label>
          <label className={`toggle ${wakeLockSupported ? '' : 'disabled'}`}>
            <span>☀ {t.keepAwake}</span>
            <input
              type="checkbox"
              checked={prefs.wake && wakeLockSupported}
              disabled={!wakeLockSupported}
              onChange={(e) => setPrefs({ wake: e.target.checked })}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              setMenu(false);
              openRules();
            }}
          >
            ♠ {t.rules}
          </button>
          <button className="btn" onClick={() => { setMenu(false); setShare(true); }}>
            ⤴ {t.share}
          </button>
          <div className="log">
            <h3>{t.history}</h3>
            <ul>
              {[...room.log].reverse().map((l, i) => (
                <li key={i}>
                  {fmt(t.log[l.k] ?? l.k, {
                    p: l.p,
                    a: l.a !== undefined ? fmtChips(l.a) : '',
                    s: l.k === 'deal' && l.s ? (t as any)[l.s] ?? l.s : l.s,
                  })}
                </li>
              ))}
            </ul>
          </div>
          <button className="btn" onClick={onExit}>
            ⌂ {t.back}
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              try {
                await leaveGame(room.code, creds);
                onExit();
              } catch (e) {
                toast(errText(t, (e as ApiError).code), 'error');
              }
            }}
          >
            {t.leave}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
