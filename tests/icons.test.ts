import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGES } from '../src/learn/progress';
import { UNITS } from '../src/learn/content';
import { isIconName } from '../src/ui/icons';

/** Emoji and pictographic/symbol blocks that must not appear in UI code (comments are allowed). */
const SYMBOLS = /[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u25A0-\u27BF\u2900-\u297F\u2B00-\u2BFF\u{1F000}-\u{1FAFF}\uFE0F\u2039\u203A\u2298\u22EF]/u;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const code = (line: string) => line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();

describe('icons: Lucide only, no emoji', () => {
  it('no emoji or symbol glyphs in app source (outside comments)', () => {
    const hits: string[] = [];
    for (const p of files('src')) {
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        const c = code(l);
        if (c.startsWith('*') || c.startsWith('/*')) return;
        if (SYMBOLS.test(c)) hits.push(`${p}:${i + 1}: ${c.slice(0, 80)}`);
      });
    }
    expect(hits).toEqual([]);
  });
  it('every badge and lesson names a known icon', () => {
    for (const b of BADGES) expect(isIconName(b.icon), b.id).toBe(true);
    for (const u of UNITS) for (const l of [...u.lessons, ...(u.placement ? [u.placement] : [])]) expect(isIconName(l.icon), l.id).toBe(true);
  });
});
