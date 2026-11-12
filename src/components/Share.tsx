import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Sheet } from './Sheet';

export const roomUrl = (code: string) => `${location.origin}/?room=${code}`;

export function ShareSheet({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const url = roomUrl(code);
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [url]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'PokerComp', text: `${t.shareText} ${code}`, url });
    } catch {
      /* cancelled */
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t.share}>
      <div className="share">
        <div className="share-code" dir="ltr">
          {code.split('').map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <small className="hint">{t.scanToJoin}</small>
        <div className="row">
          <button className="btn" onClick={copy}>
            {copied ? t.copied : t.copyLink}
          </button>
          {'share' in navigator && (
            <button className="btn primary" onClick={share}>
              {t.invite} ↗
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
