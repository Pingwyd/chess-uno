/**
 * Procedural 3D pieces. Every piece is a handful of primitives (lathes, spheres,
 * extrusions) merged into one geometry per material slot, so a piece costs at
 * most five draw calls and nothing is downloaded.
 *
 * Local frame: base on y=0, the piece's face looks down +z, 1 unit = 1 square.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceType } from '../../rules/chess';

export type Slot = 'body' | 'trim' | 'dark' | 'eye' | 'gem';
export type PieceGeometry = Partial<Record<Slot, THREE.BufferGeometry>>;
export type Set3D = 'arcane' | 'classic';

interface Part { geo: THREE.BufferGeometry; slot: Slot }

const v2 = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const lathe = (pts: [number, number][], seg = 32) => new THREE.LatheGeometry(v2(pts), seg);

function place(geo: THREE.BufferGeometry, o: { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(o.p ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.r ?? [0, 0, 0]))),
    new THREE.Vector3(...(o.s ?? [1, 1, 1])),
  );
  geo.applyMatrix4(m);
  return geo;
}

const sphere = (r: number, o: Parameters<typeof place>[1], seg = 20) => place(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), o);
const torus = (r: number, tube: number, y: number) => place(new THREE.TorusGeometry(r, tube, 10, 36), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
const gem = (r: number, o: Parameters<typeof place>[1]) => place(new THREE.OctahedronGeometry(r, 0), o);
const box = (w: number, h: number, d: number, o: Parameters<typeof place>[1]) => place(new THREE.BoxGeometry(w, h, d), o);
const cone = (r: number, h: number, o: Parameters<typeof place>[1]) => place(new THREE.ConeGeometry(r, h, 14), o);

/** Glowing eyes, slightly oval, set into a dark face. */
const eyes = (dx: number, y: number, z: number, r = 0.024): Part[] => [-1, 1].map((s) => ({ geo: sphere(r, { p: [s * dx, y, z], s: [1, 1.3, 0.6] }, 12), slot: 'eye' as Slot }));
/** The shadowed face under a hood/hat: a flattened dark sphere just in front of the head. */
const face = (r: number, y: number, z: number): Part => ({ geo: sphere(r * 0.82, { p: [0, y, z + r * 0.22], s: [1, 0.9, 0.45] }), slot: 'dark' });
const plinth = (r: number): Part[] => [
  { geo: lathe([[0, 0], [r, 0], [r + 0.012, 0.03], [r - 0.01, 0.07], [r - 0.06, 0.088], [r - 0.08, 0.11], [0, 0.11]]), slot: 'trim' },
  { geo: torus(r + 0.006, 0.006, 0.03), slot: 'gem' }, // thin glowing rim
];

function knightHead(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.21, 0);
  s.lineTo(0.2, 0);
  s.quadraticCurveTo(0.21, 0.13, 0.13, 0.26); // chest → throat
  s.quadraticCurveTo(0.2, 0.33, 0.31, 0.36); // jaw
  s.quadraticCurveTo(0.37, 0.4, 0.33, 0.47); // muzzle
  s.quadraticCurveTo(0.26, 0.55, 0.13, 0.6); // nose → forehead
  s.lineTo(0.09, 0.72); // ear
  s.lineTo(0.02, 0.62);
  s.quadraticCurveTo(-0.12, 0.62, -0.19, 0.46); // poll → crest
  s.quadraticCurveTo(-0.25, 0.3, -0.21, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.035, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -0.06);
  return g;
}

function arcane(type: PieceType): Part[] {
  switch (type) {
    case 'p':
      return [
        ...plinth(0.3),
        { geo: lathe([[0, 0.1], [0.25, 0.1], [0.23, 0.16], [0.19, 0.27], [0.14, 0.37], [0.11, 0.43], [0, 0.44]]), slot: 'body' },
        { geo: torus(0.12, 0.035, 0.42), slot: 'trim' },
        { geo: sphere(0.16, { p: [0, 0.57, 0], s: [1, 1.05, 1] }), slot: 'body' },
        { geo: cone(0.075, 0.16, { p: [0, 0.74, -0.04], r: [-0.55, 0, 0] }), slot: 'body' },
        face(0.12, 0.555, 0.085),
        ...eyes(0.045, 0.565, 0.16),
        { geo: gem(0.035, { p: [0, 0.69, 0.125] }), slot: 'gem' },
      ];
    case 'r': {
      const crenels: Part[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        crenels.push({ geo: box(0.11, 0.12, 0.085, { p: [Math.sin(a) * 0.245, 0.76, Math.cos(a) * 0.245], r: [0, a, 0] }), slot: 'body' });
      }
      return [
        ...plinth(0.34),
        { geo: lathe([[0, 0.1], [0.27, 0.1], [0.25, 0.2], [0.23, 0.5], [0.24, 0.56], [0.29, 0.6], [0.29, 0.7], [0.25, 0.71], [0, 0.71]]), slot: 'body' },
        { geo: torus(0.252, 0.022, 0.21), slot: 'trim' },
        { geo: torus(0.285, 0.026, 0.6), slot: 'trim' },
        ...crenels,
        { geo: sphere(0.11, { p: [0, 0.43, 0.2], s: [1, 0.85, 0.4] }), slot: 'dark' },
        ...eyes(0.045, 0.44, 0.238, 0.026),
        { geo: gem(0.075, { p: [0, 0.8, 0], s: [1, 1.6, 1] }), slot: 'gem' },
      ];
    }
    case 'n': {
      const mane: Part[] = [[-0.11, 0.6], [-0.17, 0.5], [-0.21, 0.4], [-0.23, 0.3]].map(([x, y], i) => ({
        geo: cone(0.04, 0.13, { p: [x - 0.03, y + 0.1, 0], r: [0, 0, 0.9 + i * 0.12] }),
        slot: 'trim' as Slot,
      }));
      return [
        ...plinth(0.32),
        { geo: place(knightHead(), { p: [0, 0.1, 0] }), slot: 'body' },
        ...mane,
        ...[-1, 1].map((s) => ({ geo: sphere(0.03, { p: [0.17, 0.6, s * 0.112], s: [1.3, 1, 0.6] }, 12), slot: 'eye' as Slot })),
        ...[-1, 1].map((s) => ({ geo: sphere(0.015, { p: [0.335, 0.5, s * 0.06] }, 8), slot: 'dark' as Slot })),
        { geo: gem(0.035, { p: [0.18, 0.7, 0], r: [0, 0, 0.4] }), slot: 'gem' },
      ];
    }
    case 'b':
      return [
        ...plinth(0.31),
        { geo: lathe([[0, 0.1], [0.24, 0.1], [0.22, 0.18], [0.17, 0.35], [0.13, 0.52], [0.12, 0.6], [0, 0.61]]), slot: 'body' },
        { geo: torus(0.17, 0.024, 0.36), slot: 'trim' },
        { geo: sphere(0.14, { p: [0, 0.7, 0] }), slot: 'body' },
        face(0.105, 0.69, 0.08),
        ...eyes(0.04, 0.695, 0.146),
        { geo: lathe([[0, 0.765], [0.2, 0.77], [0.19, 0.79], [0.12, 0.8], [0.09, 0.9], [0.05, 1.0], [0.02, 1.08], [0, 1.12]]), slot: 'body' },
        { geo: torus(0.17, 0.02, 0.785), slot: 'trim' },
        { geo: gem(0.04, { p: [0, 0.87, 0.1], s: [1, 1.3, 1] }), slot: 'gem' },
        { geo: sphere(0.032, { p: [0, 1.13, 0] }, 12), slot: 'gem' },
      ];
    case 'q': {
      const crown: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.sin(a) * 0.12, z = Math.cos(a) * 0.12;
        crown.push({ geo: cone(0.03, 0.11, { p: [x, 1.01, z] }), slot: 'trim' });
        crown.push({ geo: sphere(0.022, { p: [x, 1.075, z] }, 10), slot: 'gem' });
      }
      return [
        ...plinth(0.33),
        { geo: lathe([[0, 0.1], [0.27, 0.1], [0.25, 0.17], [0.2, 0.3], [0.15, 0.48], [0.12, 0.62], [0.14, 0.68], [0.11, 0.72], [0, 0.72]]), slot: 'body' },
        { geo: torus(0.13, 0.045, 0.7), slot: 'trim' },
        { geo: sphere(0.145, { p: [0, 0.84, 0] }), slot: 'body' },
        face(0.11, 0.83, 0.085),
        ...eyes(0.042, 0.835, 0.154),
        { geo: torus(0.12, 0.025, 0.96), slot: 'trim' },
        ...crown,
        { geo: gem(0.04, { p: [0, 0.48, 0.155], s: [1, 1.3, 0.8] }), slot: 'gem' },
      ];
    }
    case 'k':
      return [
        ...plinth(0.34),
        { geo: lathe([[0, 0.1], [0.28, 0.1], [0.26, 0.18], [0.21, 0.33], [0.17, 0.5], [0.15, 0.66], [0.17, 0.72], [0.13, 0.76], [0, 0.76]]), slot: 'body' },
        { geo: torus(0.15, 0.05, 0.74), slot: 'trim' },
        { geo: sphere(0.15, { p: [0, 0.89, 0] }), slot: 'body' },
        face(0.115, 0.88, 0.088),
        ...eyes(0.045, 0.885, 0.16),
        { geo: place(new THREE.CylinderGeometry(0.155, 0.135, 0.11, 28, 1), { p: [0, 1.02, 0] }), slot: 'trim' },
        { geo: box(0.05, 0.2, 0.05, { p: [0, 1.17, 0] }), slot: 'trim' },
        { geo: box(0.15, 0.05, 0.05, { p: [0, 1.2, 0] }), slot: 'trim' },
        { geo: gem(0.042, { p: [0, 1.025, 0.15], s: [1, 1.2, 0.8] }), slot: 'gem' },
        { geo: gem(0.04, { p: [0, 0.5, 0.18], s: [1, 1.3, 0.8] }), slot: 'gem' },
      ];
  }
}

function classic(type: PieceType): Part[] {
  const base: [number, number][] = [[0, 0], [0.33, 0], [0.33, 0.05], [0.28, 0.09], [0.23, 0.12]];
  switch (type) {
    case 'p':
      return [
        { geo: lathe([[0, 0], [0.29, 0], [0.29, 0.05], [0.24, 0.08], [0.2, 0.1], [0.13, 0.18], [0.1, 0.32], [0.16, 0.34], [0.16, 0.37], [0.09, 0.39], [0, 0.39]]), slot: 'body' },
        { geo: sphere(0.125, { p: [0, 0.49, 0] }, 24), slot: 'body' },
      ];
    case 'r': {
      const crenels: Part[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        crenels.push({ geo: box(0.13, 0.1, 0.09, { p: [Math.sin(a) * 0.2, 0.71, Math.cos(a) * 0.2], r: [0, a, 0] }), slot: 'body' });
      }
      return [{ geo: lathe([...base, [0.2, 0.2], [0.19, 0.5], [0.24, 0.55], [0.25, 0.66], [0.17, 0.66], [0, 0.66]]), slot: 'body' }, ...crenels];
    }
    case 'n':
      return [
        { geo: lathe([...base, [0.22, 0.16], [0, 0.16]]), slot: 'body' },
        { geo: place(knightHead(), { p: [0, 0.12, 0], s: [0.95, 1, 0.9] }), slot: 'body' },
      ];
    case 'b':
      return [
        { geo: lathe([...base, [0.13, 0.25], [0.1, 0.5], [0.17, 0.52], [0.17, 0.55], [0.1, 0.57], [0, 0.57]]), slot: 'body' },
        { geo: sphere(0.125, { p: [0, 0.71, 0], s: [1, 1.4, 1] }, 24), slot: 'body' },
        { geo: box(0.025, 0.12, 0.3, { p: [0.05, 0.76, 0], r: [0, 0, -0.6] }), slot: 'dark' },
        { geo: sphere(0.04, { p: [0, 0.91, 0] }, 12), slot: 'body' },
      ];
    case 'q': {
      const pts: Part[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push({ geo: sphere(0.03, { p: [Math.sin(a) * 0.15, 0.87, Math.cos(a) * 0.15] }, 10), slot: 'body' });
      }
      return [
        { geo: lathe([...base, [0.14, 0.3], [0.1, 0.6], [0.17, 0.66], [0.12, 0.7], [0.17, 0.86], [0.08, 0.89], [0, 0.89]]), slot: 'body' },
        ...pts,
        { geo: sphere(0.05, { p: [0, 0.94, 0] }, 14), slot: 'body' },
      ];
    }
    case 'k':
      return [
        { geo: lathe([...base, [0.15, 0.3], [0.11, 0.66], [0.18, 0.72], [0.13, 0.76], [0.18, 0.93], [0, 0.95]]), slot: 'body' },
        { geo: box(0.055, 0.2, 0.055, { p: [0, 1.04, 0] }), slot: 'body' },
        { geo: box(0.16, 0.055, 0.055, { p: [0, 1.06, 0] }), slot: 'body' },
      ];
  }
}

const cache = new Map<string, PieceGeometry>();

/**
 * Geometry for a piece type in a set. `mirror` flips the knight so both armies'
 * knights look across the board toward each other while still facing the camera.
 */
export function pieceGeometry(set: Set3D, type: PieceType, mirror = false): PieceGeometry {
  const key = `${set}:${type}:${mirror && type === 'n' ? 'm' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts = set === 'arcane' ? arcane(type) : classic(type);
  // Knights: the head profile is drawn snout toward +x; turn it about 30° toward the viewer so the
  // silhouette and one eye stay readable. Mirrored knights look the other way.
  const yaw = type === 'n' ? (mirror ? Math.PI + 0.55 : -0.55) : 0;
  const out: PieceGeometry = {};
  for (const slot of ['body', 'trim', 'dark', 'eye', 'gem'] as Slot[]) {
    const mine = parts.filter((p) => p.slot === slot).map((p) => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (type === 'n' && yaw) g.rotateY(yaw);
      return g;
    });
    if (!mine.length) continue;
    const merged = mergeGeometries(mine, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    out[slot] = merged;
  }
  cache.set(key, out);
  return out;
}

/** Visual height of each piece (for badges and check glow placement). */
export const PIECE_HEIGHT: Record<PieceType, number> = { p: 0.8, n: 0.9, b: 1.15, r: 0.9, q: 1.1, k: 1.25 };
