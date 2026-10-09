import { useState } from 'react';
import { getProgress, setProgress, useProgress } from '../../learn/store';
import { BADGES, SKIN_NAMES, badgeGoal, equipSkin, localDay, ownedSkins, type BadgeGoal, type BlackSkin, type WhiteSkin } from '../../learn/progress';
import { OUTLINE_SHAPE, lessonTitle, unitTitle } from '../../learn/outline';
import { Piece, type PieceSet } from '../pieces';
import { Icon, asIcon } from '../icons';

const WHITE: WhiteSkin[] = ['ember', 'frost', 'gilded'];
const BLACK: BlackSkin[] = ['tide', 'rose', 'aurora'];
type Filter = 'all' | 'earned' | 'locked';

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const SETS: { id: PieceSet; name: string; blurb: string }[] = [
  { id: 'arcane', name: 'Arcane', blurb: 'Characterful pieces. Takes a colour skin per side.' },
  { id: 'classic', name: 'Classic', blurb: 'Standard Staunton-style pieces. No skins.' },
];

/** "Finish the The cards unit, 3/5 lessons" style requirement for a locked skin. */
export function goalText(g: BadgeGoal): string {
  switch (g.kind) {
    case 'unit': return `finish ${unitTitle(g.unit!)} unit, ${g.n}/${g.total} lessons`;
    case 'path': return `finish the whole path, ${g.n}/${g.total} lessons`;
    case 'streak': return `reach a ${g.total}-day streak, ${g.n}/${g.total} days`;
    case 'stars': return `earn 3 stars on ${g.total} lessons, ${g.n}/${g.total}`;
    case 'daily': return `solve ${g.total} daily puzzles, ${g.n}/${g.total}`;
    case 'xp': return `earn ${g.total} XP, ${g.n}/${g.total}`;
    default: return 'finish your first lesson';
  }
}

/** Piece sets and skins (choose a set, then a skin per side) plus badges, all from the learning path. */
export function CollectionTab({ pieceSet, onPieceSet, onLearn }: { pieceSet: PieceSet; onPieceSet: (p: PieceSet) => void; onLearn: (lesson?: string) => void }) {
  const p = useProgress();
  const owned = ownedSkins(p);
  const got = BADGES.filter((b) => p.badges[b.id]).length;
  const skinsOwned = owned.w.length + owned.b.length;
  const [filter, setFilter] = useState<Filter>('all');
  const arcane = pieceSet === 'arcane';
  const today = localDay();

  // Equipping a skin also switches to the Arcane set, since skins only exist there.
  const equip = (side: 'w' | 'b', skin: WhiteSkin | BlackSkin) => {
    setProgress(equipSkin(getProgress(), side, skin));
    if (!arcane) onPieceSet('arcane');
  };
  const lockedBy = (skin: string) => BADGES.find((b) => b.reward?.skin === skin);
  const shown = BADGES.filter((b) => (filter === 'all' ? true : filter === 'earned' ? !!p.badges[b.id] : !p.badges[b.id]))
    .sort((a, b) => Number(!!p.badges[b.id]) - Number(!!p.badges[a.id]));

  return (
    <div className="coll" data-testid="collection">
      <section className={`coll-hero skin-w-${p.skins.w} skin-b-${p.skins.b}`}>
        <div className="pedestal-stage" aria-hidden data-testid="pedestal">
          <div className="pedestal-piece pp-w"><Piece piece="K" set={pieceSet} /></div>
          <div className="pedestal-piece pp-b"><Piece piece="q" set={pieceSet} /></div>
          <div className="pedestal" />
        </div>
        <div className="coll-sum">
          <span className="eyebrow">Now playing</span>
          <b className="coll-now" data-testid="coll-now">{arcane ? <>{SKIN_NAMES[p.skins.w]} <i>vs</i> {SKIN_NAMES[p.skins.b]}</> : 'Classic set'}</b>
          <div className="coll-meters">
            <Meter label="Badges" n={got} of={BADGES.length} />
            <Meter label="Skins" n={skinsOwned} of={WHITE.length + BLACK.length} />
          </div>
        </div>
      </section>
      <p className="coll-explain">Pick a piece set, then a colour skin for each side.</p>

      <section className="set-card" data-testid="collection-sets">
        <h3><span className="step-n">1</span> Piece set</h3>
        <div className="set-tiles">
          {SETS.map((s) => {
            const on = pieceSet === s.id;
            return (
              <div key={s.id} className={`set-tile ${on ? 'on' : ''} skin-w-${p.skins.w} skin-b-${p.skins.b}`} data-testid={`set-tile-${s.id}`}>
                <div className="set-preview" aria-hidden>
                  {(['K', 'Q', 'N'] as const).map((pc) => <Piece key={pc} piece={pc} set={s.id} />)}
                  {(['k', 'q', 'n'] as const).map((pc) => <Piece key={pc} piece={pc} set={s.id} />)}
                </div>
                <div className="tile-body">
                  <b>{s.name}</b>
                  <small>{s.blurb}</small>
                </div>
                <EquipButton on={on} onClick={() => onPieceSet(s.id)} testid={`set-${s.id}`} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="set-card" data-testid="collection-skins">
        <h3><span className="step-n">2</span> Skins <small>Arcane set</small></h3>
        {!arcane && <p className="coll-note" data-testid="skins-classic-note"><Icon name="lightbulb" size={14} /> Skins are for the Arcane set. Equipping one switches you to Arcane.</p>}
        {(['w', 'b'] as const).map((side) => (
          <div key={side} className="coll-side">
            <span className="coll-label">{side === 'w' ? 'White side' : 'Black side'}</span>
            <div className="skin-tiles">
              {(side === 'w' ? WHITE : BLACK).map((skin) => {
                const has = (owned[side] as string[]).includes(skin);
                const selected = p.skins[side] === skin;
                const on = selected && arcane;
                const badge = lockedBy(skin);
                const goal = !has && badge ? badgeGoal(p, badge.id, OUTLINE_SHAPE, today) : null;
                return (
                  <div key={skin} className={`skin-tile ${on ? 'on' : ''} ${has ? '' : 'locked'} skin-w-${side === 'w' ? skin : 'ember'} skin-b-${side === 'b' ? skin : 'tide'}`} data-testid={`pskin-${skin}`}>
                    <span className="pskin-pieces" aria-hidden><Piece piece={side === 'w' ? 'K' : 'k'} set="arcane" /><Piece piece={side === 'w' ? 'N' : 'n'} set="arcane" /></span>
                    <div className="tile-body">
                      <b>{has ? null : <Icon name="lock" size={13} label="Locked" />}{SKIN_NAMES[skin]}</b>
                      {goal && badge ? (
                        <>
                          <small className="unlock" data-testid={`unlock-${skin}`}>Earn the {badge.name} badge: {goalText(goal)}.</small>
                          <i className="unlock-meter"><u style={{ width: `${(goal.n / goal.total) * 100}%` }} /></i>
                        </>
                      ) : <small>{side === 'w' ? 'White pieces' : 'Black pieces'}</small>}
                    </div>
                    {has ? (
                      <EquipButton on={on} label={selected && !arcane ? 'Use with Arcane' : undefined} onClick={() => equip(side, skin)} testid={`equip-${skin}`} />
                    ) : goal?.lesson ? (
                      <button className="link-btn go-lesson" onClick={() => onLearn(goal.lesson!)} data-testid={`go-${skin}`}>Go to lesson: {lessonTitle(goal.lesson)} <Icon name="arrow-right" size={14} /></button>
                    ) : goal?.kind === 'streak' ? (
                      <button className="link-btn go-lesson" onClick={() => onLearn()} data-testid={`go-${skin}`}>Keep your streak on the Learn path <Icon name="arrow-right" size={14} /></button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="set-card" data-testid="collection-badges">
        <div className="card-head">
          <h3>Badges <small>{got}/{BADGES.length}</small></h3>
        </div>
        <div className="seg seg-small fchips">
          {(['all', 'earned', 'locked'] as const).map((f) => (
            <button key={f} className={`seg-btn fchip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} data-testid={`badges-${f}`}>
              {f === 'all' ? 'All' : f === 'earned' ? `Earned ${got}` : `To earn ${BADGES.length - got}`}
            </button>
          ))}
        </div>
        <div className="coll-badges">
          {shown.map((b) => {
            const when = p.badges[b.id];
            return (
              <div key={b.id} className={`coll-badge ${when ? 'got' : ''}`} data-testid={`badge-${b.id}`}>
                <i><Icon name={asIcon(b.icon)} size={22} /></i>
                <div>
                  <b>{b.name}</b>
                  <small>{b.desc}</small>
                  <span className="coll-tags">
                    {when ? <em className="tag-got">Earned {day(when)}</em> : <em className="tag-lock"><Icon name="lock" size={11} /> Locked</em>}
                    {b.reward && <em className="tag-skin"><Icon name="gift" size={11} /> {SKIN_NAMES[b.reward.skin]}</em>}
                  </span>
                </div>
              </div>
            );
          })}
          {!shown.length && <p className="prof-note">{filter === 'earned' ? 'No badges yet. Finish your first lesson to earn one.' : 'Every badge earned.'}</p>}
        </div>
        <button className="btn ghost small coll-learn" onClick={() => onLearn()} data-testid="collection-learn"><Icon name="graduation-cap" size={16} /> Earn more on the Learn path</button>
      </section>
    </div>
  );
}

function EquipButton({ on, onClick, testid, label }: { on: boolean; onClick: () => void; testid: string; label?: string }) {
  return on
    ? <span className="equip-state" data-testid={testid} aria-pressed="true"><Icon name="check" size={15} /> Equipped</span>
    : <button className="btn small equip-btn" onClick={onClick} data-testid={testid} aria-pressed="false">{label ?? 'Equip'}</button>;
}

function Meter({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <div className="coll-meter">
      <span><b>{n}</b>/{of} {label}</span>
      <i><u style={{ width: `${(n / of) * 100}%` }} /></i>
    </div>
  );
}
