import { Redis } from '@upstash/redis';
import { ROOM_LIFETIME_MS } from '../../shared/engine.js';

const HISTORY = 25;
/** How long we remember that a table was closed by its host (to tell players why it vanished). */
const TOMBSTONE_TTL = 60 * 60 * 6;

/** Unix time (seconds) at which a room created at `createdAt` (ms) is deleted. */
export const expiryOf = (createdAt: number) => Math.floor((createdAt + ROOM_LIFETIME_MS) / 1000);

export interface Store {
  kind: 'redis' | 'memory';
  get(code: string): Promise<{ state: string; version: number; history: number } | null>;
  version(code: string): Promise<number>;
  history(code: string): Promise<string | null>;
  /**
   * Compare-and-set. Every key of the room is set to expire at `expireAt` (unix seconds).
   * Returns the new version, or -1 on conflict.
   */
  cas(code: string, expected: number, state: string, prev: string | null, expireAt: number, undo?: boolean): Promise<number>;
  /** Deletes every key of the room and leaves a short-lived "closed" marker. */
  close(code: string): Promise<void>;
  wasClosed(code: string): Promise<boolean>;
}

/** Every key is namespaced so the database can be shared with other projects safely. */
const PREFIX = 'pokercomp:room:';
const k = (code: string) => ({
  s: `${PREFIX}${code}:s`,
  v: `${PREFIX}${code}:v`,
  h: `${PREFIX}${code}:h`,
  x: `${PREFIX}${code}:closed`,
});

const CAS_LUA = `
local v = redis.call('GET', KEYS[2]) or '0'
if v ~= ARGV[1] then return -1 end
if ARGV[5] == '1' then
  redis.call('LPOP', KEYS[3])
elseif ARGV[3] ~= '' then
  redis.call('LPUSH', KEYS[3], ARGV[3])
  redis.call('LTRIM', KEYS[3], 0, ${HISTORY - 1})
end
redis.call('SET', KEYS[1], ARGV[2])
local nv = redis.call('INCR', KEYS[2])
redis.call('EXPIREAT', KEYS[1], ARGV[4])
redis.call('EXPIREAT', KEYS[2], ARGV[4])
redis.call('EXPIREAT', KEYS[3], ARGV[4])
return nv
`;

class RedisStore implements Store {
  kind = 'redis' as const;
  constructor(private r: Redis) {}
  async get(code: string) {
    const key = k(code);
    const p = this.r.pipeline();
    p.get(key.s);
    p.get(key.v);
    p.llen(key.h);
    const [state, v, h] = (await p.exec()) as [string | null, string | null, number];
    if (!state) return null;
    return { state, version: Number(v ?? 0), history: Number(h ?? 0) };
  }
  async version(code: string) {
    const v = await this.r.get<string>(k(code).v);
    return Number(v ?? 0);
  }
  async history(code: string) {
    return (await this.r.lindex(k(code).h, 0)) as string | null;
  }
  async cas(code: string, expected: number, state: string, prev: string | null, expireAt: number, undo = false) {
    const key = k(code);
    const res = await this.r.eval(
      CAS_LUA,
      [key.s, key.v, key.h],
      [String(expected), state, prev ?? '', String(expireAt), undo ? '1' : '0'],
    );
    return Number(res);
  }
  async close(code: string) {
    const key = k(code);
    const p = this.r.pipeline();
    p.del(key.s, key.v, key.h);
    p.set(key.x, '1', { ex: TOMBSTONE_TTL });
    await p.exec();
  }
  async wasClosed(code: string) {
    return !!(await this.r.get(k(code).x));
  }
}

/** Dev / fallback store. Not shared between serverless instances! */
class MemoryStore implements Store {
  kind = 'memory' as const;
  private m = new Map<string, { state: string; version: number; history: string[]; expireAt: number }>();
  private closed = new Map<string, number>();
  private live(code: string) {
    const e = this.m.get(code);
    if (e && e.expireAt * 1000 <= Date.now()) {
      this.m.delete(code);
      return undefined;
    }
    return e;
  }
  async get(code: string) {
    const e = this.live(code);
    return e ? { state: e.state, version: e.version, history: e.history.length } : null;
  }
  async version(code: string) {
    return this.live(code)?.version ?? 0;
  }
  async history(code: string) {
    return this.live(code)?.history[0] ?? null;
  }
  async cas(code: string, expected: number, state: string, prev: string | null, expireAt: number, undo = false) {
    const e = this.live(code) ?? { state: '', version: 0, history: [], expireAt };
    if (e.version !== expected) return -1;
    if (undo) e.history.shift();
    else if (prev) {
      e.history.unshift(prev);
      e.history.length = Math.min(e.history.length, HISTORY);
    }
    e.state = state;
    e.version += 1;
    e.expireAt = expireAt;
    this.m.set(code, e);
    return e.version;
  }
  async close(code: string) {
    this.m.delete(code);
    this.closed.set(code, Date.now() + TOMBSTONE_TTL * 1000);
  }
  async wasClosed(code: string) {
    return (this.closed.get(code) ?? 0) > Date.now();
  }
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const env = process.env;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  store =
    url && token
      ? new RedisStore(new Redis({ url, token, automaticDeserialization: false }))
      : new MemoryStore();
  return store;
}
