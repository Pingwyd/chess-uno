import * as THREE from 'three';
import type { Set3D, Slot } from './pieceGeometry';
import { activeSkins } from '../skins';

/** 3D colours for the badge-reward skins: [body, trim, trim emissive, eye, gem, gem emissive]. */
const SKIN_3D: Record<string, [string, string, string, string, string, string]> = {
  frost: ['#eef6ff', '#a9d8ff', '#1d4f7a', '#8be3ff', '#7fd0ff', '#3aa0ff'],
  gilded: ['#f6dc95', '#ffcc4d', '#7a4c06', '#fff0a0', '#ffd24a', '#ffb000'],
  rose: ['#2b1631', '#ff5fae', '#6a1446', '#ff8ad0', '#c86bff', '#b03aff'],
  aurora: ['#12261f', '#3ee49a', '#0d5a3a', '#6dffc0', '#3fd0ff', '#19c4ff'],
};

export type PieceMaterials = Record<Slot, THREE.Material>;

const cache = new Map<string, PieceMaterials>();

/** Shared materials per set and side. Emissive slots are HDR (toneMapped off) so bloom picks them up. */
export function pieceMaterials(set: Set3D, white: boolean): PieceMaterials {
  const skin = set === 'arcane' ? (white ? activeSkins().w : activeSkins().b) : '';
  const key = `${set}:${white ? 'w' : 'b'}:${skin}`;
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
    const sk = SKIN_3D[skin];
    if (sk) {
      const [body, trim, trimE, eye, gem, gemE] = sk;
      (m.body as THREE.MeshStandardMaterial).color.set(body);
      (m.trim as THREE.MeshStandardMaterial).color.set(trim);
      (m.trim as THREE.MeshStandardMaterial).emissive.set(trimE);
      (m.eye as THREE.MeshBasicMaterial).color.set(eye).multiplyScalar(3.2);
      (m.gem as THREE.MeshStandardMaterial).color.set(gem);
      (m.gem as THREE.MeshStandardMaterial).emissive.set(gemE);
    }
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
