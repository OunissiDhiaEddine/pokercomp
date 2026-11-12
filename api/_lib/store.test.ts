import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOM_LIFETIME_MS } from '../../shared/engine.js';
import { expiryOf, getStore } from './store.js';

describe('store (memory)', () => {
  afterEach(() => vi.useRealTimers());

  it('deletes a table 24h after creation, even if it is still being used', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-11-12T20:00:00Z').getTime();
    vi.setSystemTime(t0);
    const s = getStore();
    const exp = expiryOf(t0);
    expect(exp * 1000 - t0).toBe(ROOM_LIFETIME_MS);
    expect(await s.cas('EXP1', 0, '{"a":1}', null, exp)).toBe(1);
    // activity 23h later does not extend the lifetime
    vi.setSystemTime(t0 + 23 * 3600e3);
    expect(await s.cas('EXP1', 1, '{"a":2}', null, exp)).toBe(2);
    expect(await s.get('EXP1')).not.toBeNull();
    vi.setSystemTime(t0 + ROOM_LIFETIME_MS + 1000);
    expect(await s.get('EXP1')).toBeNull();
    expect(await s.version('EXP1')).toBe(0);
    expect(await s.wasClosed('EXP1')).toBe(false);
  });

  it('close() removes the table and marks it as closed', async () => {
    const s = getStore();
    await s.cas('CLS1', 0, '{}', null, expiryOf(Date.now()));
    await s.close('CLS1');
    expect(await s.get('CLS1')).toBeNull();
    expect(await s.wasClosed('CLS1')).toBe(true);
  });
});
