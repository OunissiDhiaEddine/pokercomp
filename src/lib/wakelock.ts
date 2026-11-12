import { useEffect } from 'react';

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** Keeps the screen on while `enabled`. Re-acquires after the tab becomes visible again. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !wakeLockSupported) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release();
      } catch {
        /* denied (battery saver etc.) */
      }
    };
    acquire();
    const onVis = () => acquire();
    document.addEventListener('visibilitychange', onVis);
    // Some browsers require a user gesture: retry on first tap
    document.addEventListener('pointerdown', onVis, { once: true });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('pointerdown', onVis);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
}
