export type Street = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Player {
  id: string;
  name: string;
  avatar: number;
  stack: number;
  /** Chips put in during the current betting street */
  bet: number;
  /** Total chips put in during the current hand */
  contributed: number;
  folded: boolean;
  allIn: boolean;
  /** Dealt into the current hand */
  inHand: boolean;
  sittingOut: boolean;
  acted: boolean;
  /** Table bet level when this player last acted this street, -1 = not yet (for re-raise rights) */
  lastActLevel: number;
  lastAction: { type: ActionType | 'sb' | 'bb'; amount: number } | null;
  joinedAt: number;
}

export interface Settings {
  sb: number;
  bb: number;
  startingStack: number;
}

export interface Pot {
  amount: number;
  eligible: string[];
}

export interface PotResult {
  amount: number;
  winners: string[];
  shares: Record<string, number>;
}

export interface HandResult {
  handNo: number;
  pots: PotResult[];
  /** Hand ended because everyone else folded */
  uncontested: boolean;
}

export type LogEntry = {
  t: number;
  k: string;
  p?: string;
  a?: number;
  s?: string;
};

export type GameEvent = {
  id: number;
  k: 'bet' | 'win' | 'deal' | 'fold' | 'start';
  pid?: string;
  a?: number;
};

export interface Room {
  code: string;
  createdAt: number;
  updatedAt: number;
  hostId: string;
  settings: Settings;
  players: Player[];
  handNo: number;
  dealerId: string | null;
  sbId: string | null;
  bbId: string | null;
  street: Street;
  /** Furthest street reached in the current/last hand */
  lastStreet?: Street;
  /** Betting round finished, waiting for the host to deal the next street */
  awaitingDeal: boolean;
  toAct: string | null;
  currentBet: number;
  minRaise: number;
  /** Community cards: null = not dealt / unknown, string = e.g. "As", "Td" */
  board: (string | null)[];
  lastResult: HandResult | null;
  log: LogEntry[];
  events: GameEvent[];
  eventSeq: number;
}

/** Room as stored on the server (includes player secrets) */
export interface StoredRoom extends Room {
  secrets: Record<string, string>;
}

/** Room as sent to clients */
export interface PublicRoom extends Room {
  version: number;
  canUndo?: boolean;
}

export type Intent =
  | { type: 'fold' | 'check' | 'call' | 'allin'; as?: string }
  | { type: 'raise'; to: number; as?: string }
  | { type: 'start_hand' }
  | { type: 'deal_next' }
  | { type: 'award'; winners: string[][] }
  | { type: 'set_board'; index: number; card: string | null }
  | { type: 'set_stack'; target: string; stack: number }
  | { type: 'sit'; target: string; out: boolean }
  | { type: 'kick'; target: string }
  | { type: 'make_host'; target: string }
  | { type: 'settings'; sb: number; bb: number; startingStack?: number }
  | { type: 'rename'; name: string; avatar?: number }
  | { type: 'end_hand' }
  | { type: 'undo' };
