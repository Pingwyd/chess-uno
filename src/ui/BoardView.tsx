import { Component, lazy, Suspense, type ReactNode } from 'react';
import { Board, type BoardProps } from './Board';
import { webglAvailable } from './three/mapping';

export type BoardMode = '2d' | '3d';

// three.js + the 3D board load only when someone actually switches to 3D.
const Board3D = lazy(() => import('./three/Board3D'));
export const preload3D = () => { void import('./three/Board3D'); };

let webgl: boolean | null = null;
export const has3D = () => (webgl ??= webglAvailable());

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('3D board failed, falling back to 2D', e); this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** The board in the chosen renderer; 2D whenever WebGL is missing or the 3D bundle fails. */
export function BoardView({ mode, onUnavailable, ...props }: BoardProps & { mode: BoardMode; onUnavailable: () => void }) {
  const flat = <Board {...props} />;
  if (mode !== '3d' || !has3D()) return flat;
  return (
    <Fallback fallback={flat} onError={onUnavailable}>
      <Suspense fallback={<div className="board3d board3d-loading"><span>Forging the 3D board…</span></div>}>
        <Board3D {...props} />
      </Suspense>
    </Fallback>
  );
}
