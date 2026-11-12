import { useCallback, useEffect, useRef, useState } from 'react';
import type { Intent, PublicRoom, Settings } from '../../shared/types';
import { setCreds, type Creds } from './storage';

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(init?: RequestInit, query = ''): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/room${query}`, {
      ...init,
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({ error: 'default' }));
  if (!res.ok || data.error) throw new ApiError(data.error ?? 'default');
  return data as T;
}

type JoinRes = { room: PublicRoom; me: { pid: string; token: string }; store?: string };

export async function createGame(name: string, settings: Settings) {
  const r = await call<JoinRes>({ method: 'POST', body: JSON.stringify({ op: 'create', name, settings }) });
  setCreds(r.room.code, r.me);
  return r;
}

export async function joinGame(code: string, name: string, creds?: Creds | null) {
  const r = await call<JoinRes>({
    method: 'POST',
    body: JSON.stringify({ op: 'join', code, name, pid: creds?.pid, token: creds?.token }),
  });
  setCreds(r.room.code, r.me);
  return r;
}

export async function leaveGame(code: string, creds: Creds) {
  await call({ method: 'POST', body: JSON.stringify({ op: 'leave', code, ...creds }) });
  setCreds(code, null);
}

export function useRoom(code: string, creds: Creds, initial: PublicRoom | null) {
  const [room, setRoomState] = useState<PublicRoom | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [store, setStore] = useState<string | undefined>();
  const versionRef = useRef(initial?.version ?? 0);

  const setRoom = useCallback((r: PublicRoom) => {
    if (r.version < versionRef.current) return;
    versionRef.current = r.version;
    setRoomState(r);
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let fails = 0;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === 'visible') {
        try {
          const q = `?code=${code}&v=${versionRef.current}&pid=${creds.pid}`;
          const data = await call<{ same?: boolean; room?: PublicRoom; store?: string }>(undefined, q);
          if (data.room) setRoom(data.room);
          if (data.store) setStore(data.store);
          fails = 0;
          setOffline(false);
        } catch (e) {
          const c = (e as ApiError).code;
          if (c === 'room_not_found') {
            setError(c);
            return;
          }
          fails++;
          if (fails > 2) setOffline(true);
        }
      }
      timer = setTimeout(tick, document.visibilityState === 'visible' ? 1000 : 3000);
    };
    tick();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [code, creds.pid, setRoom]);

  const act = useCallback(
    async (intent: Intent) => {
      const data = await call<{ room: PublicRoom }>({
        method: 'POST',
        body: JSON.stringify({ op: 'act', code, pid: creds.pid, token: creds.token, intent }),
      });
      setRoom(data.room);
      return data.room;
    },
    [code, creds.pid, creds.token, setRoom],
  );

  return { room, error, offline, act, store };
}
