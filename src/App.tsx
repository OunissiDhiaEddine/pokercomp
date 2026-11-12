import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicRoom } from '../shared/types';
import { Game } from './components/Game';
import { Home } from './components/Home';
import { RulesDrawer } from './components/Rules';
import { Ctx, errText, type Prefs } from './ctx';
import { DICTS, type Lang } from './i18n';
import { joinGame, type ApiError } from './lib/api';
import { setSoundEnabled } from './lib/fx';
import { getCreds, load, save } from './lib/storage';
import { useWakeLock } from './lib/wakelock';

const PREFS = 'chipstack:prefs';

function detectLang(): Lang {
  const l = (navigator.language || 'en').slice(0, 2);
  return l === 'fr' || l === 'ar' ? l : 'en';
}

function readCodeFromUrl() {
  const q = new URLSearchParams(location.search).get('room');
  return q && /^[A-Za-z0-9]{4,6}$/.test(q) ? q.toUpperCase() : undefined;
}

function setUrlCode(code: string | null) {
  const url = code ? `/?room=${code}` : '/';
  if (location.pathname + location.search !== url) history.replaceState(null, '', url);
}

export function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => load<Prefs>(PREFS, { lang: detectLang(), sound: true, wake: true, name: '' }));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [urlCode] = useState(readCodeFromUrl);
  const [active, setActive] = useState<{ code: string; room: PublicRoom | null } | null>(null);
  const [booting, setBooting] = useState(() => !!(urlCode && getCreds(urlCode)));

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      save(PREFS, next);
      return next;
    });
  }, []);

  const toast = useCallback((msg: string, kind: 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800);
  }, []);

  const t = DICTS[prefs.lang];
  useEffect(() => {
    document.documentElement.lang = prefs.lang;
    document.documentElement.dir = prefs.lang === 'ar' ? 'rtl' : 'ltr';
  }, [prefs.lang]);
  useEffect(() => setSoundEnabled(prefs.sound), [prefs.sound]);
  useWakeLock(prefs.wake && !!active);

  // Auto-rejoin when opening a link to a game we're already part of
  useEffect(() => {
    if (!booting || !urlCode) return;
    joinGame(urlCode, prefs.name || 'Player', getCreds(urlCode))
      .then((r) => setActive({ code: r.room.code, room: r.room }))
      .catch((e) => toast(errText(t, (e as ApiError).code), 'error'))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => setUrlCode(active?.code ?? null), [active?.code]);

  const ctx = useMemo(() => ({ t, prefs, setPrefs, toast, openRules: () => setRulesOpen(true) }), [t, prefs, setPrefs, toast]);
  const creds = active ? getCreds(active.code) : null;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {booting ? (
          <div className="loading">
            <div className="spinner-chip" />
          </div>
        ) : active && creds ? (
          <Game key={active.code} code={active.code} creds={creds} initial={active.room} onExit={() => setActive(null)} />
        ) : (
          <Home initialCode={urlCode} onEnter={(room) => setActive({ code: room.code, room })} />
        )}
        <RulesDrawer open={rulesOpen} setOpen={setRulesOpen} />
        <div className="toasts">
          {toasts.map((x) => (
            <div key={x.id} className={`toast ${x.kind}`}>
              {x.msg}
            </div>
          ))}
        </div>
        <div id="fx-layer" aria-hidden />
      </div>
    </Ctx.Provider>
  );
}
