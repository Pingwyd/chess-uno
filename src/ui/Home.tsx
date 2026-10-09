import { useState } from 'react';
import type { Color } from '../rules/chess';
import type { BotLevel } from '../engine/bot';
import { CardFace } from './Card';
import { Piece, type PieceSet } from './pieces';
import type { GameSetup } from './useGame';
import { has3D, type BoardMode } from './BoardView';

interface Props {
  pieceSet: PieceSet;
  sound: boolean;
  boardMode: BoardMode;
  onBoardMode: (m: BoardMode) => void;
  onPieceSet: (s: PieceSet) => void;
  onSound: (on: boolean) => void;
  onStart: (setup: GameSetup) => void;
  onOnline: () => void;
}

const LEVELS: { id: BotLevel; name: string; blurb: string; piece: string }[] = [
  { id: 'easy', name: 'Pawn', blurb: 'Easy', piece: 'P' },
  { id: 'medium', name: 'Knight', blurb: 'Medium', piece: 'N' },
  { id: 'hard', name: 'Rook', blurb: 'Hard', piece: 'R' },
];

export function Home({ pieceSet, sound, boardMode, onBoardMode, onPieceSet, onSound, onStart, onOnline }: Props) {
  const [level, setLevel] = useState<BotLevel>('medium');
  const [side, setSide] = useState<'w' | 'b' | 'random'>('w');
  const [rules, setRules] = useState(false);

  const startBot = () => {
    const humanColor: Color = side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : side;
    onStart({ mode: 'bot', botLevel: level, humanColor });
  };

  return (
    <div className="home" data-testid="home">
      <div className="hero">
        <div className="hero-art">
          <div className="hero-card hc1"><CardFace kind="3" size="md" /></div>
          <div className="hero-card hc2"><CardFace kind="reverse" size="md" /></div>
          <div className="hero-card hc3"><CardFace kind="skip" size="md" /></div>
          <div className="hero-piece hp1"><Piece piece="K" set={pieceSet} /></div>
          <div className="hero-piece hp2"><Piece piece="q" set={pieceSet} /></div>
        </div>
        <h1 className="logo">
          <span className="logo-chess">Chess</span>
          <span className="logo-uno">UNO</span>
        </h1>
        <p className="tagline">Draw a card. Make that many moves. Outwit the deck.</p>
      </div>

      <div className="modes">
        <button className="mode-card mode-pass" onClick={() => onStart({ mode: 'pass', botLevel: 'medium', humanColor: 'w' })} data-testid="mode-pass">
          <div className="mode-icon">⇅</div>
          <div>
            <h2>Pass &amp; Play</h2>
            <p>Two players, one device, face to face. Works offline.</p>
          </div>
        </button>

        <div className="mode-card mode-bot">
          <div className="mode-head">
            <div className="mode-icon">⚙</div>
            <div>
              <h2>Vs Bot</h2>
              <p>The bot plans whole multi-move turns.</p>
            </div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Difficulty">
            {LEVELS.map((l) => (
              <button key={l.id} role="radio" aria-checked={level === l.id} className={`seg-btn ${level === l.id ? 'on' : ''}`} onClick={() => setLevel(l.id)} data-testid={`level-${l.id}`}>
                <span className="seg-piece"><Piece piece={l.piece} set={pieceSet} /></span>
                <span><b>{l.name}</b><small>{l.blurb}</small></span>
              </button>
            ))}
          </div>
          <div className="seg seg-small" role="radiogroup" aria-label="Your side">
            {(['w', 'random', 'b'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={side === s} className={`seg-btn ${side === s ? 'on' : ''}`} onClick={() => setSide(s)}>
                {s === 'w' ? 'White' : s === 'b' ? 'Black' : 'Random'}
              </button>
            ))}
          </div>
          <button className="btn primary wide" onClick={startBot} data-testid="start-bot">Play vs {LEVELS.find((l) => l.id === level)!.name} Bot</button>
        </div>

        <button className="mode-card mode-online" onClick={onOnline} data-testid="mode-online">
          <div className="mode-icon">◎</div>
          <div>
            <h2>Online</h2>
            <p>Quick Match, invite a friend by link or code, watch live games.</p>
          </div>
        </button>
      </div>

      <div className="home-foot">
        <div className="seg seg-small" role="radiogroup" aria-label="Piece set">
          <button className={`seg-btn ${pieceSet === 'arcane' ? 'on' : ''}`} onClick={() => onPieceSet('arcane')}>Arcane Forge</button>
          <button className={`seg-btn ${pieceSet === 'classic' ? 'on' : ''}`} onClick={() => onPieceSet('classic')}>Classic</button>
        </div>
        <div className="seg seg-small seg-board" role="radiogroup" aria-label="Board">
          <button className={`seg-btn ${boardMode === '2d' ? 'on' : ''}`} onClick={() => onBoardMode('2d')} data-testid="board-2d">2D board</button>
          <button className={`seg-btn ${boardMode === '3d' ? 'on' : ''}`} onClick={() => onBoardMode('3d')} disabled={!has3D()} title={has3D() ? '' : 'WebGL is not available on this device'} data-testid="board-3d-opt">3D board</button>
        </div>
        <button className="btn ghost small" onClick={() => onSound(!sound)}>{sound ? '🔊 Sound on' : '🔈 Sound off'}</button>
        <button className="btn ghost small" onClick={() => setRules(true)}>How to play</button>
      </div>

      {rules && (
        <div className="overlay" onClick={() => setRules(false)}>
          <div className="panel rules" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <ul>
              <li><b>Normal chess</b>, White first, 10 minutes each. Run out of time and you lose.</li>
              <li>Start each turn by <b>drawing a card</b>: a <b>1, 2 or 3</b> means that many moves in a row.</li>
              <li><b>Giving check ends your turn</b> immediately. Set up quietly, then check on your last move.</li>
              <li>White's very first turn is capped at <b>1 move</b>.</li>
              <li><b>Skip</b> and <b>Reverse</b> go into your hand (max 2). Play one at the start of a turn, before drawing.</li>
              <li><b>Skip:</b> take your turn, then your opponent's next turn is skipped. Check cancels Skip.</li>
              <li><b>Reverse:</b> swap sides with your opponent (uses your turn). Unlocks after 5 turns each.</li>
            </ul>
            <button className="btn primary" onClick={() => setRules(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
