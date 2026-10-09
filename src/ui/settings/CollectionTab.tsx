import { useState } from 'react';
import { getProgress, setProgress, useProgress } from '../../learn/store';
import { BADGES, SKIN_NAMES, equipSkin, ownedSkins, type BlackSkin, type WhiteSkin } from '../../learn/progress';
import { Piece, type PieceSet } from '../pieces';
import { Icon, asIcon } from '../icons';

const WHITE: WhiteSkin[] = ['ember', 'frost', 'gilded'];
const BLACK: BlackSkin[] = ['tide', 'rose', 'aurora'];
type Filter = 'all' | 'earned' | 'locked';

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Badges & piece skins (moved out of Profile): everything you've unlocked on the learning path. */
export function CollectionTab({ pieceSet, onPieceSet, onLearn }: { pieceSet: PieceSet; onPieceSet: (p: PieceSet) => void; onLearn: () => void }) {
  const p = useProgress();
  const owned = ownedSkins(p);
  const got = BADGES.filter((b) => p.badges[b.id]).length;
  const skinsOwned = owned.w.length + owned.b.length;
  const [filter, setFilter] = useState<Filter>('all');
  const arcane = pieceSet === 'arcane';

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
        <div className="pedestal-stage" aria-hidden>
          <div className="pedestal-piece pp-w"><Piece piece="K" set={pieceSet} /></div>
          <div className="pedestal-piece pp-b"><Piece piece="q" set={pieceSet} /></div>
          <div className="pedestal" />
        </div>
        <div className="coll-sum">
          <span className="eyebrow">Your collection</span>
          <div className="coll-meters">
            <Meter label="Badges" n={got} of={BADGES.length} />
            <Meter label="Skins" n={skinsOwned} of={WHITE.length + BLACK.length} />
          </div>
          <small>{arcane ? `Playing ${SKIN_NAMES[p.skins.w]} vs ${SKIN_NAMES[p.skins.b]}.` : 'Classic pieces. Skins apply to the Arcane set.'}</small>
        </div>
      </section>

      <section className="set-card" data-testid="collection-skins">
        <div className="card-head">
          <h3>Piece skins</h3>
          <div className="seg seg-small">
            <button className={`seg-btn ${arcane ? 'on' : ''}`} onClick={() => onPieceSet('arcane')} data-testid="set-arcane">Arcane</button>
            <button className={`seg-btn ${!arcane ? 'on' : ''}`} onClick={() => onPieceSet('classic')} data-testid="set-classic">Classic</button>
          </div>
        </div>
        {(['w', 'b'] as const).map((side) => (
          <div key={side} className="coll-side">
            <span className="coll-label">{side === 'w' ? 'White pieces' : 'Black pieces'}</span>
            <div className="prof-skins">
              {(side === 'w' ? WHITE : BLACK).map((skin) => {
                const has = (owned[side] as string[]).includes(skin);
                const on = p.skins[side] === skin && arcane;
                return (
                  <button key={skin} className={`pskin skin-w-${side === 'w' ? skin : 'ember'} skin-b-${side === 'b' ? skin : 'tide'} ${on ? 'on' : ''}`} disabled={!has}
                    onClick={() => equip(side, skin)} data-testid={`pskin-${skin}`} aria-pressed={on}>
                    <span className="pskin-pieces"><Piece piece={side === 'w' ? 'K' : 'k'} set="arcane" /><Piece piece={side === 'w' ? 'N' : 'n'} set="arcane" /></span>
                    <b>{SKIN_NAMES[skin]}</b>
                    <small className={on ? 'eq' : ''}>{on ? <><Icon name="check" size={12} /> Equipped</> : has ? 'Tap to equip' : <><Icon name="lock" size={11} /> {lockedBy(skin)?.name ?? ''}</>}</small>
                  </button>
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
        <button className="btn ghost small coll-learn" onClick={onLearn} data-testid="collection-learn"><Icon name="graduation-cap" size={16} /> Earn more on the Learn path</button>
      </section>
    </div>
  );
}

function Meter({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <div className="coll-meter">
      <span><b>{n}</b>/{of} {label}</span>
      <i><u style={{ width: `${(n / of) * 100}%` }} /></i>
    </div>
  );
}
