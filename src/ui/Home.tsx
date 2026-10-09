import { useState } from 'react';
import type { Color } from '../rules/chess';
import type { BotLevel } from '../engine/bot';
import { CardFace } from './Card';
import { Piece, type PieceSet } from './pieces';
import type { GameSetup } from './useGame';
import { useProgress } from '../learn/store';
import { OUTLINE_SHAPE as PATH_SHAPE, lessonTitle } from '../learn/outline';
import { localDay, nextLesson, pathOrder, streak, utcDay } from '../learn/progress';
import type { LearnTab } from './learn/LearnScreen';
import { RecentGames, type OpenReplay } from './RecentGames';
import { HowToPlay } from './HowToPlay';

/** Home stays focused: play modes, Learn and recent games. Profile, settings, social and rankings live in the app nav. */
interface Props {
  pieceSet: PieceSet;
  onStart: (setup: GameSetup) => void;
  onOnline: () => void;
  onLearn: (tab: LearnTab) => void;
  onReplay: OpenReplay;
}

const LEVELS: { id: BotLevel; name: string; blurb: string; piece: string }[] = [
  { id: 'easy', name: 'Pawn', blurb: 'Easy', piece: 'P' },
  { id: 'medium', name: 'Knight', blurb: 'Medium', piece: 'N' },
  { id: 'hard', name: 'Rook', blurb: 'Hard', piece: 'R' },
];

export function Home({ pieceSet, onStart, onOnline, onLearn, onReplay }: Props) {
  const progress = useProgress();
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
        <button className="link-btn how-link" onClick={() => setRules(true)} data-testid="how-to-play">How to play ›</button>
      </div>

      <LearnCard progress={progress} onLearn={onLearn} />

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
            <p>Quick Match or invite a friend by link or code.</p>
          </div>
        </button>
      </div>

      <RecentGames onOpen={onReplay} />

      {rules && (
        <div className="overlay" onClick={() => setRules(false)}>
          <div className="panel rules" onClick={(e) => e.stopPropagation()}>
            <HowToPlay />
            <button className="btn primary" onClick={() => setRules(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LearnCard({ progress, onLearn }: { progress: ReturnType<typeof useProgress>; onLearn: (t: LearnTab) => void }) {
  const total = pathOrder(PATH_SHAPE).length;
  const done = pathOrder(PATH_SHAPE).filter((id) => progress.lessons[id]).length;
  const next = nextLesson(progress, PATH_SHAPE);
  const st = streak(progress, localDay());
  const dailyDone = !!progress.daily[utcDay()];
  return (
    <section className="learn-home" data-testid="learn-card">
      <button className="learn-home-main" onClick={() => onLearn('path')} data-testid="open-learn">
        <div className="learn-home-icon">🎓</div>
        <div className="learn-home-text">
          <h2>Learn</h2>
          <p>{next ? `${done ? 'Continue' : 'Start'}: ${lessonTitle(next)}` : 'Path complete — ranked unlocked!'}</p>
          <div className="learn-home-meter"><div style={{ width: `${(done / total) * 100}%` }} /></div>
          <small>{done}/{total} lessons · ⚡ {progress.xp} XP · 🔥 {st} day{st === 1 ? '' : 's'}</small>
        </div>
      </button>
      <button className={`learn-home-daily ${dailyDone ? 'done' : ''}`} onClick={() => onLearn('daily')} data-testid="open-daily">
        <span>{dailyDone ? '✓' : '📅'}</span>
        <b>Daily puzzle</b>
        <small>{dailyDone ? 'Solved' : '+20 XP'}</small>
      </button>
    </section>
  );
}
