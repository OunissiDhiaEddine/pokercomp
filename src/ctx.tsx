import { createContext, useContext } from 'react';
import { DICTS, type Dict, type Lang } from './i18n';

export interface Prefs {
  lang: Lang;
  sound: boolean;
  wake: boolean;
  name: string;
}

export interface AppCtx {
  t: Dict;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  openRules: () => void;
  toast: (msg: string, kind?: 'error' | 'info') => void;
}

export const Ctx = createContext<AppCtx>({
  t: DICTS.en,
  prefs: { lang: 'en', sound: true, wake: true, name: '' },
  setPrefs: () => {},
  openRules: () => {},
  toast: () => {},
});

export const useApp = () => useContext(Ctx);

export const errText = (t: Dict, code: string) => t.e[code] ?? t.e.default;
