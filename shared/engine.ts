import type {
  ActionType,
  HandResult,
  Intent,
  Player,
  Pot,
  PotResult,
  Room,
  Settings,
  StoredRoom,
  Street,
} from './types.js';

export class GameError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const fail = (code: string): never => {
  throw new GameError(code);
};

export const MAX_PLAYERS = 10;
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
const BOARD_COUNT: Record<Street, number> = {
  lobby: 0,
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
  complete: 5,
};

export const boardCount = (r: Room) =>
  r.street === 'complete' ? (r.lastResult ? BOARD_COUNT[r.lastStreet ?? 'preflop'] : 0) : BOARD_COUNT[r.street];

/* ------------------------------------------------------------------ helpers */

export const canAct = (p: Player) => p.inHand && !p.folded && !p.allIn;
export const live = (p: Player) => p.inHand && !p.folded;
const needsAction = (p: Player, r: Room) => canAct(p) && (!p.acted || p.bet < r.currentBet);
const eligible = (p: Player) => !p.sittingOut && p.stack > 0;

function nextFrom(r: Room, fromId: string | null, pred: (p: Player) => boolean): Player | null {
  const n = r.players.length;
  if (!n) return null;
  let start = fromId ? r.players.findIndex((p) => p.id === fromId) : -1;
  for (let i = 1; i <= n; i++) {
    const p = r.players[(start + i + n) % n];
    if (pred(p)) return p;
  }
  return null;
}

export const findPlayer = (r: Room, id: string | null | undefined) =>
  id ? r.players.find((p) => p.id === id) ?? null : null;

const mustPlayer = (r: Room, id: string) => findPlayer(r, id) ?? fail('no_player');

export const totalPot = (r: Room) => r.players.reduce((s, p) => s + p.contributed, 0);

function log(r: Room, k: string, p?: Player | null, a?: number, s?: string) {
  r.log.push({ t: Date.now(), k, p: p?.name, a, s });
  if (r.log.length > 40) r.log.splice(0, r.log.length - 40);
}

function event(r: Room, k: Room['events'][number]['k'], pid?: string, a?: number) {
  r.eventSeq += 1;
  r.events.push({ id: r.eventSeq, k, pid, a });
  if (r.events.length > 20) r.events.splice(0, r.events.length - 20);
}

/* -------------------------------------------------------------------- pots */

/** Splits the chips contributed this hand into a main pot and side pots. */
export function computePots(players: Player[]): Pot[] {
  const contribs = players.filter((p) => p.contributed > 0);
  if (!contribs.length) return [];
  const levels = [...new Set(players.filter(live).map((p) => p.contributed))]
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of contribs) amount += Math.max(0, Math.min(p.contributed, level) - prev);
    const elig = players.filter((p) => live(p) && p.contributed >= level).map((p) => p.id);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === elig.length && last.eligible.every((id) => elig.includes(id))) {
      last.amount += amount;
    } else if (amount > 0) {
      pots.push({ amount, eligible: elig });
    }
    prev = level;
  }
  // Chips from folded players above the highest live level go to the last pot
  const top = levels[levels.length - 1] ?? 0;
  let extra = 0;
  for (const p of contribs) extra += Math.max(0, p.contributed - Math.max(top, prev));
  if (extra && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}

/* --------------------------------------------------------------- lifecycle */

const AVATARS = 12;

export function createRoom(code: string, hostId: string, hostName: string, token: string, settings: Settings): StoredRoom {
  const now = Date.now();
  const room: StoredRoom = {
    code,
    createdAt: now,
    updatedAt: now,
    hostId,
    settings: sanitizeSettings(settings),
    players: [],
    handNo: 0,
    dealerId: null,
    sbId: null,
    bbId: null,
    street: 'lobby',
    awaitingDeal: false,
    toAct: null,
    currentBet: 0,
    minRaise: 0,
    board: [null, null, null, null, null],
    lastResult: null,
    log: [],
    events: [],
    eventSeq: 0,
    secrets: {},
  };
  addPlayer(room, hostId, hostName, token);
  return room;
}

function sanitizeSettings(s: Partial<Settings>): Settings {
  const int = (v: unknown, d: number, min: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= min ? Math.min(n, 1e9) : d;
  };
  const bb = int(s.bb, 20, 1);
  const sb = Math.min(int(s.sb, Math.max(1, Math.floor(bb / 2)), 0), bb);
  return { sb, bb, startingStack: int(s.startingStack, bb * 100, 1) };
}

export function cleanName(name: unknown) {
  const n = String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
  return n || fail('bad_name');
}

export function addPlayer(room: StoredRoom, id: string, name: string, token: string) {
  if (room.players.length >= MAX_PLAYERS) fail('room_full');
  const clean = cleanName(name);
  const used = new Set(room.players.map((p) => p.avatar));
  let avatar = 0;
  while (used.has(avatar) && avatar < AVATARS) avatar++;
  room.players.push({
    id,
    name: clean,
    avatar: avatar % AVATARS,
    stack: room.settings.startingStack,
    bet: 0,
    contributed: 0,
    folded: false,
    allIn: false,
    inHand: false,
    sittingOut: false,
    acted: false,
    lastActLevel: -1,
    lastAction: null,
    joinedAt: Date.now(),
  });
  room.secrets[id] = token;
  log(room, 'joined', room.players[room.players.length - 1]);
}

export const handInProgress = (r: Room) => r.street !== 'lobby' && r.street !== 'complete';

function post(r: Room, p: Player, amount: number, kind: 'sb' | 'bb') {
  const amt = Math.min(p.stack, amount);
  p.stack -= amt;
  p.bet += amt;
  p.contributed += amt;
  if (p.stack === 0) p.allIn = true;
  p.lastAction = { type: kind, amount: amt };
  if (amt) event(r, 'bet', p.id, amt);
}

export function startHand(r: Room) {
  if (handInProgress(r)) fail('hand_in_progress');
  const elig = r.players.filter(eligible);
  if (elig.length < 2) fail('need_two_players');

  for (const p of r.players) {
    p.bet = 0;
    p.contributed = 0;
    p.folded = false;
    p.allIn = false;
    p.acted = false;
    p.lastActLevel = -1;
    p.lastAction = null;
    p.inHand = eligible(p);
  }
  const dealer = nextFrom(r, findPlayer(r, r.dealerId) ? r.dealerId : null, (p) => p.inHand)!;
  r.dealerId = dealer.id;
  let sb: Player, bb: Player;
  if (elig.length === 2) {
    sb = dealer;
    bb = nextFrom(r, dealer.id, (p) => p.inHand)!;
  } else {
    sb = nextFrom(r, dealer.id, (p) => p.inHand)!;
    bb = nextFrom(r, sb.id, (p) => p.inHand)!;
  }
  r.sbId = sb.id;
  r.bbId = bb.id;
  r.handNo += 1;
  r.street = 'preflop';
  r.lastStreet = 'preflop';
  r.awaitingDeal = false;
  r.board = [null, null, null, null, null];
  r.lastResult = null;
  event(r, 'start');
  log(r, 'hand_start', dealer, r.handNo);
  post(r, sb, r.settings.sb, 'sb');
  post(r, bb, r.settings.bb, 'bb');
  r.currentBet = Math.max(r.settings.bb, sb.bet, bb.bet);
  r.minRaise = r.settings.bb;
  r.toAct = null;
  advance(r, bb.id);
}

/** After an action by `lastId`: find next actor, or close the betting round. */
function advance(r: Room, lastId: string) {
  const liveP = r.players.filter(live);
  if (liveP.length === 1) {
    finishUncontested(r, liveP[0]);
    return;
  }
  const actors = r.players.filter(canAct);
  const onlyOneCovered = actors.length === 1 && actors[0].bet >= r.currentBet;
  const next = actors.length === 0 || onlyOneCovered ? null : nextFrom(r, lastId, (p) => needsAction(p, r));
  if (next) {
    r.toAct = next.id;
    return;
  }
  closeRound(r);
}

function collectBets(r: Room) {
  for (const p of r.players) {
    p.bet = 0;
    p.acted = false;
    p.lastActLevel = -1;
  }
  r.currentBet = 0;
  r.minRaise = r.settings.bb;
}

function closeRound(r: Room) {
  r.toAct = null;
  collectBets(r);
  if (r.street === 'river') {
    r.street = 'showdown';
    r.awaitingDeal = false;
    log(r, 'showdown');
    autoAwardIfTrivial(r);
  } else {
    r.awaitingDeal = true;
  }
}

/** If every pot has exactly one eligible player there's nothing to decide. */
function autoAwardIfTrivial(r: Room) {
  const pots = computePots(r.players);
  if (pots.every((p) => p.eligible.length === 1)) {
    award(r, pots.map((p) => p.eligible));
  }
}

function finishUncontested(r: Room, winner: Player) {
  collectBets(r);
  const amount = totalPot(r);
  const result: HandResult = {
    handNo: r.handNo,
    pots: [{ amount, winners: [winner.id], shares: { [winner.id]: amount } }],
    uncontested: true,
  };
  winner.stack += amount;
  endHand(r, result);
  event(r, 'win', winner.id, amount);
  log(r, 'wins', winner, amount);
}

function endHand(r: Room, result: HandResult | null) {
  r.lastStreet = r.street === 'complete' ? r.lastStreet : r.street;
  r.street = 'complete';
  r.toAct = null;
  r.awaitingDeal = false;
  r.lastResult = result;
  for (const p of r.players) {
    p.contributed = 0;
    p.bet = 0;
    p.acted = false;
  }
}

export function dealNext(r: Room) {
  if (!handInProgress(r) || r.street === 'showdown') fail('cannot_deal');
  if (!r.awaitingDeal) fail('betting_not_done');
  const idx = STREETS.indexOf(r.street);
  r.street = STREETS[idx + 1];
  r.lastStreet = r.street;
  r.awaitingDeal = false;
  event(r, 'deal');
  for (const p of r.players) if (!p.folded && !p.allIn) p.lastAction = null;
  log(r, 'deal', null, undefined, r.street);
  const actors = r.players.filter(canAct);
  if (actors.length < 2) {
    // Everyone (or all but one) is all-in: just run out the board
    closeRound(r);
    return;
  }
  const first = nextFrom(r, r.dealerId, (p) => needsAction(p, r));
  r.toAct = first?.id ?? null;
  if (!first) closeRound(r);
}

export function award(r: Room, winners: string[][]) {
  if (r.street !== 'showdown') fail('not_showdown');
  const pots = computePots(r.players);
  if (!Array.isArray(winners) || winners.length !== pots.length) fail('bad_winners');
  const results: PotResult[] = [];
  const dealerIdx = Math.max(0, r.players.findIndex((p) => p.id === r.dealerId));
  const order = (id: string) => {
    const i = r.players.findIndex((p) => p.id === id);
    return (i - dealerIdx - 1 + r.players.length) % r.players.length;
  };
  pots.forEach((pot, i) => {
    const w = [...new Set(winners[i])].filter((id) => pot.eligible.includes(id));
    if (!w.length) fail('bad_winners');
    w.sort((a, b) => order(a) - order(b));
    const share = Math.floor(pot.amount / w.length);
    let rem = pot.amount - share * w.length;
    const shares: Record<string, number> = {};
    for (const id of w) {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      shares[id] = share + extra;
    }
    results.push({ amount: pot.amount, winners: w, shares });
  });
  const totals: Record<string, number> = {};
  for (const res of results)
    for (const [id, amt] of Object.entries(res.shares)) totals[id] = (totals[id] ?? 0) + amt;
  for (const [id, amt] of Object.entries(totals)) {
    const p = mustPlayer(r, id);
    p.stack += amt;
  }
  endHand(r, { handNo: r.handNo, pots: results, uncontested: false });
  for (const [id, amt] of Object.entries(totals)) {
    event(r, 'win', id, amt);
    log(r, 'wins', findPlayer(r, id), amt);
  }
}

/* ------------------------------------------------------------ player moves */

export function canRaise(r: Room, p: Player) {
  if (!canAct(p)) return false;
  if (p.stack + p.bet <= r.currentBet) return false;
  const others = r.players.filter((o) => o.id !== p.id && canAct(o));
  if (!others.length) return false;
  return p.lastActLevel < 0 || r.currentBet - p.lastActLevel >= r.minRaise;
}

export function minRaiseTo(r: Room, p: Player) {
  const min = r.currentBet === 0 ? r.settings.bb : r.currentBet + r.minRaise;
  return Math.min(min, p.stack + p.bet);
}

export function playerAct(r: Room, p: Player, type: ActionType, to?: number) {
  if (!handInProgress(r) || r.awaitingDeal || r.street === 'showdown') fail('no_betting');
  if (r.toAct !== p.id) fail('not_your_turn');
  const owe = r.currentBet - p.bet;
  const putIn = (amt: number) => {
    p.stack -= amt;
    p.bet += amt;
    p.contributed += amt;
    if (p.stack === 0) p.allIn = true;
    if (amt) event(r, 'bet', p.id, amt);
  };

  if (type === 'allin') {
    const max = p.stack + p.bet;
    if (max > r.currentBet && canRaise(r, p)) {
      type = 'raise';
      to = max;
    } else {
      type = owe > 0 ? 'call' : 'check';
    }
  }

  switch (type) {
    case 'fold':
      p.folded = true;
      p.lastAction = { type: 'fold', amount: 0 };
      event(r, 'fold', p.id);
      log(r, 'fold', p);
      break;
    case 'check':
      if (owe > 0) fail('cannot_check');
      p.lastAction = { type: 'check', amount: 0 };
      log(r, 'check', p);
      break;
    case 'call': {
      if (owe <= 0) fail('nothing_to_call');
      const amt = Math.min(owe, p.stack);
      putIn(amt);
      p.lastAction = { type: p.allIn ? 'allin' : 'call', amount: p.bet };
      log(r, p.allIn ? 'allin' : 'call', p, p.bet);
      break;
    }
    case 'raise': {
      const target = Math.floor(Number(to));
      if (!Number.isFinite(target)) fail('bad_amount');
      if (!canRaise(r, p)) fail('cannot_raise');
      const max = p.stack + p.bet;
      if (target > max) fail('not_enough_chips');
      if (target <= r.currentBet) fail('bad_amount');
      const isAllIn = target === max;
      const increment = target - r.currentBet;
      if (target < minRaiseTo(r, p) && !isAllIn) fail('min_raise');
      const wasBet = r.currentBet === 0;
      putIn(target - p.bet);
      if (increment >= r.minRaise || wasBet) r.minRaise = Math.max(r.minRaise, increment);
      r.currentBet = target;
      for (const o of r.players) if (o.id !== p.id && canAct(o)) o.acted = false;
      p.lastAction = { type: isAllIn ? 'allin' : 'raise', amount: target };
      log(r, isAllIn ? 'allin' : wasBet ? 'bet' : 'raise', p, target);
      break;
    }
    default:
      fail('bad_action');
  }
  p.acted = true;
  p.lastActLevel = r.currentBet;
  advance(r, p.id);
}

/* --------------------------------------------------------------- dispatch */

const HOST_ONLY = new Set([
  'start_hand',
  'deal_next',
  'award',
  'set_board',
  'set_stack',
  'kick',
  'make_host',
  'settings',
  'end_hand',
  'undo',
]);

const CARD_RE = /^[2-9TJQKA][shdc]$/;

/** Applies an intent from `actorId`. Mutates `r`. Returns whether it's undoable. */
export function applyIntent(r: StoredRoom, actorId: string, intent: Intent): boolean {
  const actor = mustPlayer(r, actorId);
  const isHost = r.hostId === actorId;
  if (HOST_ONLY.has(intent.type) && !isHost) fail('host_only');

  switch (intent.type) {
    case 'fold':
    case 'check':
    case 'call':
    case 'allin':
    case 'raise': {
      const target = intent.as && intent.as !== actorId ? intent.as : actorId;
      if (target !== actorId && !isHost) fail('host_only');
      const p = mustPlayer(r, target);
      playerAct(r, p, intent.type, intent.type === 'raise' ? intent.to : undefined);
      return true;
    }
    case 'start_hand':
      startHand(r);
      return true;
    case 'deal_next':
      dealNext(r);
      return true;
    case 'award':
      award(r, intent.winners);
      return true;
    case 'end_hand': {
      if (!handInProgress(r)) fail('no_hand');
      for (const p of r.players) p.stack += p.contributed;
      endHand(r, null);
      log(r, 'hand_cancelled');
      return true;
    }
    case 'set_board': {
      const i = Math.floor(intent.index);
      if (!(i >= 0 && i < 5)) fail('bad_card');
      if (intent.card !== null) {
        if (!CARD_RE.test(intent.card)) fail('bad_card');
        if (r.board.some((c, j) => j !== i && c === intent.card)) fail('card_used');
      }
      r.board[i] = intent.card;
      return false;
    }
    case 'set_stack': {
      const p = mustPlayer(r, intent.target);
      const v = Math.floor(Number(intent.stack));
      if (!Number.isFinite(v) || v < 0 || v > 1e9) fail('bad_amount');
      if (handInProgress(r) && p.inHand && !p.folded && v === 0 && !p.allIn) fail('in_hand');
      p.stack = v;
      if (handInProgress(r) && p.inHand) p.allIn = v === 0 && !p.folded;
      log(r, 'stack_set', p, v);
      if (handInProgress(r) && r.toAct === p.id && p.allIn) advance(r, p.id);
      return true;
    }
    case 'sit': {
      const p = mustPlayer(r, intent.target);
      if (p.id !== actorId && !isHost) fail('host_only');
      p.sittingOut = !!intent.out;
      log(r, p.sittingOut ? 'sit_out' : 'sit_in', p);
      return false;
    }
    case 'kick': {
      const p = mustPlayer(r, intent.target);
      if (p.id === r.hostId) fail('cannot_kick_host');
      if (handInProgress(r) && live(p)) fail('in_hand');
      if (handInProgress(r) && p.inHand) fail('in_hand');
      r.players = r.players.filter((o) => o.id !== p.id);
      delete r.secrets[p.id];
      if (r.dealerId === p.id) r.dealerId = null;
      log(r, 'left', p);
      return false;
    }
    case 'make_host': {
      const p = mustPlayer(r, intent.target);
      r.hostId = p.id;
      log(r, 'new_host', p);
      return false;
    }
    case 'settings': {
      const s = sanitizeSettings({
        sb: intent.sb,
        bb: intent.bb,
        startingStack: intent.startingStack ?? r.settings.startingStack,
      });
      r.settings = s;
      log(r, 'blinds', null, s.bb, `${s.sb}/${s.bb}`);
      return false;
    }
    case 'rename': {
      actor.name = cleanName(intent.name);
      if (intent.avatar !== undefined) actor.avatar = Math.abs(Math.floor(intent.avatar)) % AVATARS;
      return false;
    }
    case 'undo':
      // handled by the API layer (needs history)
      return false;
    default:
      fail('bad_action');
  }
  return false;
}

export function toPublic(r: StoredRoom, version: number, canUndo = false) {
  const { secrets: _s, ...rest } = r;
  return { ...rest, version, canUndo };
}
