import { useState } from 'react';
import { useApp } from '../ctx';
import { htmlLang, isRtl, LANG_NAMES, RULES, type Lang } from '../i18n';
import { CardFace } from './Card';

type Tab = 'hands' | 'howto' | 'betting' | 'terms';

/** The hidden rules drawer: pull the tab on the screen edge to open it. */
export function RulesDrawer({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { prefs } = useApp();
  const [lang, setLang] = useState<Lang>(prefs.lang);
  const [tab, setTab] = useState<Tab>('hands');
  const R = RULES[lang];
  return (
    <>
      <button
        className={`rules-tab ${open ? 'hide' : ''}`}
        onClick={() => {
          setLang(prefs.lang);
          setOpen(true);
        }}
        aria-label="Rules"
      >
        <span>♠</span>
        <span>♥</span>
      </button>
      <div className={`rules-wrap ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <aside className="rules" dir={isRtl(lang) ? 'rtl' : 'ltr'} lang={htmlLang(lang)} onClick={(e) => e.stopPropagation()}>
          <header className="rules-head">
            <h2>{R.title}</h2>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </header>
          <div className="seg langs">
            {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
              <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
          <div className="seg tabs">
            {(Object.keys(R.tabs) as Tab[]).map((k) => (
              <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>
                {R.tabs[k]}
              </button>
            ))}
          </div>
          <div className="rules-body">
            {tab === 'hands' && (
              <>
                <p className="hint">{R.handsIntro}</p>
                <ol className="hands">
                  {R.hands.map((h, i) => (
                    <li key={i}>
                      <div className="hand-top">
                        <span className="rank-n">{i + 1}</span>
                        <b>{h.name}</b>
                      </div>
                      <div className="hand-cards" dir="ltr">
                        {h.cards.map((c, j) => (
                          <CardFace key={j} card={c} small dim={!!h.hl && !h.hl.includes(j)} />
                        ))}
                      </div>
                      <p>{h.desc}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {(tab === 'howto' || tab === 'betting') && (
              <div className="steps">
                {R[tab].map((s, i) => (
                  <section key={i}>
                    <h3>{s.h}</h3>
                    <p>{s.p}</p>
                  </section>
                ))}
              </div>
            )}
            {tab === 'terms' && (
              <dl className="terms">
                {R.terms.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
