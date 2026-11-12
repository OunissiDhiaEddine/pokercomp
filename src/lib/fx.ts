import { denomFor } from './chips';

let ctx: AudioContext | null = null;
let enabled = true;

export const setSoundEnabled = (on: boolean) => {
  enabled = on;
};

function audio() {
  if (!enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short ceramic "clack" made from filtered noise. */
export function clack(delay = 0, gain = 0.35) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = 0.05;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200 + Math.random() * 1800;
  bp.Q.value = 2.5;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);
}

export function chime(notes = [880, 1320], gap = 0.09, vol = 0.12) {
  const a = audio();
  if (!a) return;
  notes.forEach((f, i) => {
    const t = a.currentTime + i * gap;
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.55);
  });
}

export function swoosh() {
  const a = audio();
  if (!a) return;
  const len = 0.25;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length) * 0.5;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(800, a.currentTime);
  f.frequency.linearRampToValueAtTime(4000, a.currentTime + len);
  const g = a.createGain();
  g.gain.value = 0.25;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const haptic = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
};

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Animate a handful of 3D chips flying between two elements. */
export function flyChips(from: Element | null, to: Element | null, amount: number, opts: { count?: number; sound?: boolean } = {}) {
  if (!from || !to || reduced()) return;
  const a = center(from);
  const b = center(to);
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const count = opts.count ?? Math.min(6, Math.max(2, Math.ceil(Math.log10(Math.max(amount, 1)) * 2)));
  const d = denomFor(Math.max(1, Math.floor(amount / count)));
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('div');
    chip.className = 'fly-chip';
    chip.style.setProperty('--c', d.c);
    chip.style.setProperty('--e', d.e);
    layer.appendChild(chip);
    const jitter = () => (Math.random() - 0.5) * 18;
    const ex = b.x + jitter();
    const ey = b.y + jitter();
    const mx = (a.x + ex) / 2;
    const my = Math.min(a.y, ey) - 40 - Math.random() * 30;
    const spin = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360);
    const anim = chip.animate(
      [
        { transform: `translate(${a.x}px, ${a.y}px) rotateX(55deg) rotateZ(0deg) scale(1)`, opacity: 0 },
        { opacity: 1, offset: 0.08 },
        { transform: `translate(${mx}px, ${my}px) rotateX(20deg) rotateZ(${spin / 2}deg) scale(1.25)`, offset: 0.5 },
        { transform: `translate(${ex}px, ${ey}px) rotateX(60deg) rotateZ(${spin}deg) scale(1)`, opacity: 1 },
      ],
      { duration: 520 + Math.random() * 160, delay: i * 55, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' },
    );
    anim.onfinish = () => {
      chip.remove();
      if (opts.sound !== false) clack(0, 0.25);
    };
  }
}
