import React from "react"; void React;
import { renderToStaticMarkup } from 'react-dom/server';
import { PieceDefs, Piece } from '../src/ui/pieces/index.tsx';
import { writeFileSync } from 'fs';
const rows = ['KQRBNP', 'kqrbnp'];
const html = renderToStaticMarkup(
  <div>
    <PieceDefs />
    {(['arcane', 'classic'] as const).map((set) => rows.map((r) => (
      <div style={{ display: 'flex' }}>
        {[...r].map((p, i) => (
          <div style={{ width: 110, height: 110, background: i % 2 ? '#3d5c69' : '#e2d3b2' }}><Piece piece={p} set={set} /></div>
        ))}
      </div>
    )))}
  </div>
);
writeFileSync('/tmp/cu/preview.html', `<html><body style="margin:0;background:#111">${html}<style>.piece-svg{width:100%;height:100%;display:block}</style></body></html>`);
