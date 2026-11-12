import { describe, expect, it } from 'vitest';
import { addPlayer, applyIntent, computePots, createRoom, totalPot } from './engine.js';
import type { Intent, StoredRoom } from './types.js';

function setup(n: number, stack = 1000, sb = 10, bb = 20) {
  const r = createRoom('TEST', 'p0', 'P0', 't0', { sb, bb, startingStack: stack });
  for (let i = 1; i < n; i++) addPlayer(r, `p${i}`, `P${i}`, `t${i}`);
  return r;
}
const act = (r: StoredRoom, who: string, intent: Intent) => applyIntent(r, who, intent);
const host = (r: StoredRoom, intent: Intent) => applyIntent(r, r.hostId, intent);
const chips = (r: StoredRoom) => r.players.reduce((s, p) => s + p.stack + p.contributed, 0);
const P = (r: StoredRoom, id: string) => r.players.find((p) => p.id === id)!;

describe('engine', () => {
  it('posts blinds and sets first actor (3 players)', () => {
    const r = setup(3);
    host(r, { type: 'start_hand' });
    expect(r.dealerId).toBe('p0');
    expect(r.sbId).toBe('p1');
    expect(r.bbId).toBe('p2');
    expect(r.toAct).toBe('p0');
    expect(P(r, 'p1').bet).toBe(10);
    expect(P(r, 'p2').bet).toBe(20);
    expect(r.currentBet).toBe(20);
  });

  it('heads-up: dealer is SB and acts first preflop, last postflop', () => {
    const r = setup(2);
    host(r, { type: 'start_hand' });
    expect(r.dealerId).toBe('p0');
    expect(r.sbId).toBe('p0');
    expect(r.toAct).toBe('p0');
    act(r, 'p0', { type: 'call' });
    expect(r.toAct).toBe('p1'); // BB option
    act(r, 'p1', { type: 'check' });
    expect(r.awaitingDeal).toBe(true);
    host(r, { type: 'deal_next' });
    expect(r.street).toBe('flop');
    expect(r.toAct).toBe('p1');
  });

  it('gives the big blind the option and plays to showdown', () => {
    const r = setup(3);
    host(r, { type: 'start_hand' });
    act(r, 'p0', { type: 'call' });
    act(r, 'p1', { type: 'call' });
    expect(r.toAct).toBe('p2');
    act(r, 'p2', { type: 'check' });
    expect(r.awaitingDeal).toBe(true);
    expect(totalPot(r)).toBe(60);
    for (const s of ['flop', 'turn', 'river']) {
      host(r, { type: 'deal_next' });
      expect(r.street).toBe(s);
      expect(r.toAct).toBe('p1');
      act(r, 'p1', { type: 'check' });
      act(r, 'p2', { type: 'check' });
      act(r, 'p0', { type: 'check' });
    }
    expect(r.street).toBe('showdown');
    host(r, { type: 'award', winners: [['p2']] });
    expect(r.street).toBe('complete');
    expect(P(r, 'p2').stack).toBe(1040);
    expect(chips(r)).toBe(3000);
  });

  it('awards the pot when everyone folds', () => {
    const r = setup(3);
    host(r, { type: 'start_hand' });
    act(r, 'p0', { type: 'raise', to: 60 });
    act(r, 'p1', { type: 'fold' });
    act(r, 'p2', { type: 'fold' });
    expect(r.street).toBe('complete');
    expect(P(r, 'p0').stack).toBe(1030);
    expect(chips(r)).toBe(3000);
  });

  it('enforces min raise and re-opens action', () => {
    const r = setup(3);
    host(r, { type: 'start_hand' });
    expect(() => act(r, 'p0', { type: 'raise', to: 30 })).toThrow('min_raise');
    act(r, 'p0', { type: 'raise', to: 60 });
    expect(r.minRaise).toBe(40);
    expect(() => act(r, 'p1', { type: 'raise', to: 90 })).toThrow('min_raise');
    act(r, 'p1', { type: 'raise', to: 100 });
    act(r, 'p2', { type: 'fold' });
    expect(r.toAct).toBe('p0');
    act(r, 'p0', { type: 'call' });
    expect(r.awaitingDeal).toBe(true);
  });

  it('rejects out of turn actions and non-host commands', () => {
    const r = setup(3);
    host(r, { type: 'start_hand' });
    expect(() => act(r, 'p1', { type: 'call' })).toThrow('not_your_turn');
    expect(() => act(r, 'p1', { type: 'deal_next' })).toThrow('host_only');
    expect(() => act(r, 'p1', { type: 'call', as: 'p0' })).toThrow('host_only');
    host(r, { type: 'call', as: 'p0' });
    expect(r.toAct).toBe('p1');
  });

  it('builds side pots with all-ins', () => {
    const r = setup(3);
    P(r, 'p0').stack = 100;
    P(r, 'p1').stack = 300;
    P(r, 'p2').stack = 1000;
    host(r, { type: 'start_hand' });
    act(r, 'p0', { type: 'allin' });
    act(r, 'p1', { type: 'allin' });
    act(r, 'p2', { type: 'call' });
    // all-in run-out: host deals remaining streets
    expect(r.awaitingDeal).toBe(true);
    host(r, { type: 'deal_next' });
    host(r, { type: 'deal_next' });
    host(r, { type: 'deal_next' });
    expect(r.street).toBe('showdown');
    const pots = computePots(r.players);
    expect(pots.map((p) => p.amount)).toEqual([300, 400]);
    expect(pots[0].eligible.sort()).toEqual(['p0', 'p1', 'p2']);
    expect(pots[1].eligible.sort()).toEqual(['p1', 'p2']);
    host(r, { type: 'award', winners: [['p0'], ['p2']] });
    expect(P(r, 'p0').stack).toBe(300);
    expect(P(r, 'p2').stack).toBe(700 + 400);
    expect(chips(r)).toBe(1400);
  });

  it('returns uncalled chips automatically', () => {
    const r = setup(2);
    P(r, 'p1').stack = 50;
    host(r, { type: 'start_hand' });
    act(r, 'p0', { type: 'allin' });
    act(r, 'p1', { type: 'call' });
    expect(r.awaitingDeal).toBe(true);
    host(r, { type: 'deal_next' });
    host(r, { type: 'deal_next' });
    host(r, { type: 'deal_next' });
    expect(r.street).toBe('showdown');
    const pots = computePots(r.players);
    expect(pots).toEqual([
      { amount: 100, eligible: ['p0', 'p1'] },
      { amount: 950, eligible: ['p0'] },
    ]);
    host(r, { type: 'award', winners: [['p1'], ['p0']] });
    expect(P(r, 'p1').stack).toBe(100);
    expect(P(r, 'p0').stack).toBe(950);
  });

  it('splits pots with odd chips', () => {
    const r = setup(3, 1000, 5, 15);
    host(r, { type: 'start_hand' });
    act(r, 'p0', { type: 'fold' });
    act(r, 'p1', { type: 'call' });
    act(r, 'p2', { type: 'raise', to: 36 });
    act(r, 'p1', { type: 'call' });
    host(r, { type: 'deal_next' });
    act(r, 'p1', { type: 'check' });
    act(r, 'p2', { type: 'raise', to: 1 * 15 });
    act(r, 'p1', { type: 'call' });
    host(r, { type: 'deal_next' });
    act(r, 'p1', { type: 'check' });
    act(r, 'p2', { type: 'check' });
    host(r, { type: 'deal_next' });
    act(r, 'p1', { type: 'check' });
    act(r, 'p2', { type: 'check' });
    const pot = totalPot(r);
    expect(pot).toBe(36 * 2 + 30);
    host(r, { type: 'award', winners: [['p1', 'p2']] });
    expect(chips(r)).toBe(3000);
  });

  it('short all-in does not reopen raising for players who acted', () => {
    const r = setup(3);
    P(r, 'p2').stack = 1000;
    P(r, 'p1').stack = 70; // SB with 70 total
    host(r, { type: 'start_hand' });
    act(r, 'p0', { type: 'raise', to: 60 }); // raise of 40
    act(r, 'p1', { type: 'allin' }); // to 70: short raise of 10
    expect(r.currentBet).toBe(70);
    act(r, 'p2', { type: 'call' });
    expect(r.toAct).toBe('p0');
    expect(() => act(r, 'p0', { type: 'raise', to: 200 })).toThrow('cannot_raise');
    act(r, 'p0', { type: 'call' });
    expect(r.awaitingDeal).toBe(true);
  });

  it('skips sitting out and busted players, rotates dealer', () => {
    const r = setup(4);
    P(r, 'p3').sittingOut = true;
    host(r, { type: 'start_hand' });
    expect(P(r, 'p3').inHand).toBe(false);
    host(r, { type: 'end_hand' });
    expect(chips(r)).toBe(4000);
    host(r, { type: 'start_hand' });
    expect(r.dealerId).toBe('p1');
    expect(r.sbId).toBe('p2');
    expect(r.bbId).toBe('p0');
  });
});
