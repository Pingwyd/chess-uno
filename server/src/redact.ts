/** Build per-viewer views of the authoritative state (no deck order, no hidden hands). */
import type { GameState, PlayerId } from '../../src/rules/game';

export function redactState(s: GameState, viewer: PlayerId | null): { state: GameState; hiddenCardIds: number[] } {
  const st: GameState = structuredClone(s);
  const hidden: number[] = [];
  st.rng = 0;
  st.repetition = {};
  st.drawPile = st.drawPile.map((_, i) => ({ id: -1 - i, kind: '1' }));
  for (const p of [0, 1] as PlayerId[]) {
    if (p === viewer) continue;
    for (const c of st.hands[p]) { hidden.push(c.id); c.kind = 'skip'; }
    if (st.overflowCard && st.current === p) { hidden.push(st.overflowCard.id); st.overflowCard.kind = 'skip'; }
  }
  for (const e of st.events) {
    if (e.type === 'draw' && e.toHand && e.player !== viewer) {
      hidden.push(e.card.id);
      e.card = { ...e.card, kind: 'skip' };
    }
  }
  for (const t of st.history) if (t.player !== viewer) t.toHand = [];
  return { state: st, hiddenCardIds: [...new Set(hidden)] };
}
