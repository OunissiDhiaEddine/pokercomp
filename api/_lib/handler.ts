import { addPlayer, applyIntent, cleanName, createRoom, GameError, toPublic } from '../../shared/engine.js';
import type { Intent, StoredRoom } from '../../shared/types.js';
import { expiryOf, getStore } from './store.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{4,6}$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const err = (code: string, status = 400) => json({ error: code }, status);

const rand = (n: number, chars = CODE_CHARS) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};
const newId = () => rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789');
const newToken = () => crypto.randomUUID().replace(/-/g, '');

function normCode(c: unknown) {
  const code = String(c ?? '').toUpperCase().trim();
  if (!CODE_RE.test(code)) throw new GameError('bad_code');
  return code;
}

async function load(code: string) {
  const got = await getStore().get(code);
  if (!got) throw new GameError((await getStore().wasClosed(code)) ? 'room_closed' : 'room_not_found');
  return { room: JSON.parse(got.state) as StoredRoom, version: got.version, history: got.history };
}

/** Read-modify-write with optimistic concurrency. */
async function mutate(
  code: string,
  fn: (room: StoredRoom) => { undoable: boolean } | void,
): Promise<{ room: StoredRoom; version: number; history: number }> {
  const store = getStore();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { room, version, history } = await load(code);
    const before = JSON.stringify(room);
    const res = fn(room);
    room.updatedAt = Date.now();
    const undoable = !!res && res.undoable;
    const nv = await store.cas(code, version, JSON.stringify(room), undoable ? before : null, expiryOf(room.createdAt));
    if (nv > 0) return { room, version: nv, history: history + (undoable ? 1 : 0) };
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new GameError('busy');
}

async function undo(code: string) {
  const store = getStore();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { room: cur, version, history } = await load(code);
    const prevRaw = await store.history(code);
    if (!prevRaw) throw new GameError('nothing_to_undo');
    const prev = JSON.parse(prevRaw) as StoredRoom;
    // Keep things that undo shouldn't touch: who's here, names, host, settings
    for (const p of cur.players) {
      const old = prev.players.find((o) => o.id === p.id);
      if (old) {
        old.name = p.name;
        old.avatar = p.avatar;
        old.sittingOut = p.sittingOut;
      } else {
        prev.players.push({ ...p, inHand: false, bet: 0, contributed: 0, folded: false, allIn: false });
      }
    }
    prev.players = prev.players.filter((p) => cur.secrets[p.id]);
    prev.secrets = cur.secrets;
    prev.hostId = cur.hostId;
    prev.settings = cur.settings;
    prev.log = [...cur.log, { t: Date.now(), k: 'undo' }].slice(-40);
    prev.eventSeq = cur.eventSeq + 1;
    prev.events = [];
    prev.updatedAt = Date.now();
    const nv = await store.cas(code, version, JSON.stringify(prev), null, expiryOf(cur.createdAt), true);
    if (nv > 0) return { room: prev, version: nv, history: history - 1 };
  }
  throw new GameError('busy');
}

function auth(room: StoredRoom, pid: unknown, token: unknown) {
  const id = String(pid ?? '');
  if (!id || !room.secrets[id] || room.secrets[id] !== token) throw new GameError('not_in_room');
  return id;
}

const pub = (r: { room: StoredRoom; version: number; history: number }, pid?: string) =>
  toPublic(r.room, r.version, pid === r.room.hostId && r.history > 0);

export async function handle(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      if (url.searchParams.has('health')) return json({ ok: true, store: getStore().kind });
      const code = normCode(url.searchParams.get('code'));
      const known = Number(url.searchParams.get('v') ?? -1);
      const store = getStore();
      if (known > 0) {
        const v = await store.version(code);
        if (v === 0) return (await store.wasClosed(code)) ? err('room_closed', 410) : err('room_not_found', 404);
        if (v === known) return json({ same: true, version: v });
      }
      const r = await load(code);
      return json({ room: pub(r, url.searchParams.get('pid') ?? undefined), store: store.kind });
    }

    if (req.method !== 'POST') return err('method', 405);
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body || typeof body !== 'object') return err('bad_request');
    const store = getStore();

    switch (body.op) {
      case 'create': {
        const name = cleanName(body.name);
        const pid = newId();
        const token = newToken();
        for (let i = 0; i < 6; i++) {
          const code = rand(5);
          const room = createRoom(code, pid, name, token, body.settings ?? {});
          const v = await store.cas(code, 0, JSON.stringify(room), null, expiryOf(room.createdAt));
          if (v > 0) return json({ room: toPublic(room, v), me: { pid, token }, store: store.kind });
        }
        throw new GameError('busy');
      }
      case 'join': {
        const code = normCode(body.code);
        // Rejoin with existing credentials
        if (body.pid && body.token) {
          const r = await load(code);
          if (r.room.secrets[body.pid] === body.token)
            return json({ room: pub(r, body.pid), me: { pid: body.pid, token: body.token } });
        }
        const name = cleanName(body.name);
        const pid = newId();
        const token = newToken();
        const r = await mutate(code, (room) => {
          addPlayer(room, pid, name, token);
        });
        return json({ room: pub(r, pid), me: { pid, token }, store: store.kind });
      }
      case 'act': {
        const code = normCode(body.code);
        const intent = body.intent as Intent;
        if (!intent || typeof intent.type !== 'string') return err('bad_action');
        let pid = '';
        if (intent.type === 'undo') {
          const { room } = await load(code);
          pid = auth(room, body.pid, body.token);
          if (room.hostId !== pid) throw new GameError('host_only');
          return json({ room: pub(await undo(code), pid) });
        }
        const r = await mutate(code, (room) => {
          pid = auth(room, body.pid, body.token);
          return { undoable: applyIntent(room, pid, intent) };
        });
        return json({ room: pub(r, pid) });
      }
      case 'close': {
        const code = normCode(body.code);
        const { room } = await load(code);
        const pid = auth(room, body.pid, body.token);
        if (room.hostId !== pid) throw new GameError('host_only');
        await store.close(code);
        return json({ ok: true });
      }
      case 'leave': {
        const code = normCode(body.code);
        const left = await mutate(code, (room) => {
          const pid = auth(room, body.pid, body.token);
          const p = room.players.find((x) => x.id === pid)!;
          if (room.street !== 'lobby' && room.street !== 'complete' && p.inHand)
            throw new GameError('in_hand');
          room.players = room.players.filter((x) => x.id !== pid);
          delete room.secrets[pid];
          if (room.hostId === pid && room.players[0]) room.hostId = room.players[0].id;
          if (room.dealerId === pid) room.dealerId = null;
        });
        // Last one out: delete the table right away
        if (left.room.players.length === 0) await store.close(code);
        return json({ ok: true });
      }
      default:
        return err('bad_request');
    }
  } catch (e) {
    if (e instanceof GameError)
      return err(e.code, e.code === 'room_not_found' ? 404 : e.code === 'room_closed' ? 410 : 400);
    console.error(e);
    return err('server_error', 500);
  }
}
