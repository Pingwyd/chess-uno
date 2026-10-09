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
import { Icon } from './icons';
import { ClockPicker } from './ClockPicker';
import { useSettings } from './settings/store';
import { TC_SHORT } from '../rules/timeControl';

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
  const { timeControl: tc } = useSettings();

  const startBot = () => {
    const humanColor: Color = side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : side;
    onStart({ mode: 'bot', botLevel: level, humanColor, tc });
  };

  const levelName = LEVELS.find((l) => l.id === level)!.name;
  return (
    <div className="home" data-testid="home">
      <header className="home-top">
        <h1 className="wordmark" aria-label="Chess Uno"><span>Chess</span><b>Uno</b></h1>
        <p className="tagline">Draw a card. Make that many moves.</p>
        <button className="link-btn how-link" onClick={() => setRules(true)} data-testid="how-to-play">How to play <Icon name="arrow-right" size={15} /></button>
      </header>

      <section className="play-area mode-bot" aria-label="Play against the bot">
        <div className="play-head">
          <div>
            <span className="eyebrow">Play now</span>
            <h2 className="play-title">Vs bot</h2>
            <p className="play-sub">The bot plans whole multi-move turns.</p>
          </div>
          <div className="play-cards" aria-hidden="true">
            <CardFace kind="1" size="sm" className="pc1" />
            <CardFace kind="2" size="sm" className="pc2" />
            <CardFace kind="3" size="sm" className="pc3" />
          </div>
        </div>
        <div className="field-label">Difficulty</div>
        <div className="seg seg-levels" role="radiogroup" aria-label="Difficulty">
          {LEVELS.map((l) => (
            <button key={l.id} role="radio" aria-checked={level === l.id} className={`seg-btn ${level === l.id ? 'on' : ''}`} onClick={() => setLevel(l.id)} data-testid={`level-${l.id}`}>
              <span className="seg-piece"><Piece piece={l.piece} set={pieceSet} /></span>
              <span><b>{l.name}</b><small>{l.blurb}</small></span>
            </button>
          ))}
        </div>
        <div className="field-label">Your side</div>
        <div className="seg seg-small" role="radiogroup" aria-label="Your side">
          {(['w', 'random', 'b'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={side === s} className={`seg-btn ${side === s ? 'on' : ''}`} onClick={() => setSide(s)}>
              {s === 'w' ? 'White' : s === 'b' ? 'Black' : 'Random'}
            </button>
          ))}
        </div>
        <ClockPicker label="Clock (all games)" />
        <button className="btn primary wide play-go" onClick={startBot} data-testid="start-bot">Play vs {levelName} Bot <Icon name="arrow-right" size={20} /></button>
      </section>

      <div className="home-side">
        <div className="rows" role="list">
          <button className="row mode-pass" onClick={() => onStart({ mode: 'pass', botLevel: 'medium', humanColor: 'w', tc })} data-testid="mode-pass" role="listitem">
            <span className="row-icon"><Icon name="arrow-up-down" size={20} /></span>
            <span className="row-main"><b>Pass &amp; Play</b><small>Two players, one device. {TC_SHORT[tc]} each.</small></span>
            <Icon name="chevron-right" size={18} className="chev" />
          </button>
          <button className="row mode-online" onClick={onOnline} data-testid="mode-online" role="listitem">
            <span className="row-icon"><Icon name="globe" size={20} /></span>
            <span className="row-main"><b>Online</b><small>Quick match, or invite a friend by code.</small></span>
            <Icon name="chevron-right" size={18} className="chev" />
          </button>
          <LearnCard progress={progress} onLearn={onLearn} />
        </div>
        <RecentGames onOpen={onReplay} />
      </div>

      {rules && (
        <div className="overlay" onClick={() => setRules(false)}>
          <div className="panel rules" onClick={(e) => e.stopPropagation()}>
            <HowToPlay />
            <button className="btn wide" onClick={() => setRules(false)}>Got it</button>
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
    <div className="learn-home" data-testid="learn-card">
      <button className="row learn-home-main" onClick={() => onLearn('path')} data-testid="open-learn" role="listitem">
        <span className="row-icon"><Icon name="graduation-cap" size={20} /></span>
        <span className="row-main">
          <b>Learn</b>
          <small>{next ? `${done ? 'Next' : 'Start'}: ${lessonTitle(next)}` : 'Path complete. Ranked play unlocked.'}</small>
          <span className="row-meter" aria-label={`${done} of ${total} lessons`}><i style={{ width: `${(done / total) * 100}%` }} /></span>
        </span>
        <span className="row-num"><b>{done}/{total}</b><small>{st}d streak</small></span>
        <Icon name="chevron-right" size={18} className="chev" />
      </button>
      <button className={`row learn-home-daily ${dailyDone ? 'done' : ''}`} onClick={() => onLearn('daily')} data-testid="open-daily" role="listitem">
        <span className="row-icon"><Icon name={dailyDone ? 'check' : 'calendar'} size={20} /></span>
        <span className="row-main"><b>Daily puzzle</b><small>{dailyDone ? 'Solved today.' : 'One position a day. +20 XP.'}</small></span>
        <Icon name="chevron-right" size={18} className="chev" />
      </button>
    </div>
  );
}
