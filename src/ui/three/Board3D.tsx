/**
 * 3D renderer for the same GameState the 2D board shows. Lazy-loaded (three.js
 * never ships in the main bundle) and driven by the same interaction hook.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, FXAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, type Effect } from 'postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { colorOfPiece, typeOf, type Color } from '../../rules/chess';
import type { BoardArrow, BoardProps } from '../Board';
import { useBoardInteraction } from '../useBoardInteraction';
import { useReducedMotion, useSettings } from '../settings/store';
import { LOW_LEVEL, QualityGovernor, qualityFor, type Quality } from './quality';
import { cameraPreset, homeAzimuth, pieceYaw, squareToWorld, trackPieces, type CameraPreset, type TrackedPiece } from './mapping';
import { PIECE_HEIGHT, pieceGeometry, type Set3D } from './pieceGeometry';
import { pieceMaterials } from './materials';
import { Icon } from '../icons';

type Interaction = ReturnType<typeof useBoardInteraction>;

const TAU = Math.PI * 2;
/** Screenshot/debug slow motion: set window.__cu3dSlow = 4 to stretch animations. */
const slow = () => ((typeof window !== 'undefined' && (window as unknown as { __cu3dSlow?: number }).__cu3dSlow) || 1);
const CLICK_SLOP = 8; // px of drag before a tap stops counting as a click

export default function Board3D(props: BoardProps) {
  const { state, bottomColor, faceTopPieces, interactive, pieceSet, anim, onMove, onPromotion } = props;
  const ia = useBoardInteraction(state, interactive, onMove, onPromotion);
  const reduced = useReducedMotion();
  const [resetKey, setResetKey] = useState(0);
  const graphics = useSettings().graphics;
  const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  // Auto mode: a governor with hysteresis walks the quality ladder (effects first, DPR last).
  const governor = useRef(new QualityGovernor());
  const [autoLevel, setAutoLevel] = useState(0);
  useEffect(() => { governor.current = new QualityGovernor(); setAutoLevel(0); }, [graphics]);
  const q = qualityFor(graphics === 'high' ? 0 : graphics === 'low' ? LOW_LEVEL : autoLevel, deviceDpr);
  const step = (dir: 'decline' | 'incline') => { const g = governor.current; if (g[dir](performance.now())) setAutoLevel(g.level); };
  const set: Set3D = pieceSet === 'classic' ? 'classic' : 'arcane';

  return (
    <div className={`board3d ${interactive ? 'board3d-live' : ''}`} data-testid="board-3d">
      <Canvas
        shadows="percentage"
        dpr={q.dpr}
        camera={{ fov: 36, near: 0.1, far: 90, position: [0, 9, 9] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMappingExposure = 1.05; }}
      >
        {graphics === 'auto' && <PerformanceMonitor onDecline={() => step('decline')} onIncline={() => step('incline')} />}
        <color attach="background" args={['#0b0918']} />
        <fog attach="fog" args={['#0b0918', 18, 38]} />
        <Lights shadowMap={q.shadowMap} home={homeAzimuth(bottomColor)} />
        {q.reflections && <StudioEnvironment />}
        <CameraRig home={homeAzimuth(bottomColor)} mode={faceTopPieces ? 'pass' : 'play'} resetKey={resetKey} reduced={reduced} />
        <BoardMesh bottomColor={bottomColor} ia={ia} />
        <Highlights state={state} ia={ia} />
        <Pieces state={state} set={set} bottomColor={bottomColor} faceTop={faceTopPieces} anim={anim} ia={ia} reduced={reduced} contact={q.shadowMap === 0} />
        <Badges state={state} ia={ia} />
        {props.arrows && props.arrows.length > 0 && <Arrows3D arrows={props.arrows} />}
        {!reduced && q.particles && (
          <>
            <Sparkles count={36} scale={[13, 3.5, 13]} position={[0, 1.6, 0]} size={2.2} speed={0.25} opacity={0.55} color="#ffc27a" />
            <Sparkles count={30} scale={[13, 3.5, 13]} position={[0, 1.6, 0]} size={2} speed={0.2} opacity={0.5} color="#5ff2e6" />
          </>
        )}
        {q.bloom > 0 && <PostFX bloom={q.bloom} />}
        <TestHook ia={ia} quality={q} />
      </Canvas>
      <button className="icon-btn board3d-reset" onClick={() => setResetKey((k) => k + 1)} aria-label="Reset camera" title="Reset camera" data-testid="reset-camera"><Icon name="rotate-ccw" size={18} /></button>
    </div>
  );
}

// ------------------------------------------------------------ post-processing

/**
 * Bloom (only HDR emissives — eyes, gems, glows — cross the threshold) plus a soft vignette.
 * The scene pass is multisampled (MSAA) so edges stay as clean as the plain renderer's; GPUs
 * without multisampled render targets get FXAA instead. Buffers follow the canvas DPR, so a
 * DPR change never leaves a low-res composer being stretched over a sharp canvas.
 */
function PostFX({ bloom }: { bloom: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const composer = useMemo(() => {
    const samples = Math.min(4, gl.capabilities.maxSamples);
    const c = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: samples });
    c.addPass(new RenderPass(scene, camera));
    const effects: Effect[] = [
      new BloomEffect({ mipmapBlur: true, intensity: 0.75, luminanceThreshold: 0.9, luminanceSmoothing: 0.2, radius: 0.7, resolutionScale: bloom }),
      // Same ACES curve the plain renderer uses, so switching the composer on/off doesn't shift colours.
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new VignetteEffect({ offset: 0.32, darkness: 0.55 }),
    ];
    if (samples < 2) effects.push(new FXAAEffect());
    c.addPass(new EffectPass(camera, ...effects));
    return c;
  }, [gl, scene, camera, bloom]);
  useEffect(() => { composer.setSize(size.width, size.height); }, [composer, size.width, size.height, dpr]);
  useEffect(() => () => composer.dispose(), [composer]);
  // Priority 1 takes over rendering from react-three-fiber while mounted.
  useFrame((_, dt) => composer.render(dt), 1);
  return null;
}

// ------------------------------------------------------------ lights & camera

/**
 * Reflections for the metal/obsidian materials: a tiny procedural "studio" (a few glowing
 * panels) pre-filtered once with PMREM. No HDR download, a few KB of code.
 */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color('#0d0b1c');
    const panel = (color: string, intensity: number, pos: [number, number, number], size: [number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      studio.add(m);
    };
    panel('#ffd9a0', 1.3, [0, 6, 8], [12, 4]);
    panel('#7a5cff', 1.0, [-8, 3, -4], [6, 6]);
    panel('#2fe6d6', 1.0, [8, 3, -6], [6, 6]);
    panel('#fff3dc', 1.1, [0, 12, 0], [14, 14]);
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(studio, 0.03).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); studio.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); };
  }, [gl, scene]);
  return null;
}

/** Key light stays behind the viewer's shoulder, so the near army's faces are lit after a Reverse too. */
function Lights({ shadowMap, home }: { shadowMap: number; home: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    let d = (((home - g.rotation.y) % TAU) + TAU) % TAU;
    if (d > Math.PI) d -= TAU;
    g.rotation.y += d * Math.min(1, dt * 2.5);
  });
  return (
    <group ref={group} rotation={[0, home, 0]}>
      <hemisphereLight args={['#b8a6ff', '#2a1a10', 0.55]} />
      <directionalLight
        position={[5, 11, 7]}
        intensity={2.4}
        color="#ffe6c2"
        castShadow={shadowMap > 0}
        shadow-mapSize={[shadowMap || 1024, shadowMap || 1024]}
        shadow-camera-left={-6.5}
        shadow-camera-right={6.5}
        shadow-camera-top={6.5}
        shadow-camera-bottom={-6.5}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={5}
      />
      <directionalLight position={[-6, 5, -7]} intensity={1.3} color="#57d8ff" />
      <pointLight position={[0, 3, 6.4]} intensity={9} distance={10} decay={2} color="#ff9a3c" />
      <pointLight position={[0, 3, -6.4]} intensity={7} distance={10} decay={2} color="#3fd8e6" />
    </group>
  );
}

/** Smallest camera distance (at this polar angle) that keeps the whole board and the tallest pieces in view. */
function fitDistance(camera: THREE.PerspectiveCamera, polar: number, aspect: number, margin = 0.97) {
  const cam = camera.clone();
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const pts: THREE.Vector3[] = [];
  for (const x of [-4.5, 4.5]) for (const z of [-4.5, 4.5]) pts.push(new THREE.Vector3(x, 0, z));
  for (const x of [-3.5, 3.5]) for (const z of [-3.5, 3.5]) pts.push(new THREE.Vector3(x, 1.05, z));
  const fits = (d: number) => {
    cam.position.setFromSpherical(new THREE.Spherical(d, polar, 0));
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    return pts.every((p) => { const v = p.clone().project(cam); return Math.abs(v.x) <= margin && Math.abs(v.y) <= margin && v.z < 1; });
  };
  let lo = 5, hi = 60;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}

function CameraRig({ home, mode, resetKey, reduced }: { home: number; mode: 'pass' | 'play'; resetKey: number; reduced: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const preset: CameraPreset = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const p = cameraPreset(mode, aspect);
    const distance = fitDistance(camera, p.polar, aspect);
    return { ...p, distance, minDistance: Math.min(p.minDistance, distance * 0.6), maxDistance: Math.max(p.maxDistance, distance * 1.4) };
  }, [mode, size.width, size.height, camera]);
  const motion = useRef<{ from: THREE.Spherical; to: THREE.Spherical; t0: number; dur: number } | null>(null);
  const placed = useRef(false);

  // Aim a little past the centre so the board sits centred on screen (perspective makes the far half smaller).
  const shift = mode === 'pass' ? 0 : 0.55;
  const targetFor = (theta: number) => new THREE.Vector3(-Math.sin(theta) * shift, 0, -Math.cos(theta) * shift);
  const pivot = () => (controls ? controls.target.clone() : new THREE.Vector3());
  const current = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(pivot()));
  const apply = (s: THREE.Spherical) => {
    const t = targetFor(s.theta);
    camera.position.setFromSpherical(s).add(t);
    camera.lookAt(t);
    if (controls) { controls.target.copy(t); controls.update(); }
  };

  useEffect(() => {
    const to = new THREE.Spherical(preset.distance, preset.polar, home);
    if (!placed.current || reduced) {
      placed.current = true;
      apply(to);
      return;
    }
    const from = current();
    // Spin toward home: a half turn always goes the same way (like the 2D Reverse spin).
    let d = (((home - from.theta) % TAU) + TAU) % TAU;
    if (d > Math.PI + 0.05) d -= TAU;
    to.theta = from.theta + d;
    const big = Math.abs(d) > 1;
    motion.current = { from, to, t0: performance.now(), dur: (big ? 1300 : 700) * slow() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, resetKey, preset.polar, preset.distance, controls, shift]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => { motion.current = null; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame(() => {
    const m = motion.current;
    if (!m) return;
    const t = Math.min(1, (performance.now() - m.t0) / m.dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // Lift the camera a little mid-spin so the board reads as turning, not sliding.
    const lift = Math.sin(Math.PI * t) * (Math.abs(m.to.theta - m.from.theta) > 1 ? 0.18 : 0);
    const s = new THREE.Spherical(
      m.from.radius + (m.to.radius - m.from.radius) * e,
      Math.max(0.05, m.from.phi + (m.to.phi - m.from.phi) * e - lift),
      m.from.theta + (m.to.theta - m.from.theta) * e,
    );
    apply(s);
    if (t >= 1) motion.current = null;
  });

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minPolarAngle={preset.minPolar}
      maxPolarAngle={preset.maxPolar}
      minDistance={preset.minDistance}
      maxDistance={preset.maxDistance}
    />
  );
}

// ------------------------------------------------------------ board

const LIGHT_SQ = new THREE.MeshStandardMaterial({ color: '#e4d3b0', roughness: 0.6, metalness: 0.02 });
const DARK_SQ = new THREE.MeshStandardMaterial({ color: '#36596a', roughness: 0.5, metalness: 0.08 });
const SQ_GEO = new THREE.BoxGeometry(0.985, 0.08, 0.985);

function labelTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128; // 2x so the coordinates stay sharp on high-DPI screens
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.fillStyle = '#f0d9a2';
  g.font = '700 42px Cinzel, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; // clamped to the GPU maximum by three
  return t;
}

function BoardMesh({ bottomColor, ia }: { bottomColor: Color; ia: Interaction }) {
  const labels = useMemo(() => {
    const out: { key: string; tex: THREE.Texture; x: number; z: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const f = 'abcdefgh'[i];
      const r = String(i + 1);
      for (const side of [-1, 1]) {
        out.push({ key: `f${i}${side}`, tex: labelTexture(f), x: i - 3.5, z: side * 4.4 });
        out.push({ key: `r${i}${side}`, tex: labelTexture(r), x: side * 4.4, z: 3.5 - i });
      }
    }
    return out;
  }, []);
  const yaw = homeAzimuth(bottomColor);
  const halo = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(138,92,255,0.55)');
    grad.addColorStop(0.5, 'rgba(47,230,214,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  const squares = [];
  for (let sq = 0; sq < 64; sq++) {
    const [x, z] = squareToWorld(sq);
    const light = ((sq & 7) + (sq >> 3)) % 2 === 1;
    squares.push(
      <mesh
        key={sq}
        geometry={SQ_GEO}
        material={light ? LIGHT_SQ : DARK_SQ}
        position={[x, -0.04, z]}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta <= CLICK_SLOP) ia.click(sq); }}
        onPointerOver={() => { if (ia.targets.has(sq)) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />,
    );
  }
  const strip = (color: string, pos: [number, number, number], size: [number, number, number], k: string) => (
    <mesh key={k} position={pos} raycast={() => null}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} />
    </mesh>
  );
  return (
    <group>
      {squares}
      {/* frame slab with a gold lip */}
      <mesh position={[0, -0.3, 0]} receiveShadow castShadow raycast={() => null}>
        <boxGeometry args={[9.8, 0.52, 9.8]} />
        <meshStandardMaterial color="#1a1533" roughness={0.32} metalness={0.55} />
      </mesh>
      <mesh position={[0, -0.05, 0]} raycast={() => null}>
        <boxGeometry args={[9.9, 0.04, 9.9]} />
        <meshStandardMaterial color="#c9973f" roughness={0.3} metalness={1} />
      </mesh>
      <mesh position={[0, -0.03, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[9.7, 0.04, 9.7]} />
        <meshStandardMaterial color="#1d1838" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* glowing inlay: ember gold on White's side, tide teal on Black's, violet along the files */}
      {strip('#ffb347', [0, -0.005, 4.06], [8.18, 0.03, 0.05], 's1')}
      {strip('#2fe6d6', [0, -0.005, -4.06], [8.18, 0.03, 0.05], 's2')}
      {strip('#8a5cff', [4.06, -0.005, 0], [0.05, 0.03, 8.18], 's3')}
      {strip('#8a5cff', [-4.06, -0.005, 0], [0.05, 0.03, 8.18], 's4')}
      {labels.map((l) => (
        <mesh key={l.key} position={[l.x, -0.005, l.z]} rotation={[-Math.PI / 2, 0, yaw]} raycast={() => null}>
          <planeGeometry args={[0.36, 0.36]} />
          <meshBasicMaterial map={l.tex} transparent depthWrite={false} />
        </mesh>
      ))}
      {/* floor + soft arcane halo */}
      <mesh position={[0, -0.57, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#0a0816" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, -0.555, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[24, 24]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ highlights & badges

const noRay = () => null;
const flat: [number, number, number] = [-Math.PI / 2, 0, 0];

function Highlights({ state, ia }: { state: BoardProps['state']; ia: Interaction }) {
  const pulse = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (pulse.current) {
      const k = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 5);
      pulse.current.scale.setScalar(0.9 + 0.12 * k);
      pulse.current.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && 'opacity' in m) m.opacity = 0.55 * k + 0.25;
      });
    }
  });
  const out = [];
  for (const sq of ia.fromSquares) {
    const [x, z] = squareToWorld(sq);
    out.push(<mesh key={`f${sq}`} position={[x, 0.004, z]} rotation={flat} raycast={noRay}><planeGeometry args={[0.98, 0.98]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.22} depthWrite={false} /></mesh>);
  }
  for (const sq of ia.moveBadge.keys()) {
    const [x, z] = squareToWorld(sq);
    out.push(<mesh key={`t${sq}`} position={[x, 0.005, z]} rotation={flat} raycast={noRay}><planeGeometry args={[0.98, 0.98]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.38} depthWrite={false} /></mesh>);
  }
  if (ia.selected !== null) {
    const [x, z] = squareToWorld(ia.selected);
    out.push(
      <group key="sel" position={[x, 0.006, z]}>
        <mesh rotation={flat} raycast={noRay}><planeGeometry args={[0.98, 0.98]} /><meshBasicMaterial color="#2fe6d6" transparent opacity={0.35} depthWrite={false} /></mesh>
        <mesh rotation={flat} position={[0, 0.002, 0]} raycast={noRay}><ringGeometry args={[0.4, 0.47, 40]} /><meshBasicMaterial color={new THREE.Color('#5ff2e6').multiplyScalar(2)} toneMapped={false} transparent opacity={0.95} /></mesh>
      </group>,
    );
  }
  for (const [sq] of ia.hintTargets) {
    const [x, z] = squareToWorld(sq);
    const capture = !!state.pos.board[sq];
    out.push(
      capture ? (
        <mesh key={`c${sq}`} position={[x, 0.01, z]} rotation={flat} raycast={noRay}><ringGeometry args={[0.38, 0.47, 40]} /><meshBasicMaterial color={new THREE.Color('#ff5470').multiplyScalar(2.2)} toneMapped={false} transparent opacity={0.95} /></mesh>
      ) : (
        <mesh key={`d${sq}`} position={[x, 0.01, z]} rotation={flat} raycast={noRay}><circleGeometry args={[0.13, 28]} /><meshBasicMaterial color={new THREE.Color('#5ff2e6').multiplyScalar(1.8)} toneMapped={false} transparent opacity={0.9} /></mesh>
      ),
    );
  }
  const checks = [...ia.checked];
  return (
    <group>
      {out}
      {checks.map((sq) => {
        const [x, z] = squareToWorld(sq);
        return (
          <group key={`k${sq}`} position={[x, 0.012, z]}>
            <group ref={pulse}>
              <mesh rotation={flat} raycast={noRay}><circleGeometry args={[0.5, 40]} /><meshBasicMaterial color={new THREE.Color('#ff3250').multiplyScalar(1.6)} toneMapped={false} transparent opacity={0.6} depthWrite={false} /></mesh>
              <mesh rotation={flat} position={[0, 0.003, 0]} raycast={noRay}><ringGeometry args={[0.42, 0.5, 40]} /><meshBasicMaterial color={new THREE.Color('#ff5470').multiplyScalar(3)} toneMapped={false} transparent opacity={0.9} /></mesh>
            </group>
            <pointLight position={[0, 0.8, 0]} color="#ff3250" intensity={6} distance={3} decay={2} />
          </group>
        );
      })}
    </group>
  );
}

const badgeTextures = new Map<string, THREE.Texture>();
function badgeTexture(n: number, color: Color) {
  const key = `${n}${color}`;
  const hit = badgeTextures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  const grad = g.createLinearGradient(0, 8, 0, 88);
  if (color === 'w') { grad.addColorStop(0, '#ffe08a'); grad.addColorStop(1, '#ff9a1f'); } else { grad.addColorStop(0, '#8ffff0'); grad.addColorStop(1, '#1fa8b5'); }
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(48, 48, 36, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = color === 'w' ? '#3a1c00' : '#04202a';
  g.font = '900 46px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 48, 51);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  badgeTextures.set(key, t);
  return t;
}

/** Numbered move badges (1, 2, 3 for a multi-move turn) floating over the destination squares. */
function Badges({ state, ia }: { state: BoardProps['state']; ia: Interaction }) {
  return (
    <>
      {[...ia.moveBadge].map(([sq, n]) => {
        const [x, z] = squareToWorld(sq);
        const piece = state.pos.board[sq];
        const h = piece ? PIECE_HEIGHT[typeOf(piece)] : 0.35;
        return (
          <sprite key={`${sq}-${n}-${ia.badgeColor}`} position={[x + 0.3, h + 0.08, z]} scale={[0.36, 0.36, 1]} renderOrder={10} raycast={noRay}>
            <spriteMaterial map={badgeTexture(n, ia.badgeColor)} depthTest={false} depthWrite={false} transparent toneMapped={false} />
          </sprite>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------ analysis arrows

const ARROW_COLOR: Record<BoardArrow['tone'], string> = { best: '#3ee08f', played: '#ff6b5a', threat: '#ffb02e' };
const headGeometry = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.24); sh.lineTo(-0.25, -0.14); sh.lineTo(0.25, -0.14); sh.lineTo(0, 0.24);
  return new THREE.ShapeGeometry(sh);
})();
const labelTextures = new Map<string, THREE.Texture>();
function arrowLabelTexture(text: string, tone: BoardArrow['tone']) {
  const key = `${text}${tone}`;
  const hit = labelTextures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.beginPath();
  g.arc(48, 48, 38, 0, Math.PI * 2);
  g.fillStyle = ARROW_COLOR[tone];
  g.fill();
  g.fillStyle = '#0c1a12';
  g.font = '900 50px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 48, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelTextures.set(key, t);
  return t;
}

/** Glowing flat arrows on the board surface for the review's better line / played moves. */
function Arrows3D({ arrows }: { arrows: BoardArrow[] }) {
  return (
    <group>
      {arrows.map((a, i) => {
        const [x1, z1] = squareToWorld(a.from);
        const [x2, z2] = squareToWorld(a.to);
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len;
        const start = 0.2, end = len - 0.32;
        const shaft = Math.max(0.05, end - start);
        const yaw = Math.atan2(dx, dz);
        const color = new THREE.Color(ARROW_COLOR[a.tone]).multiplyScalar(1.8);
        const y = 0.03 + i * 0.002;
        return (
          <group key={i}>
            <mesh position={[x1 + ux * (start + shaft / 2), y, z1 + uz * (start + shaft / 2)]} rotation={[-Math.PI / 2, 0, yaw + Math.PI]} raycast={noRay} renderOrder={6}>
              <planeGeometry args={[0.2, shaft]} />
              <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} depthWrite={false} />
            </mesh>
            <mesh geometry={headGeometry} position={[x1 + ux * (end + 0.1), y + 0.001, z1 + uz * (end + 0.1)]} rotation={[-Math.PI / 2, 0, yaw + Math.PI]} raycast={noRay} renderOrder={6}>
              <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.92} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            {a.label && (
              <sprite position={[x2 + 0.28, 0.55, z2 - 0.28]} scale={[0.46, 0.46, 1]} renderOrder={11} raycast={noRay}>
                <spriteMaterial map={arrowLabelTexture(a.label, a.tone)} depthTest={false} depthWrite={false} transparent toneMapped={false} />
              </sprite>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------ pieces

function Pieces({ state, set, bottomColor, faceTop, anim, ia, reduced, contact }: {
  state: BoardProps['state']; set: Set3D; bottomColor: Color; faceTop: boolean; anim: BoardProps['anim']; ia: Interaction; reduced: boolean; contact: boolean;
}) {
  const track = useRef<{ pieces: TrackedPiece[]; nextId: number }>({ pieces: [], nextId: 1 });
  const board = state.pos.board;
  const result = useMemo(() => {
    const r = trackPieces(track.current.pieces, board, track.current.nextId, anim);
    track.current = { pieces: r.pieces, nextId: r.nextId };
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);
  const [dying, setDying] = useState<TrackedPiece[]>([]);
  useEffect(() => {
    if (!result.captured.length) return;
    setDying((d) => [...d, ...result.captured]);
    const ids = new Set(result.captured.map((c) => c.id));
    const t = setTimeout(() => setDying((d) => d.filter((p) => !ids.has(p.id))), reduced ? 0 : 900 * slow());
    return () => clearTimeout(t);
  }, [result, reduced]);

  return (
    <>
      {result.pieces.map((p) => (
        <Piece3D
          key={p.id}
          tp={p}
          set={set}
          yaw={pieceYaw(p.piece, bottomColor, faceTop)}
          selected={ia.selected === p.sq}
          movable={ia.movable.has(p.sq)}
          onClick={ia.click}
          reduced={reduced}
          contact={contact}
        />
      ))}
      {dying.map((p) => (
        <Piece3D key={`x${p.id}`} tp={p} set={set} yaw={pieceYaw(p.piece, bottomColor, faceTop)} selected={false} movable={false} onClick={() => {}} reduced={reduced} contact={contact} dying />
      ))}
    </>
  );
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Baked soft contact shadow, used when real-time shadows are off (low quality). */
let contactTex: THREE.Texture | null = null;
function contactTexture() {
  if (contactTex) return contactTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  contactTex = new THREE.CanvasTexture(c);
  return contactTex;
}

function Piece3D({ tp, set, yaw, selected, movable, onClick, reduced, contact, dying = false }: {
  tp: TrackedPiece; set: Set3D; yaw: number; selected: boolean; movable: boolean; onClick: (sq: number) => void; reduced: boolean; contact: boolean; dying?: boolean;
}) {
  const blob = useRef<THREE.Mesh>(null);
  const type = typeOf(tp.piece);
  const white = colorOfPiece(tp.piece) === 'w';
  const geo = pieceGeometry(set, type, !white);
  const mats = pieceMaterials(set, white);
  const ref = useRef<THREE.Group>(null);
  const motion = useRef<{ fx: number; fz: number; t0: number; dur: number; hop: number } | null>(null);
  const born = useRef(performance.now());
  const [x, z] = squareToWorld(tp.sq);

  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    if (g.userData.placed && !reduced) {
      const fx = g.position.x, fz = g.position.z;
      const d = Math.hypot(x - fx, z - fz);
      if (d > 0.01) motion.current = { fx, fz, t0: performance.now(), dur: Math.min(560, 260 + 55 * d) * slow(), hop: type === 'n' ? 0.55 + 0.1 * d : 0.12 + 0.06 * d };
    } else {
      g.position.set(x, 0, z);
      g.rotation.y = yaw;
      g.userData.placed = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, z]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    let y = 0;
    const m = motion.current;
    if (m) {
      const t = Math.min(1, (performance.now() - m.t0) / m.dur);
      const e = ease(t);
      g.position.x = m.fx + (x - m.fx) * e;
      g.position.z = m.fz + (z - m.fz) * e;
      y = Math.sin(Math.PI * t) * m.hop;
      if (t >= 1) motion.current = null;
    } else {
      g.position.x = x;
      g.position.z = z;
    }
    const lift = selected ? 0.16 : 0;
    const targetY = y + lift;
    g.position.y = m ? targetY : g.position.y + (targetY - g.position.y) * Math.min(1, dt * 14);
    // Turn smoothly to face the viewer (e.g. after a Reverse).
    let dy = (((yaw - g.rotation.y) % TAU) + TAU) % TAU;
    if (dy > Math.PI) dy -= TAU;
    g.rotation.y += reduced ? dy : dy * Math.min(1, dt * 5);
    if (dying) {
      const t = Math.min(1, (performance.now() - born.current - 180 * slow()) / (520 * slow()));
      const k = Math.max(0, t);
      g.scale.setScalar(Math.max(0.001, 1 - k));
      g.position.y = -0.2 * k + Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.25;
      g.rotation.y += dt * 6 * k;
    }
    // Keep the contact shadow on the board while the piece lifts or hops.
    if (blob.current) blob.current.position.y = 0.006 - g.position.y / Math.max(0.001, g.scale.y);
  });

  const handle = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP) onClick(tp.sq);
  };
  const slots = (['body', 'trim', 'dark', 'eye', 'gem'] as const).filter((s) => geo[s]);
  return (
    <group
      ref={ref}
      onClick={dying ? undefined : handle}
      onPointerOver={() => { if (movable) document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      {slots.map((s) => (
        <mesh key={s} geometry={geo[s]} material={mats[s]} castShadow={s === 'body' || s === 'trim'} receiveShadow={s === 'body'} />
      ))}
      {contact && (
        <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} raycast={noRay} renderOrder={1}>
          <planeGeometry args={[0.86, 0.86]} />
          <meshBasicMaterial map={contactTexture()} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

// ------------------------------------------------------------ test hook

/** Lets Playwright tap real squares through the 3D picking path. */
function TestHook({ ia, quality }: { ia: Interaction; quality: Quality }) {
  const iaRef = useRef(ia);
  iaRef.current = ia;
  const qRef = useRef(quality);
  qRef.current = quality;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls);
  const frames = useRef(0);
  useFrame(() => { frames.current++; });
  useEffect(() => {
    const w = window as unknown as { __cu3d?: unknown };
    w.__cu3d = {
      /** Point the camera somewhere specific (screenshots / close-ups). */
      view: (theta: number, phi: number, r: number, target: [number, number, number] = [0, 0, 0]) => {
        const t = new THREE.Vector3(...target);
        camera.position.setFromSpherical(new THREE.Spherical(r, phi, theta)).add(t);
        camera.lookAt(t);
        const c = controls as OrbitControlsImpl | null;
        if (c) { c.target.copy(t); c.update(); }
      },
      frames: () => frames.current,
      quality: () => qRef.current,
      movable: () => [...iaRef.current.movable],
      targets: () => [...iaRef.current.targets.keys()],
      project: (sq: number, y = 0.02) => {
        const [x, z] = squareToWorld(sq);
        const v = new THREE.Vector3(x, y, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
    };
    return () => { delete w.__cu3d; };
  }, [camera, gl, controls]);
  return null;
}
