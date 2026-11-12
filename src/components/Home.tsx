import { useState } from 'react';
import type { PublicRoom } from '../../shared/types';
import { createGame, joinGame, ApiError } from '../lib/api';
import { DENOMS } from '../lib/chips';
import { getCreds, recentCodes } from '../lib/storage';
import { errText, useApp } from '../ctx';
import { LANG_NAMES, type Lang } from '../i18n';
import { ChipFace } from './Chip';

type Mode = 'menu' | 'create' | 'join';

export function Home({ initialCode, onEnter }: { initialCode?: string; onEnter: (room: PublicRoom) => void }) {
  const { t, prefs, setPrefs, toast } = useApp();
  const [mode, setMode] = useState<Mode>(initialCode ? 'join' : 'menu');
  const [name, setName] = useState(prefs.name);
  const [code, setCode] = useState(initialCode ?? '');
  const [stack, setStack] = useState('2000');
  const [sb, setSb] = useState('10');
  const [bb, setBb] = useState('20');
  const [busy, setBusy] = useState(false);
  const recent = recentCodes();

  const run = async (fn: () => Promise<{ room: PublicRoom }>) => {
    if (!name.trim() && mode !== 'menu') return toast(t.e.bad_name, 'error');
    setBusy(true);
    try {
      setPrefs({ name: name.trim() });
      const r = await fn();
      onEnter(r.room);
    } catch (e) {
      toast(errText(t, (e as ApiError).code), 'error');
    } finally {
      setBusy(false);
    }
  };

  const num = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => f(e.target.value.replace(/\D/g, ''));

  return (
    <div className="home">
      <div className="home-lang seg">
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <button key={l} className={l === prefs.lang ? 'on' : ''} onClick={() => setPrefs({ lang: l })}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="hero">
        <div className="hero-chips" aria-hidden>
          {[DENOMS[4], DENOMS[6], DENOMS[3], DENOMS[5], DENOMS[2]].map((d, i) => (
            <span
              key={d.v}
              className="hero-chip"
              style={{ '--i': i, left: `calc(50% + ${(i - 2) * 56}px)`, top: `calc(50% + ${Math.abs(i - 2) * 12}px)` } as React.CSSProperties}
            >
              <ChipFace d={d} size={64} />
            </span>
          ))}
        </div>
        <h1 className="logo">
          Chip<span>Stack</span>
        </h1>
        <p className="tagline">{t.tagline}</p>
        <p className="sub">{t.sub}</p>
      </div>

      {mode === 'menu' && (
        <div className="home-card">
          <button className="btn primary big" onClick={() => setMode('create')}>
            {t.create}
          </button>
          <button className="btn big" onClick={() => setMode('join')}>
            {t.join}
          </button>
          {recent.length > 0 && (
            <div className="recent">
              <small>{t.recent}</small>
              <div className="row wrap">
                {recent.map((c) => (
                  <button
                    key={c}
                    className="chip-btn code"
                    disabled={busy}
                    onClick={() => run(() => joinGame(c, prefs.name || 'Player', getCreds(c)))}
                  >
                    {c} ↩
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode !== 'menu' && (
        <form
          className="home-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'create')
              run(() => createGame(name, { startingStack: Number(stack), sb: Number(sb), bb: Number(bb) }));
            else run(() => joinGame(code.toUpperCase(), name, getCreds(code.toUpperCase())));
          }}
        >
          <label className="field">
            <span>{t.yourName}</span>
            <input className="input" value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} autoFocus={!name} />
          </label>
          {mode === 'join' && (
            <label className="field">
              <span>{t.gameCode}</span>
              <input
                className="input code-input"
                dir="ltr"
                value={code}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                autoFocus={!!name}
              />
            </label>
          )}
          {mode === 'create' && (
            <>
              <label className="field">
                <span>{t.startingStack}</span>
                <input className="input" inputMode="numeric" value={stack} onChange={num(setStack)} />
              </label>
              <div className="field">
                <span>{t.blinds}</span>
                <div className="row">
                  <input className="input" inputMode="numeric" value={sb} onChange={num(setSb)} aria-label={t.smallBlind} />
                  <span className="slash">/</span>
                  <input className="input" inputMode="numeric" value={bb} onChange={num(setBb)} aria-label={t.bigBlind} />
                </div>
              </div>
            </>
          )}
          <button className="btn primary big" disabled={busy || (mode === 'join' && code.length < 4)}>
            {busy ? '…' : mode === 'create' ? t.go : t.join}
          </button>
          <button type="button" className="btn ghost" onClick={() => setMode('menu')}>
            {t.back}
          </button>
        </form>
      )}
    </div>
  );
}
