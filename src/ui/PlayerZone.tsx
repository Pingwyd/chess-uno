import { useState } from 'react';
import type { PromotionPiece } from '../rules/chess';
import { canPlayCard, cardBlockReason, remainingMs, reverseExhausted, type GameAction, type GameState, type PlayerId } from '../rules/game';
import type { ActionKind } from '../rules/cards';
import { CardBack, CardFace } from './Card';
import { Piece, type PieceSet } from './pieces';

export function formatClock(ms: number): string {
  if (ms < 20_000) {
    const s = Math.max(0, ms) / 1000;
    return `0:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

interface Props {
  state: GameState;
  player: PlayerId;
  now: number;
  rotated: boolean;
  isBot: boolean;
  /** Someone else controls this zone (online opponent, or any zone when spectating). */
  remote?: boolean;
  /** Card ids whose faces this viewer may not see. */
  hiddenCardIds?: Set<number>;
  /** Extra tags next to the name (rating, connection status…). */
  badge?: React.ReactNode;
  compact?: boolean;
  pieceSet: PieceSet;
  dispatch: (a: GameAction) => boolean;
  promotion: { from: number; to: number } | null;
  onPromote: (p: PromotionPiece) => void;
  onCancelPromotion: () => void;
  onPause?: () => void;
  onResign?: () => void;
}

export function PlayerZone(props: Props) {
  const { state, player, now, rotated, isBot, compact, pieceSet, dispatch, promotion } = props;
  const remote = isBot || !!props.remote;
  const color = state.colorOf[player];
  const active = state.current === player && state.phase !== 'over';
  const ms = remainingMs(state, player, now);
  const hand = state.hands[player];
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const sideName = color === 'w' ? 'White' : 'Black';
  const low = ms < 30_000;
  const reverseUsed = reverseExhausted(state, player);
  const usedTip = 'Reverse used — one per player per game. Any Reverse drawn from now on is discarded and you draw again.';

  let body: React.ReactNode = null;
  if (promotion && active && !remote) {
    body = (
      <div className="zone-prompt">
        <div className="prompt-title">Promote to…</div>
        <div className="promo-row">
          {(['q', 'r', 'b', 'n'] as PromotionPiece[]).map((p) => (
            <button key={p} className="promo-btn" onClick={() => props.onPromote(p)} aria-label={`Promote to ${p}`}>
              <Piece piece={color === 'w' ? p.toUpperCase() : p} set={pieceSet} />
            </button>
          ))}
          <button className="btn ghost small" onClick={props.onCancelPromotion}>Cancel</button>
        </div>
      </div>
    );
  } else if (active && state.phase === 'overflow' && !remote) {
    const newCard = state.overflowCard!;
    const canPlayNew = canPlayCard(state, player, newCard.kind as ActionKind);
    body = (
      <div className="zone-prompt">
        <div className="prompt-title">Hand full! Discard one{canPlayNew ? ' or play the new card' : ''}</div>
        <div className="overflow-row">
          {[...hand, newCard].map((c) => (
            <div key={c.id} className={`overflow-card ${c.id === newCard.id ? 'is-new' : ''}`}>
              <CardFace kind={c.kind} size="sm" />
              <button className="btn tiny danger" onClick={() => dispatch({ type: 'resolveOverflow', player, choice: { discardId: c.id } })}>Discard</button>
            </div>
          ))}
          {canPlayNew && (
            <button className="btn primary small" onClick={() => dispatch({ type: 'resolveOverflow', player, choice: 'play' })}>
              Play {newCard.kind === 'skip' ? 'Skip' : 'Reverse'} now
            </button>
          )}
        </div>
      </div>
    );
  } else {
    const showCard = active && state.phase === 'moving' && state.card;
    body = (
      <div className="zone-table">
        {/* Draw pile / current card */}
        <div className="zone-deck-slot">
          {showCard ? (
            <div className="current-card">
              <CardFace kind={state.card!.kind} size={compact ? 'sm' : 'md'} className="card-active" />
            </div>
          ) : (
            <button
              className={`deck-btn ${active && state.phase === 'start' && !remote ? 'deck-ready' : ''}`}
              disabled={!active || state.phase !== 'start' || remote || state.paused}
              onClick={() => dispatch({ type: 'draw', player })}
              aria-label="Draw a card"
            >
              <div className="deck-stack">
                <CardBack size={compact ? 'sm' : 'md'} className="deck-under2" />
                <CardBack size={compact ? 'sm' : 'md'} className="deck-under" />
                <CardBack size={compact ? 'sm' : 'md'} />
              </div>
              <span className="deck-count">{state.drawPile.length}</span>
            </button>
          )}
        </div>

        <div className="zone-status">
          {active && state.phase === 'moving' ? (
            <>
              <div className="pips" aria-label={`Move ${state.movesMade + 1} of ${state.movesAllowed}`}>
                {Array.from({ length: state.movesAllowed }, (_, i) => (
                  <span key={i} className={`pip ${i < state.movesMade ? 'pip-done' : i === state.movesMade ? 'pip-now' : ''}`} />
                ))}
              </div>
              <div className="status-main">
                {isBot ? 'Thinking…' : `Move ${state.movesMade + 1} of ${state.movesAllowed}`}
              </div>
              <div className="status-sub">
                {state.isOpeningTurn && Number(state.card?.kind) > 1 ? 'Opening turn: capped at 1 move' : 'Giving check ends your turn'}
              </div>
            </>
          ) : active && state.phase === 'start' ? (
            <>
              <div className="status-main">{isBot ? 'Drawing…' : remote ? 'Their turn' : 'Your turn'}</div>
              <div className="status-sub">{remote ? '' : hand.length ? 'Play a held card, or tap the deck' : 'Tap the deck to draw'}</div>
            </>
          ) : active ? (
            <div className="status-main">Deciding…</div>
          ) : state.phase === 'over' ? (
            <div className="status-main dim">Game over</div>
          ) : (
            <>
              <div className="status-main dim">Waiting</div>
              {state.pendingSkip === player && <div className="status-sub warn">Your next turn will be skipped</div>}
            </>
          )}
        </div>

        <div className="zone-hand" aria-label="Held action cards">
          {hand.length === 0 && !reverseUsed && <div className="hand-empty">No held cards</div>}
          {reverseUsed && (
            <div className="hand-slot rev-used" title={usedTip} aria-label={usedTip} data-testid={`reverse-used-${player}`}>
              <CardFace kind="reverse" size="sm" className="hand-card card-spent" />
              <span className="rev-used-tag">USED</span>
            </div>
          )}
          {hand.map((c) => {
            if (isBot || props.hiddenCardIds?.has(c.id)) return <CardBack key={c.id} size="sm" className="hand-card" />;
            if (remote) return <CardFace key={c.id} kind={c.kind} size="sm" className="hand-card" />;
            const kind = c.kind as ActionKind;
            const playable = active && state.phase === 'start' && canPlayCard(state, player, kind) && !state.paused;
            const reason = active && state.phase === 'start' ? cardBlockReason(state, player, kind) : null;
            return (
              <div key={c.id} className="hand-slot">
                <button
                  className={`hand-card-btn ${playable ? 'playable' : ''}`}
                  title={reason ?? (playable ? `Play ${kind}` : '')}
                  onClick={() => playable && setConfirmId(confirmId === c.id ? null : c.id)}
                >
                  <CardFace kind={c.kind} size="sm" className="hand-card" />
                  {active && state.phase === 'start' && !playable && <span className="lock">🔒</span>}
                </button>
                {confirmId === c.id && playable && (
                  <div className="confirm-pop">
                    <button className="btn primary tiny" onClick={() => { setConfirmId(null); dispatch({ type: 'playCard', player, cardId: c.id }); }}>
                      Play {kind === 'skip' ? 'Skip' : 'Reverse'}
                    </button>
                    <button className="btn ghost tiny" onClick={() => setConfirmId(null)}>Keep</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className={`zone zone-${color} ${active ? 'zone-active' : 'zone-idle'} ${rotated ? 'zone-rotated' : ''} ${compact ? 'zone-compact' : ''}`} data-player={player}>
      <header className="zone-head">
        <div className="zone-id">
          <div className={`avatar avatar-${color}`}><Piece piece={color === 'w' ? 'K' : 'k'} set={pieceSet} /></div>
          <div>
            <div className="zone-name">{state.players[player].name}{isBot && <span className="bot-tag">BOT</span>}{props.badge}</div>
            <div className="zone-side">{sideName} · {hand.length} held{reverseUsed && <span className="rev-used-mini" title={usedTip}> · ⇄ used</span>}</div>
          </div>
        </div>
        {!remote && (props.onPause || props.onResign) && state.phase !== 'over' && (
          <div className="zone-menu">
            {props.onPause && <button className="icon-btn" onClick={props.onPause} aria-label="Pause">❚❚</button>}
            {props.onResign && (confirmResign ? (
              <>
                <button className="btn danger tiny" onClick={() => { setConfirmResign(false); props.onResign!(); }}>Resign?</button>
                <button className="btn ghost tiny" onClick={() => setConfirmResign(false)}>No</button>
              </>
            ) : (
              <button className="icon-btn" onClick={() => setConfirmResign(true)} aria-label="Resign">⚑</button>
            ))}
          </div>
        )}
        <div className={`clock ${active && !state.paused ? 'clock-running' : ''} ${low ? 'clock-low' : ''}`} data-testid={`clock-${player}`}>
          {formatClock(ms)}
        </div>
      </header>
      {body}
    </section>
  );
}
