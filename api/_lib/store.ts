import { Redis } from '@upstash/redis';

/** Rooms expire after 24h of inactivity. */
export const TTL = 60 * 60 * 24;
const HISTORY = 25;

export interface Store {
  kind: 'redis' | 'memory';
  get(code: string): Promise<{ state: string; version: number; history: number } | null>;
  version(code: string): Promise<number>;
  history(code: string): Promise<string | null>;
  /** Compare-and-set. Returns the new version, or -1 on conflict. */
  cas(code: string, expected: number, state: string, prev: string | null, undo?: boolean): Promise<number>;
}

const k = (code: string) => ({ s: `room:${code}:s`, v: `room:${code}:v`, h: `room:${code}:h` });

const CAS_LUA = `
local v = redis.call('GET', KEYS[2]) or '0'
if v ~= ARGV[1] then return -1 end
if ARGV[5] == '1' then
  redis.call('LPOP', KEYS[3])
elseif ARGV[3] ~= '' then
  redis.call('LPUSH', KEYS[3], ARGV[3])
  redis.call('LTRIM', KEYS[3], 0, ${HISTORY - 1})
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
local nv = redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[3], ARGV[4])
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
  async cas(code: string, expected: number, state: string, prev: string | null, undo = false) {
    const key = k(code);
    const res = await this.r.eval(
      CAS_LUA,
      [key.s, key.v, key.h],
      [String(expected), state, prev ?? '', String(TTL), undo ? '1' : '0'],
    );
    return Number(res);
  }
}

/** Dev / fallback store. Not shared between serverless instances! */
class MemoryStore implements Store {
  kind = 'memory' as const;
  private m = new Map<string, { state: string; version: number; history: string[] }>();
  async get(code: string) {
    const e = this.m.get(code);
    return e ? { state: e.state, version: e.version, history: e.history.length } : null;
  }
  async version(code: string) {
    return this.m.get(code)?.version ?? 0;
  }
  async history(code: string) {
    return this.m.get(code)?.history[0] ?? null;
  }
  async cas(code: string, expected: number, state: string, prev: string | null, undo = false) {
    const e = this.m.get(code) ?? { state: '', version: 0, history: [] };
    if (e.version !== expected) return -1;
    if (undo) e.history.shift();
    else if (prev) {
      e.history.unshift(prev);
      e.history.length = Math.min(e.history.length, HISTORY);
    }
    e.state = state;
    e.version += 1;
    this.m.set(code, e);
    return e.version;
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
