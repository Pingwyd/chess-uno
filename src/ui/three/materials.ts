import * as THREE from 'three';
import type { Set3D, Slot } from './pieceGeometry';

export type PieceMaterials = Record<Slot, THREE.Material>;

const cache = new Map<string, PieceMaterials>();

/** Shared materials per set and side. Emissive slots are HDR (toneMapped off) so bloom picks them up. */
export function pieceMaterials(set: Set3D, white: boolean): PieceMaterials {
  const key = `${set}:${white ? 'w' : 'b'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let m: PieceMaterials;
  if (set === 'arcane') {
    m = white
      ? {
          // Ember: ivory porcelain with forged gold and molten amber eyes.
          body: new THREE.MeshStandardMaterial({ color: '#f3e7cc', roughness: 0.38, metalness: 0.04 }),
          trim: new THREE.MeshStandardMaterial({ color: '#f0b850', roughness: 0.42, metalness: 0.75, emissive: '#6a4000', emissiveIntensity: 0.45 }),
          dark: new THREE.MeshStandardMaterial({ color: '#2b1505', roughness: 0.85 }),
          eye: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(3.2), toneMapped: false }),
          gem: new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff7a1a', emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.2, toneMapped: false }),
        }
      : {
          // Tide: polished obsidian with teal-violet runes and sea-glass eyes.
          body: new THREE.MeshStandardMaterial({ color: '#1c1b38', roughness: 0.2, metalness: 0.45 }),
          trim: new THREE.MeshStandardMaterial({ color: '#2fd6c8', roughness: 0.3, metalness: 0.85, emissive: '#0b5e5a', emissiveIntensity: 0.5 }),
          dark: new THREE.MeshStandardMaterial({ color: '#030409', roughness: 0.9 }),
          eye: new THREE.MeshBasicMaterial({ color: new THREE.Color('#38f3e2').multiplyScalar(3.2), toneMapped: false }),
          gem: new THREE.MeshStandardMaterial({ color: '#9b70ff', emissive: '#8a5cff', emissiveIntensity: 2.6, roughness: 0.15, metalness: 0.2, toneMapped: false }),
        };
  } else {
    const body = white
      ? new THREE.MeshStandardMaterial({ color: '#efe5cf', roughness: 0.32, metalness: 0.02 })
      : new THREE.MeshStandardMaterial({ color: '#221e26', roughness: 0.24, metalness: 0.12 });
    const dark = new THREE.MeshStandardMaterial({ color: white ? '#8b7a5e' : '#0a090c', roughness: 0.6 });
    m = { body, trim: body, dark, eye: dark, gem: body };
  }
  cache.set(key, m);
  return m;
}
