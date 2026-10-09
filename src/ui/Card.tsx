import type { CardKind } from '../rules/cards';
import { Icon } from './icons';

const LABEL: Record<CardKind, string> = { '1': '1', '2': '2', '3': '3', skip: 'Skip', reverse: 'Reverse' };

function Glyph({ kind }: { kind: CardKind }) {
  if (kind === 'skip') {
    return (
      <svg viewBox="0 0 40 40" className="card-glyph-svg">
        <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="4.5" />
        <path d="M11 29 L29 11" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'reverse') {
    return (
      <svg viewBox="0 0 40 40" className="card-glyph-svg">
        <path d="M9 16 Q11 8 22 8 L28 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M25 3 L31 8 L25 13" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M31 24 Q29 32 18 32 L12 32" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M15 27 L9 32 L15 37" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <span className="card-num">{kind}</span>;
}

export function CardFace({ kind, size = 'md', className = '' }: { kind: CardKind; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  return (
    <div className={`card card-${size} card-${kind} ${className}`} aria-label={`${LABEL[kind]} card`}>
      <div className="card-inner">
        <span className="card-corner tl">{kind === 'skip' ? <Icon name="skip" size="1em" strokeWidth={2.6} /> : kind === 'reverse' ? <Icon name="reverse" size="1em" strokeWidth={2.6} /> : kind}</span>
        <div className="card-oval">
          <Glyph kind={kind} />
        </div>
        <span className="card-caption">{kind === 'skip' || kind === 'reverse' ? LABEL[kind] : kind === '1' ? 'move' : 'moves'}</span>
        <span className="card-corner br">{kind === 'skip' ? <Icon name="skip" size="1em" strokeWidth={2.6} /> : kind === 'reverse' ? <Icon name="reverse" size="1em" strokeWidth={2.6} /> : kind}</span>
      </div>
    </div>
  );
}

export function CardBack({ size = 'md', className = '' }: { size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  return (
    <div className={`card card-${size} card-back ${className}`} aria-hidden="true">
      <div className="card-inner">
        <div className="card-back-mark">
          <span>CHESS</span>
          <b>UNO</b>
        </div>
      </div>
    </div>
  );
}
