import { useEffect, useMemo, useState } from 'react';
import type { Lesson, Step } from '../../learn/types';
import { BADGES, SKIN_NAMES, starsFor, type Outcome } from '../../learn/progress';
import { DemoBoard } from './DemoBoard';
import { PuzzleView } from './PuzzleView';
import { CardRow, prefersReducedMotion, Rich, Stars, type BoardEnv } from './shared';
import { sfx } from '../sound';
import { Icon, asIcon } from '../icons';

export type PlayMode = 'lesson' | 'placement' | 'daily';

interface Props {
  lesson: Lesson;
  mode: PlayMode;
  env: BoardEnv;
  /** Unit accent colour. */
  color: string;
  onExit: () => void;
  /** Record the result; returns what was earned (null = not passed, e.g. a failed placement). */
  onFinish: (stars: 1 | 2 | 3, mistakes: number) => Outcome | null;
  onNext?: () => void;
  nextTitle?: string;
}

/** Plays a lesson: explainers, multiple choice and puzzles, then a celebration screen. */
export function LessonPlayer({ lesson, mode, env, color, onExit, onFinish, onNext, nextTitle }: Props) {
  const [i, setI] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<{ stars: 1 | 2 | 3; outcome: Outcome | null } | null>(null);
  const steps = lesson.steps;

  const next = () => {
    if (i + 1 < steps.length) { setI(i + 1); return; }
    const stars = starsFor(mistakes, hints);
    setResult({ stars, outcome: onFinish(stars, mistakes) });
  };

  return (
    <div className="lesson" style={{ ['--unit' as string]: color }} data-testid="lesson">
      <div className="lesson-bar">
        <button className="icon-btn" onClick={onExit} aria-label="Close lesson" data-testid="lesson-close"><Icon name="x" size={20} /></button>
        <div className="lesson-progress" aria-label={`Step ${i + 1} of ${steps.length}`}>
          <div className="lesson-progress-fill" style={{ width: `${((result ? steps.length : i) / steps.length) * 100}%` }} />
        </div>
        <span className="lesson-mistakes" title="Mistakes">{mistakes ? <><Icon name="x" size={14} /> {mistakes}</> : ''}</span>
      </div>
      <div className="lesson-body">
        {result ? (
          <Complete lesson={lesson} mode={mode} stars={result.stars} outcome={result.outcome} mistakes={mistakes} hints={hints} onExit={onExit} onNext={onNext} nextTitle={nextTitle} />
        ) : (
          <StepView
            key={`${lesson.id}-${i}`}
            step={steps[i]} env={env}
            onMistake={() => setMistakes((m) => m + 1)}
            onHint={() => setHints((h) => h + 1)}
            onDone={next}
          />
        )}
      </div>
    </div>
  );
}

function StepView({ step, env, onMistake, onHint, onDone }: { step: Step; env: BoardEnv; onMistake: () => void; onHint: () => void; onDone: () => void }) {
  if (step.kind === 'puzzle') return <PuzzleView puzzle={step.puzzle} env={env} onMistake={onMistake} onHint={onHint} onDone={onDone} />;
  if (step.kind === 'explain') {
    return (
      <div className="explain" data-testid="explain">
        <h2>{step.title}</h2>
        <p className="explain-text"><Rich text={step.text} /></p>
        {step.cards && <CardRow cards={step.cards} />}
        {step.demo && <DemoBoard demo={step.demo} env={env} />}
        <div className="step-foot"><button className="btn primary wide" onClick={onDone} data-testid="continue">Continue</button></div>
      </div>
    );
  }
  return <Mcq step={step} env={env} onMistake={onMistake} onDone={onDone} />;
}

function Mcq({ step, env, onMistake, onDone }: { step: Extract<Step, { kind: 'mcq' }>; env: BoardEnv; onMistake: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const ok = picked === step.answer;
  const pick = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    if (k === step.answer) sfx.win(); else { sfx.lose(); onMistake(); }
  };
  return (
    <div className="mcq" data-testid="mcq">
      <h2 className="mcq-q"><Rich text={step.question} /></h2>
      {step.cards && <CardRow cards={step.cards} />}
      {step.demo && <DemoBoard demo={step.demo} env={env} />}
      <div className="mcq-options">
        {step.options.map((o, k) => (
          <button
            key={k}
            className={`mcq-opt ${picked === null ? '' : k === step.answer ? 'right' : k === picked ? 'wrong' : 'dim'}`}
            onClick={() => pick(k)} data-testid={`option-${k}`} disabled={picked !== null}
          >
            <span className="mcq-key">{'ABCD'[k]}</span><span>{o}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={`feedback ${ok ? 'good' : 'bad'}`} data-testid={ok ? 'feedback-correct' : 'feedback-wrong'} role="status">
          <div className="feedback-head"><span className="feedback-icon"><Icon name={ok ? 'check' : 'x'} size={18} strokeWidth={3} /></span><b>{ok ? 'Correct!' : `Answer: ${step.options[step.answer]}`}</b></div>
          <p><Rich text={step.explain} /></p>
          <div className="feedback-actions"><button className="btn primary wide" onClick={onDone} data-testid="continue">Continue</button></div>
        </div>
      )}
    </div>
  );
}

function Complete({ lesson, mode, stars, outcome, mistakes, hints, onExit, onNext, nextTitle }: {
  lesson: Lesson; mode: PlayMode; stars: 1 | 2 | 3; outcome: Outcome | null; mistakes: number; hints: number;
  onExit: () => void; onNext?: () => void; nextTitle?: string;
}) {
  const [xp, setXp] = useState(0);
  const target = outcome?.xpGained ?? 0;
  useEffect(() => {
    if (!outcome) { sfx.lose(); return; }
    sfx.win();
    if (prefersReducedMotion()) { setXp(target); return; }
    let v = 0;
    const id = setInterval(() => { v = Math.min(target, v + Math.max(1, Math.round(target / 24))); setXp(v); if (v >= target) clearInterval(id); }, 40);
    return () => clearInterval(id);
  }, []);
  const badges = (outcome?.newBadges ?? []).map((id) => BADGES.find((b) => b.id === id)!).filter(Boolean);
  const title = !outcome ? 'Almost there' : mode === 'placement' ? 'Tested out!' : mode === 'daily' ? 'Daily puzzle solved!' : 'Lesson complete!';
  return (
    <div className="complete" data-testid="lesson-complete">
      {outcome && <Confetti />}
      <div className="complete-crest"><Icon name={outcome ? (mode === 'daily' ? 'calendar' : asIcon(lesson.icon)) : 'rotate-ccw'} size="1em" strokeWidth={1.7} /></div>
      <h2>{title}</h2>
      {!outcome ? (
        <p className="complete-sub">{mistakes} mistakes — the placement check needs at most 1. Start with the first lesson, or try again later.</p>
      ) : (
        <>
          {mode === 'lesson' && <Stars n={stars} size="lg" animate />}
          <div className="complete-stats">
            <div className="stat-pill xp"><span><Icon name="zap" size={20} /></span><b data-testid="xp-gained">+{xp}</b><small>XP</small></div>
            <div className="stat-pill streak"><span><Icon name="flame" size={20} /></span><b>{outcome.streak}</b><small>day streak</small></div>
            {mode === 'lesson' && <div className="stat-pill acc"><span><Icon name="target" size={20} /></span><b>{mistakes === 0 ? '100%' : `${mistakes} slip${mistakes > 1 ? 's' : ''}`}</b><small>{hints ? `${hints} hint${hints > 1 ? 's' : ''} used` : 'accuracy'}</small></div>}
          </div>
          {badges.length > 0 && (
            <div className="new-badges">
              {badges.map((b) => (
                <div key={b.id} className="new-badge" data-testid="new-badge">
                  <span className="badge-medal"><Icon name={asIcon(b.icon)} size="1em" /></span>
                  <div><b>New badge: {b.name}</b><small>{b.reward ? `Unlocked the ${SKIN_NAMES[b.reward.skin]} piece skin!` : b.desc}</small></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="complete-actions">
        {onNext && outcome && <button className="btn primary wide" onClick={onNext} data-testid="next-lesson">Next: {nextTitle}</button>}
        <button className={`btn ${onNext && outcome ? 'ghost' : 'primary'} wide`} onClick={onExit} data-testid="complete-continue">{outcome ? 'Back to path' : 'OK'}</button>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#ffb347', '#ffd98a', '#2fe6d6', '#8a5cff', '#ff5470', '#f6eedf'];
function Confetti() {
  const bits = useMemo(() => Array.from({ length: 36 }, (_, k) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.6 + Math.random() * 1.2,
    color: CONFETTI_COLORS[k % CONFETTI_COLORS.length], rot: Math.random() * 360, size: 6 + Math.random() * 6,
  })), []);
  if (prefersReducedMotion()) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, k) => (
        <span key={k} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, width: b.size, height: b.size * 0.45, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}
