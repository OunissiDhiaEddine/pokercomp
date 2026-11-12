const SUITS: Record<string, { s: string; red: boolean }> = {
  s: { s: '♠', red: false },
  h: { s: '♥', red: true },
  d: { s: '♦', red: true },
  c: { s: '♣', red: false },
};

export const rankLabel = (r: string) => (r === 'T' ? '10' : r);

export function CardFace({ card, small = false, dim = false }: { card: string; small?: boolean; dim?: boolean }) {
  const rank = rankLabel(card[0]);
  const suit = SUITS[card[1]];
  return (
    <span className={`card-face ${suit.red ? 'red' : ''} ${small ? 'small' : ''} ${dim ? 'dim' : ''}`}>
      <span className="cr">{rank}</span>
      <span className="cs">{suit.s}</span>
      <span className="cbig">{suit.s}</span>
    </span>
  );
}

export function CardBack() {
  return (
    <span className="card-back">
      <span className="cb-inner" />
    </span>
  );
}

/** A board slot that flips from back to face once dealt. */
export function BoardCard({
  dealt,
  card,
  index,
  onClick,
}: {
  dealt: boolean;
  card: string | null;
  index: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`board-card ${dealt ? 'dealt' : ''} ${card ? 'known' : ''}`}
      style={{ '--i': index } as React.CSSProperties}
      onClick={onClick}
      disabled={!onClick}
      aria-label={card ?? (dealt ? 'card' : 'empty')}
    >
      <span className="bc-inner">
        <span className="bc-back">
          <CardBack />
        </span>
        <span className="bc-front">
          {card ? (
            <CardFace card={card} />
          ) : (
            <span className="card-blank">
              <i>♠</i>
              <i className="r">♥</i>
              <i className="r">♦</i>
              <i>♣</i>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export const SUIT_KEYS = ['s', 'h', 'd', 'c'] as const;
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export { SUITS };
