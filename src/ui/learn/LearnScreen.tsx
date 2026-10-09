import { useEffect, useRef, useState } from 'react';
import { PATH_SHAPE, UNITS, dailyFor, lessonById, unitOfLesson } from '../../learn/content';
import {
  BADGES, SKIN_NAMES, completeLesson, equipSkin, isDone, isUnlocked, localDay, nextLesson, ownedSkins, passPlacement,
  solveDaily, streak, unitDone, utcDay, addDays, type BlackSkin, type WhiteSkin,
} from '../../learn/progress';
import { getProgress, pullProgress, setProgress, useProgress, useSyncState } from '../../learn/store';
import type { Lesson, Unit } from '../../learn/types';
import { Piece } from '../pieces';
import { LessonPlayer, type PlayMode } from './LessonPlayer';
import { CardRow, Stars, type BoardEnv } from './shared';
import './learn.css';

export type LearnTab = 'path' | 'daily' | 'badges';

interface Props extends BoardEnv {
  initialTab?: LearnTab;
  onHome: () => void;
  /** A lesson or puzzle is open (the app hides its navigation). */
  onPlaying?: (playing: boolean) => void;
}

const UNIT_BADGE: Record<string, string> = { basics: 'board-ready', cards: 'card-shark', check: 'patient-hunter', actions: 'turntable', strategy: 'graduate' };
const WIGGLE = [0, 56, 84, 56, 0, -56, -84, -56];

export default function LearnScreen({ initialTab = 'path', onHome, onPlaying, ...env }: Props) {
  const progress = useProgress();
  const sync = useSyncState();
  const [tab, setTab] = useState<LearnTab>(initialTab);
  const [playing, setPlaying] = useState<{ lesson: Lesson; mode: PlayMode } | null>(null);
  useEffect(() => { void pullProgress(); }, []);
  useEffect(() => { onPlaying?.(!!playing); }, [playing, onPlaying]);
  useEffect(() => () => onPlaying?.(false), [onPlaying]);

  const today = localDay();
  const utc = utcDay();
  const daily = dailyFor(utc);
  const next = nextLesson(progress, PATH_SHAPE);

  const start = (lesson: Lesson, mode: PlayMode = 'lesson') => setPlaying({ lesson, mode });

  if (playing) {
    const unit = unitOfLesson(playing.lesson.id);
    const after = playing.mode === 'lesson' ? nextLesson({ ...getProgress(), lessons: { ...getProgress().lessons, [playing.lesson.id]: { stars: 1 } } }, PATH_SHAPE) : null;
    const nextL = after ? lessonById(after) : undefined;
    return (
      <LessonPlayer
        key={playing.lesson.id + playing.mode}
        lesson={playing.lesson} mode={playing.mode} env={env} color={playing.mode === 'daily' ? '#ffb347' : unit?.color ?? '#ffb347'}
        onExit={() => setPlaying(null)}
        onNext={nextL ? () => start(nextL) : undefined}
        nextTitle={nextL?.title}
        onFinish={(stars, mistakes) => {
          const p = getProgress();
          const shape = PATH_SHAPE;
          const out = playing.mode === 'daily'
            ? solveDaily(p, shape, utc, daily.id, today)
            : playing.mode === 'placement'
              ? (mistakes <= 1 ? passPlacement(p, shape, unit!.id, today) : null)
              : completeLesson(p, shape, playing.lesson.id, stars, today);
          if (out) setProgress(out.progress);
          return out;
        }}
      />
    );
  }

  const st = streak(progress, today);
  return (
    <div className="learn" data-testid="learn">
      <div className="learn-top">
        <button className="icon-btn" onClick={onHome} aria-label="Home" data-testid="learn-home">⌂</button>
        <h1 className="learn-title">Learn</h1>
        <div className="learn-chips">
          <span className={`chip chip-streak ${st > 0 ? 'lit' : ''}`} title="Daily streak" data-testid="streak">🔥 {st}</span>
          <span className="chip chip-xp" title="Total XP" data-testid="xp">⚡ {progress.xp}</span>
          {progress.freezes > 0 && <span className="chip chip-freeze" title="Streak freeze ready: one missed day won't break your streak">❄</span>}
          <span className={`chip chip-sync ${sync}`} title={sync === 'synced' ? 'Synced to your account' : sync === 'offline' ? 'Offline — saved on this device' : 'Saved on this device (sign up to sync)'}>{sync === 'synced' ? '☁️' : sync === 'offline' ? '📴' : '📱'}</span>
        </div>
      </div>
      <div className="learn-tabs" role="tablist">
        {(['path', 'daily', 'badges'] as LearnTab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`learn-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t === 'path' ? 'Path' : t === 'daily' ? <>Daily{!progress.daily[utc] && <i className="dot" />}</> : 'Badges'}
          </button>
        ))}
      </div>

      <div className="learn-scroll" key={tab}>
        {tab === 'path' && <PathMap onStart={start} />}
        {tab === 'daily' && <DailyTab onStart={() => start({ id: `daily-${utc}`, title: 'Daily puzzle', icon: '📅', minutes: 1, steps: [{ kind: 'puzzle', puzzle: daily }] }, 'daily')} />}
        {tab === 'badges' && <BadgesTab pieceSet={env.pieceSet} />}
      </div>

      {tab === 'path' && next && (
        <div className="learn-cta">
          <button className="btn primary wide" onClick={() => start(lessonById(next)!)} data-testid="continue-learning">
            {Object.keys(progress.lessons).length ? 'Continue' : 'Start'}: {lessonById(next)!.title}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- path map

function PathMap({ onStart }: { onStart: (l: Lesson, mode?: PlayMode) => void }) {
  const progress = useProgress();
  const current = nextLesson(progress, PATH_SHAPE);
  const ref = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.node.current');
    el?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div className="path" ref={ref} data-testid="path-map">
      {progress.rankedUnlocked && <div className="ranked-banner">🎓 Path complete — ranked play unlocked!</div>}
      {UNITS.map((u) => (
        <UnitSection key={u.id} unit={u} current={current} nudge={nudge} onNudge={(id) => { setNudge(id); setTimeout(() => setNudge(null), 1500); }} onStart={onStart} />
      ))}
    </div>
  );
}

function UnitSection({ unit, current, nudge, onNudge, onStart }: {
  unit: Unit; current: string | null; nudge: string | null; onNudge: (id: string) => void; onStart: (l: Lesson, mode?: PlayMode) => void;
}) {
  const progress = useProgress();
  const ids = unit.lessons.map((l) => l.id);
  const done = ids.filter((id) => isDone(progress, id)).length;
  const complete = unitDone(progress, { lessons: ids });
  const badge = BADGES.find((b) => b.id === UNIT_BADGE[unit.id]);
  const ROW = 130;
  const W = 300;
  const pts = unit.lessons.map((_, k) => ({ x: W / 2 + WIGGLE[(k + unit.index * 2) % WIGGLE.length], y: 56 + k * ROW }));
  const trophy = { x: W / 2 + WIGGLE[(unit.lessons.length + unit.index * 2) % WIGGLE.length], y: 56 + unit.lessons.length * ROW };
  const all = [...pts, trophy];
  const curve = (list: { x: number; y: number }[]) =>
    list.map((p, k) => (k === 0 ? `M${p.x} ${p.y}` : `C${list[k - 1].x} ${list[k - 1].y + ROW / 2} ${p.x} ${p.y - ROW / 2} ${p.x} ${p.y}`)).join(' ');
  const firstTodo = ids.findIndex((id) => !isDone(progress, id));
  const reached = complete ? all.length : firstTodo;
  const d = curve(all);
  const dDone = reached > 0 ? curve(all.slice(0, reached + (complete ? 0 : 1))) : '';
  const firstOpen = isUnlocked(progress, PATH_SHAPE, ids[0]);

  return (
    <section className={`unit ${complete ? 'unit-done' : ''} ${firstOpen ? '' : 'unit-locked'}`} style={{ ['--unit' as string]: unit.color }} data-testid={`unit-${unit.id}`}>
      <header className="unit-head">
        <div className="unit-index">Unit {unit.index}</div>
        <h2>{unit.title}</h2>
        <p>{unit.blurb}</p>
        <div className="unit-meter"><div style={{ width: `${(done / ids.length) * 100}%` }} /></div>
        <div className="unit-foot">
          <span>{done}/{ids.length} lessons</span>
          {unit.placement && !complete && (
            <button className="btn ghost small" onClick={() => onStart(unit.placement!, 'placement')} data-testid="placement">Know chess? Test out ⤼</button>
          )}
        </div>
      </header>
      <div className="unit-path" style={{ height: trophy.y + 64 }}>
        <svg className="path-line" width={W} height={trophy.y + 64} viewBox={`0 0 ${W} ${trophy.y + 64}`} aria-hidden="true">
          <path d={d} className="path-bg" />
          {dDone && <path d={dDone} className="path-fg" />}
        </svg>
        {unit.lessons.map((l, k) => {
          const rec = progress.lessons[l.id];
          const open = isUnlocked(progress, PATH_SHAPE, l.id);
          const state = rec ? 'done' : l.id === current ? 'current' : open ? 'open' : 'locked';
          return (
            <div key={l.id} className={`node-wrap ${pts[k].x > W / 2 ? 'side-l' : 'side-r'}`} style={{ left: pts[k].x, top: pts[k].y }}>
              {state === 'current' && <div className="node-bubble">START</div>}
              <button
                className={`node ${state} ${nudge === l.id ? 'shake' : ''}`}
                onClick={() => (state === 'locked' ? onNudge(l.id) : onStart(l))}
                aria-label={`${l.title}${rec ? `, ${rec.stars} stars` : state === 'locked' ? ', locked' : ''}`}
                data-testid={`node-${l.id}`}
              >
                <span className="node-icon">{state === 'locked' ? '🔒' : l.icon}</span>
              </button>
              {rec && <Stars n={rec.stars} size="sm" />}
              <div className="node-label">{l.title}<small>{l.minutes} min</small></div>
              {nudge === l.id && <div className="node-tip">Finish the lessons before this one first</div>}
            </div>
          );
        })}
        {badge && (
          <div className={`node-wrap trophy-wrap ${trophy.x > W / 2 ? 'side-l' : 'side-r'}`} style={{ left: trophy.x, top: trophy.y }}>
            <div className={`trophy ${progress.badges[badge.id] ? 'won' : ''}`} title={badge.desc}>{badge.icon}</div>
            <div className="node-label">{badge.name}{badge.reward ? <small>Reward: {SKIN_NAMES[badge.reward.skin]}</small> : unit.id === 'strategy' ? <small>Unlocks ranked</small> : null}</div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- daily

function DailyTab({ onStart }: { onStart: () => void }) {
  const progress = useProgress();
  const utc = utcDay();
  const p = dailyFor(utc);
  const solved = !!progress.daily[utc];
  const today = localDay();
  const week = Array.from({ length: 7 }, (_, k) => addDays(today, k - 6));
  return (
    <div className="daily" data-testid="daily">
      <div className="daily-card">
        <div className="daily-date">{new Date(`${utc}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</div>
        <h2>Daily puzzle</h2>
        <p>{p.prompt}</p>
        <CardRow cards={[...(p.hand ?? []), ...p.cards]} />
        {solved ? (
          <div className="daily-done" data-testid="daily-solved">✓ Solved today — come back tomorrow for a new one</div>
        ) : (
          <button className="btn primary wide" onClick={onStart} data-testid="daily-start">Solve · +20 XP</button>
        )}
        <small className="daily-note">Same puzzle for everyone, every day.</small>
      </div>
      <div className="week">
        <h3>This week</h3>
        <div className="week-row">
          {week.map((d) => {
            const on = progress.days.includes(d);
            const frozen = progress.frozen.includes(d);
            return (
              <div key={d} className={`day ${on ? 'on' : ''} ${frozen ? 'frozen' : ''} ${d === today ? 'today' : ''}`}>
                <span>{frozen ? '❄' : on ? '🔥' : '·'}</span>
                <small>{new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' })}</small>
              </div>
            );
          })}
        </div>
        <p className="week-note">{progress.freezes > 0 ? '❄ Streak freeze ready — miss one day and your streak survives.' : 'Streak freeze used. A 7-day streak earns a new one.'}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- badges & rewards

function BadgesTab({ pieceSet }: { pieceSet: 'arcane' | 'classic' }) {
  const progress = useProgress();
  const owned = ownedSkins(progress);
  const equip = (side: 'w' | 'b', skin: WhiteSkin | BlackSkin) => setProgress(equipSkin(getProgress(), side, skin));
  const lockedBy = (skin: string) => BADGES.find((b) => b.reward?.skin === skin);
  return (
    <div className="badges-tab" data-testid="badges">
      <div className={`ranked-card ${progress.rankedUnlocked ? 'on' : ''}`} data-testid="ranked-status">
        <span>{progress.rankedUnlocked ? '🎓' : '🔒'}</span>
        <div><b>Ranked play {progress.rankedUnlocked ? 'unlocked' : 'locked'}</b><small>{progress.rankedUnlocked ? 'You finished the learning path.' : 'Finish all 5 units of the path to unlock ranked Quick Match.'}</small></div>
      </div>
      <h3>Badges <small>{Object.keys(progress.badges).length}/{BADGES.length}</small></h3>
      <div className="badge-grid">
        {BADGES.map((b) => {
          const got = progress.badges[b.id];
          return (
            <div key={b.id} className={`badge-tile ${got ? 'got' : ''}`} data-testid={`badge-${b.id}`}>
              <span className="badge-medal">{b.icon}</span>
              <b>{b.name}</b>
              <small>{b.desc}</small>
              {b.reward && <em>{got ? '✓ ' : '🎁 '}{SKIN_NAMES[b.reward.skin]}</em>}
            </div>
          );
        })}
      </div>
      <h3>Piece skins</h3>
      {(['w', 'b'] as const).map((side) => (
        <div key={side} className="skin-row">
          {(side === 'w' ? (['ember', 'frost', 'gilded'] as const) : (['tide', 'rose', 'aurora'] as const)).map((skin) => {
            const has = (owned[side] as string[]).includes(skin);
            const on = progress.skins[side] === skin;
            return (
              <button key={skin} className={`skin-tile skin-w-${side === 'w' ? skin : 'ember'} skin-b-${side === 'b' ? skin : 'tide'} ${on ? 'on' : ''}`} disabled={!has}
                onClick={() => equip(side, skin)} data-testid={`skin-${skin}`}>
                <span className="skin-pieces">
                  <Piece piece={side === 'w' ? 'K' : 'k'} set={pieceSet === 'classic' ? 'arcane' : pieceSet} />
                  <Piece piece={side === 'w' ? 'N' : 'n'} set={pieceSet === 'classic' ? 'arcane' : pieceSet} />
                </span>
                <b>{SKIN_NAMES[skin]}</b>
                <small>{on ? 'Equipped' : has ? 'Tap to equip' : `🔒 ${lockedBy(skin)?.name ?? ''}`}</small>
              </button>
            );
          })}
        </div>
      ))}
      <p className="skins-note">Skins apply to the Arcane Forge set in 2D and 3D.</p>
    </div>
  );
}
