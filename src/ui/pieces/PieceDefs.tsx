/**
 * Shared SVG gradients + glow filters for the "Arcane Forge" set.
 * Rendered once near the app root; pieces reference them by id.
 */
export function PieceDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {/* Ember (light): ivory + gold, amber glow */}
        <linearGradient id="cu-ember-body" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.55" stopColor="#f3e6c8" />
          <stop offset="1" stopColor="#cdb084" />
        </linearGradient>
        <linearGradient id="cu-ember-trim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.45" stopColor="#f2b93b" />
          <stop offset="1" stopColor="#9a6208" />
        </linearGradient>
        <radialGradient id="cu-ember-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.45" stopColor="#ffc24a" />
          <stop offset="1" stopColor="#ff7a00" />
        </radialGradient>
        <radialGradient id="cu-ember-shade" cx="0.3" cy="0.25" r="0.9">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#7a4a10" stopOpacity="0.35" />
        </radialGradient>

        {/* Tide (dark): obsidian, teal + violet glow */}
        <linearGradient id="cu-tide-body" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#4a4f6b" />
          <stop offset="0.45" stopColor="#23263a" />
          <stop offset="1" stopColor="#0c0d18" />
        </linearGradient>
        <linearGradient id="cu-tide-trim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ffff0" />
          <stop offset="0.5" stopColor="#26c6c9" />
          <stop offset="1" stopColor="#8a5cff" />
        </linearGradient>
        <radialGradient id="cu-tide-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f2ffff" />
          <stop offset="0.45" stopColor="#5ff6ea" />
          <stop offset="1" stopColor="#7b4dff" />
        </radialGradient>
        <radialGradient id="cu-tide-shade" cx="0.3" cy="0.25" r="0.9">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>

        <filter id="cu-ember-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b" />
          <feFlood floodColor="#ffae3a" floodOpacity="0.75" />
          <feComposite in2="b" operator="in" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cu-tide-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b" />
          <feFlood floodColor="#2fe6d6" floodOpacity="0.85" />
          <feComposite in2="b" operator="in" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cu-eye-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}
