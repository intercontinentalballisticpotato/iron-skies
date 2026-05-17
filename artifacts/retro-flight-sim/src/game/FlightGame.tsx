import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import HUD from './HUD';
import { Level } from '../data/levels';
import { soundManager } from './SoundManager';

// ─── Types ───────────────────────────────────────────────────────────────────
interface RadarContact { id: number; relX: number; relY: number; isMissile: boolean; isLocked: boolean; }
interface Bullet { id: number; pos: THREE.Vector3; dir: THREE.Vector3; life: number; isMissile: boolean; isHeatSeeker?: boolean; isBVR?: boolean; }
interface Enemy {
  id: number; pos: THREE.Vector3; vel: THREE.Vector3;
  health: number; maxHealth: number; phase: number;
  dead: boolean; type: string;
  shootTimer: number; shootCooldown: number;
  missileTimer: number; missileCooldown: number;
}
interface Explosion { id: number; pos: THREE.Vector3; scale: number; life: number; maxLife: number; }

// ─── Shared game state ref (avoid re-renders in game loop) ───────────────────
interface GameState {
  playerPos: THREE.Vector3;
  playerRot: THREE.Euler;
  playerVel: THREE.Vector3;
  pitch: number; yaw: number; roll: number;
  speed: number; health: number;
  bullets: Bullet[];
  enemies: Enemy[];
  explosions: Explosion[];
  kills: number;
  keys: Record<string, boolean>;
  fireTimer: number;
  missileTimer: number;
  missiles: number;
  warning: string;
  warningTimer: number;
  nextId: number;
  altitude: number;
  flares: number;
  flareTimer: number;
  rwrTimer: number;
  abWasHigh: boolean;
  missileMode: 'ir' | 'bvr';
  radarLockId: number | null;
  modeSwitchTimer: number;
}

function initEnemies(level: Level): Enemy[] {
  const enemies: Enemy[] = [];
  for (let i = 0; i < level.enemyCount; i++) {
    const angle = (i / level.enemyCount) * Math.PI * 2;
    const radius = 120 + Math.random() * 80;
    const health = level.enemyType === 'boss' ? 8 : level.enemyType === 'advanced' ? 4 : 2;
    enemies.push({
      id: i,
      pos: new THREE.Vector3(Math.cos(angle) * radius, 60 + Math.random() * 40, Math.sin(angle) * radius),
      vel: new THREE.Vector3(0, 0, 0),
      health, maxHealth: health,
      phase: Math.random() * Math.PI * 2,
      dead: false,
      type: level.enemyType,
      shootTimer: Math.random() * 2,
      shootCooldown: level.enemyType === 'boss' ? 1.0 : level.enemyType === 'advanced' ? 1.5 : 2.5,
      missileTimer: Math.random() * 6 + 4,
      missileCooldown: level.enemyType === 'boss' ? 4.5 : level.enemyType === 'advanced' ? 7.0 : 99999,
    });
  }
  return enemies;
}

// ─── Enemy Fighter Jet (proper jet silhouette) ───────────────────────────────
// Built nose-forward along +Z. lookAt() keeps nose pointed at travel direction.
function EnemyJetMesh({ pos, vel, type, health, maxHealth }: {
  pos: THREE.Vector3; vel: THREE.Vector3;
  type: string; health: number; maxHealth: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hpPct = health / maxHealth;

  // Per-type colour palette
  const col = useMemo(() => {
    if (type === 'boss')     return { body: '#8b0000', wing: '#660000', exhaust: '#ff8800', cockpit: '#ff2200' };
    if (type === 'advanced') return { body: '#5c4a1a', wing: '#4a3a10', exhaust: '#ffaa00', cockpit: '#ffcc44' };
    return                          { body: '#2a3a4a', wing: '#1e2e3e', exhaust: '#88aaff', cockpit: '#66ccff' };
  }, [type]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.copy(pos);
    // Orient nose toward direction of travel
    if (vel.lengthSq() > 4) {
      const lookTarget = pos.clone().add(vel.clone().normalize().multiplyScalar(20));
      g.lookAt(lookTarget);
    }
  });

  return (
    <group ref={groupRef}>

      {/* ══════════════════════════════════════════
          F-16 FIGHTING FALCON SILHOUETTE
          Nose = +Z  Tail = -Z  Right = +X  Up = +Y
      ══════════════════════════════════════════ */}

      {/* ── Fuselage – main body ── */}
      <mesh position={[0, 0.02, 0.5]}>
        <boxGeometry args={[1.55, 1.22, 9.0]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Forward fuselage (narrower, around cockpit area) */}
      <mesh position={[0, 0.10, 4.8]}>
        <boxGeometry args={[1.25, 1.05, 4.5]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Aft boat-tail (narrows toward nozzle) */}
      <mesh position={[0, -0.04, -4.5]}>
        <boxGeometry args={[1.12, 0.96, 3.8]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Nose cone — long, pointed */}
      <mesh position={[0, 0.12, 8.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.62, 4.0, 10]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Tail cone */}
      <mesh position={[0, 0, -6.6]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.50, 1.2, 10]} />
        <meshLambertMaterial color={col.body} />
      </mesh>

      {/* ── Chin intake — single large intake below nose (key F-16 feature) ── */}
      {/* Intake mouth — dark inside */}
      <mesh position={[0, -0.82, 5.5]}>
        <boxGeometry args={[1.22, 0.68, 2.4]} />
        <meshLambertMaterial color="#0a0a0a" />
      </mesh>
      {/* Sharp intake lip */}
      <mesh position={[0, -0.74, 6.75]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[1.28, 0.08, 0.14]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Intake shoulder (transitions into belly) */}
      <mesh position={[0, -0.68, 3.4]}>
        <boxGeometry args={[1.10, 0.52, 3.0]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Intake splitter plate */}
      <mesh position={[0, -0.60, 5.0]}>
        <boxGeometry args={[1.05, 0.06, 3.8]} />
        <meshLambertMaterial color={col.body} />
      </mesh>

      {/* ── LERX — Leading Edge Root Extensions (strakes blending wing to fuselage) ── */}
      <mesh position={[-1.30, 0.06, 2.6]} rotation={[0, 0.42, 0]}>
        <boxGeometry args={[2.60, 0.16, 6.0]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      <mesh position={[ 1.30, 0.06, 2.6]} rotation={[0, -0.42, 0]}>
        <boxGeometry args={[2.60, 0.16, 6.0]} />
        <meshLambertMaterial color={col.body} />
      </mesh>

      {/* ── Main wings — swept delta, highly raked leading edge ── */}
      {/* Inner panel */}
      <mesh position={[-4.40, -0.06, -0.2]} rotation={[0, 0.52, 0]}>
        <boxGeometry args={[7.2, 0.22, 5.2]} />
        <meshLambertMaterial color={col.wing} />
      </mesh>
      <mesh position={[ 4.40, -0.06, -0.2]} rotation={[0, -0.52, 0]}>
        <boxGeometry args={[7.2, 0.22, 5.2]} />
        <meshLambertMaterial color={col.wing} />
      </mesh>
      {/* Outer panel — extends to blunt tip */}
      <mesh position={[-8.50, -0.09, -2.2]}>
        <boxGeometry args={[2.6, 0.19, 2.8]} />
        <meshLambertMaterial color={col.wing} />
      </mesh>
      <mesh position={[ 8.50, -0.09, -2.2]}>
        <boxGeometry args={[2.6, 0.19, 2.8]} />
        <meshLambertMaterial color={col.wing} />
      </mesh>

      {/* ── Horizontal stabilizers — all-moving, swept ── */}
      <mesh position={[-2.5, -0.15, -5.0]} rotation={[0, 0.34, 0]}>
        <boxGeometry args={[3.8, 0.18, 2.8]} />
        <meshLambertMaterial color={col.wing} />
      </mesh>
      <mesh position={[ 2.5, -0.15, -5.0]} rotation={[0, -0.34, 0]}>
        <boxGeometry args={[3.8, 0.18, 2.8]} />
        <meshLambertMaterial color={col.wing} />
      </mesh>

      {/* ── Vertical tail — single fin, swept leading edge ── */}
      {/* Main fin */}
      <mesh position={[0, 2.1, -3.6]} rotation={[-0.24, 0, 0]}>
        <boxGeometry args={[0.24, 3.4, 4.0]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Root fillet */}
      <mesh position={[0, 0.75, -3.8]}>
        <boxGeometry args={[0.32, 1.0, 2.2]} />
        <meshLambertMaterial color={col.body} />
      </mesh>

      {/* ── Bubble canopy — prominent teardrop shape ── */}
      {/* Main glazing */}
      <mesh position={[0, 0.88, 4.0]}>
        <boxGeometry args={[0.84, 0.56, 2.4]} />
        <meshLambertMaterial color={col.cockpit} transparent opacity={0.88} />
      </mesh>
      {/* Windscreen (angled forward) */}
      <mesh position={[0, 0.72, 5.25]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[0.86, 0.10, 1.1]} />
        <meshLambertMaterial color={col.body} />
      </mesh>
      {/* Canopy rear fairing */}
      <mesh position={[0, 0.62, 2.6]} rotation={[0.30, 0, 0]}>
        <boxGeometry args={[0.75, 0.38, 1.2]} />
        <meshLambertMaterial color={col.body} />
      </mesh>

      {/* ── Single engine nozzle ── */}
      {/* Nozzle shroud */}
      <mesh position={[0, -0.02, -6.0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.58, 0.48, 1.8, 14]} />
        <meshLambertMaterial color="#181818" />
      </mesh>
      {/* Nozzle petals (6 segments) */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i}
            position={[Math.sin(a) * 0.50, Math.cos(a) * 0.50 - 0.02, -6.1]}
            rotation={[Math.PI / 2 + Math.cos(a) * 0.18, Math.sin(a) * 0.18, a]}>
            <boxGeometry args={[0.20, 0.07, 1.0]} />
            <meshLambertMaterial color="#242424" />
          </mesh>
        );
      })}
      {/* Afterburner glow */}
      <mesh position={[0, -0.02, -7.0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.40, 0.34, 1.0, 12]} />
        <meshBasicMaterial color={col.exhaust} />
      </mesh>

      {/* ── Wingtip AIM-9 Sidewinders ── */}
      {([-1, 1] as const).map(side => (
        <group key={side} position={[side * 9.85, -0.09, -1.8]}>
          {/* Missile body */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.115, 0.115, 3.2, 8]} />
            <meshLambertMaterial color={col.wing} />
          </mesh>
          {/* Seeker dome (forward) */}
          <mesh position={[0, 0, 1.7]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.115, 0.50, 8]} />
            <meshLambertMaterial color={col.cockpit} transparent opacity={0.80} />
          </mesh>
          {/* Canard fins (front, 4×) */}
          {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((fa, fi) => (
            <mesh key={fi} position={[Math.sin(fa) * 0.22, Math.cos(fa) * 0.22, 0.95]}
              rotation={[fa, 0, Math.PI / 2]}>
              <boxGeometry args={[0.04, 0.38, 0.38]} />
              <meshLambertMaterial color={col.wing} />
            </mesh>
          ))}
          {/* Tail fins (rear, 4×) */}
          {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((fa, fi) => (
            <mesh key={fi} position={[Math.sin(fa) * 0.24, Math.cos(fa) * 0.24, -1.05]}
              rotation={[fa, 0, Math.PI / 2]}>
              <boxGeometry args={[0.04, 0.50, 0.55]} />
              <meshLambertMaterial color={col.wing} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ── Underwing stores — inboard (tanks / bombs) ── */}
      {([-3.6, 3.6] as const).map(x => (
        <group key={x} position={[x, -0.38, 0.6]}>
          <mesh><boxGeometry args={[0.18, 0.42, 1.1]} /><meshLambertMaterial color={col.body} /></mesh>
          <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 2.8, 8]} />
            <meshLambertMaterial color="#1c1c1c" />
          </mesh>
          <mesh position={[0, -0.42, 1.55]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.22, 0.55, 8]} />
            <meshLambertMaterial color="#1c1c1c" />
          </mesh>
        </group>
      ))}
      {/* Outboard (missiles) */}
      {([-6.8, 6.8] as const).map(x => (
        <group key={x} position={[x, -0.28, -1.0]}>
          <mesh><boxGeometry args={[0.14, 0.32, 0.85]} /><meshLambertMaterial color={col.body} /></mesh>
          <mesh position={[0, -0.30, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 2.0, 8]} />
            <meshLambertMaterial color="#282828" />
          </mesh>
          <mesh position={[0, -0.30, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.14, 0.40, 8]} />
            <meshLambertMaterial color="#282828" />
          </mesh>
        </group>
      ))}

      {/* ── HP bar above enemy ── */}
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[6 * hpPct, 0.4, 0.4]} />
        <meshBasicMaterial color={hpPct > 0.5 ? '#44ff44' : hpPct > 0.25 ? '#ffaa00' : '#ff2200'} />
      </mesh>

      {type === 'boss' && <pointLight color="#ff4400" intensity={1.5} distance={50} />}
    </group>
  );
}

// ─── Cockpit interior (attached to camera, camera-space coordinates) ──────────
function Cockpit() {
  const { camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // ── Canopy arch — CatmullRom tube from lower-left over top to lower-right ──
  const archGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.620, -0.350, -0.880),
      new THREE.Vector3(-0.640, -0.060, -0.882),
      new THREE.Vector3(-0.600,  0.230, -0.920),
      new THREE.Vector3(-0.340,  0.480, -1.050),
      new THREE.Vector3( 0.000,  0.560, -1.200),
      new THREE.Vector3( 0.340,  0.480, -1.050),
      new THREE.Vector3( 0.600,  0.230, -0.920),
      new THREE.Vector3( 0.640, -0.060, -0.882),
      new THREE.Vector3( 0.620, -0.350, -0.880),
    ]);
    return new THREE.TubeGeometry(curve, 80, 0.038, 10, false);
  }, []);

  // ── Left MFD canvas: radar rings + blips ──
  const leftMFDTex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#000e04'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#005522'; ctx.lineWidth = 1;
    for (let r = 38; r <= 114; r += 38) {
      ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(128, 4); ctx.lineTo(128, 252); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 128); ctx.lineTo(252, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(46, 46); ctx.lineTo(210, 210); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(210, 46); ctx.lineTo(46, 210); ctx.stroke();
    // sweep line
    ctx.strokeStyle = '#00ee55'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(242, 80); ctx.stroke();
    // blips
    ctx.fillStyle = '#00ff77';
    [[162, 92], [96, 154], [194, 168], [110, 80]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // label
    ctx.fillStyle = '#00aa44'; ctx.font = 'bold 11px monospace';
    ctx.fillText('RADAR', 6, 14);
    ctx.fillText('RNG 80NM', 6, 246);
    ctx.strokeStyle = '#00aa44'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 252);
    return new THREE.CanvasTexture(cv);
  }, []);

  // ── Right MFD canvas: targeting / nav grid ──
  const rightMFDTex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#000e04'; ctx.fillRect(0, 0, 256, 256);
    // grid
    ctx.strokeStyle = '#004422'; ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const v = i * 32;
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(256, v); ctx.stroke();
    }
    // target brackets
    ctx.strokeStyle = '#00ff44'; ctx.lineWidth = 2.5;
    const bx = 82, by = 82, bw = 92;
    // TL
    ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.lineTo(bx, by); ctx.lineTo(bx + 18, by); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(bx + bw - 18, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + 18); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(bx, by + bw - 18); ctx.lineTo(bx, by + bw); ctx.lineTo(bx + 18, by + bw); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(bx + bw - 18, by + bw); ctx.lineTo(bx + bw, by + bw); ctx.lineTo(bx + bw, by + bw - 18); ctx.stroke();
    // center cross
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(118, 128); ctx.lineTo(138, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128, 118); ctx.lineTo(128, 138); ctx.stroke();
    // data readouts
    ctx.fillStyle = '#00cc44'; ctx.font = 'bold 11px monospace';
    ctx.fillText('TGT', 6, 14);
    ctx.fillText('ALT 28400', 6, 230);
    ctx.fillText('SPD  542', 6, 246);
    ctx.strokeStyle = '#00aa44'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 252);
    return new THREE.CanvasTexture(cv);
  }, []);

  useEffect(() => {
    scene.add(camera);
    const g = groupRef.current;
    if (!g) return;
    camera.add(g);
    return () => {
      camera.remove(g);
      scene.remove(camera);
    };
  }, [camera, scene]);

  // Panel tilt angle — shallow, facing pilot
  const PT = 0.16;

  return (
    <group ref={groupRef}>

      {/* ════ LIGHTING ════ */}
      <pointLight position={[0, -0.12, -0.90]} color="#33ff88" intensity={0.55} distance={1.1} />
      <pointLight position={[-0.30, -0.28, -0.87]} color="#00ff66" intensity={0.22} distance={0.50} />
      <pointLight position={[ 0.30, -0.28, -0.87]} color="#00ff66" intensity={0.22} distance={0.50} />

      {/* ════ CANOPY ARCH ════ */}
      <mesh>
        <primitive object={archGeometry} attach="geometry" />
        <meshLambertMaterial color="#181d18" />
      </mesh>

      {/* ════ CENTER SPINE (vertical strut behind HUD) ════ */}
      <mesh position={[0, 0.100, -0.940]} rotation={[0.10, 0, 0]}>
        <boxGeometry args={[0.030, 0.480, 0.022]} />
        <meshLambertMaterial color="#1e231e" />
      </mesh>

      {/* ════ INSTRUMENT PANEL ════ */}
      {/* Solid dark floor — fills all below panel, bleeds past screen edges */}
      <mesh position={[0, -0.650, -0.880]}>
        <boxGeometry args={[3.00, 0.70, 0.08]} />
        <meshLambertMaterial color="#0c100b" />
      </mesh>
      {/* Main panel face — shifted down so top sits at ~25% from screen bottom */}
      <mesh position={[0, -0.490, -0.876]} rotation={[PT, 0, 0]}>
        <boxGeometry args={[3.00, 0.300, 0.034]} />
        <meshLambertMaterial color="#151a13" />
      </mesh>
      {/* Raised center console */}
      <mesh position={[0, -0.475, -0.858]} rotation={[PT, 0, 0]}>
        <boxGeometry args={[0.310, 0.270, 0.018]} />
        <meshLambertMaterial color="#121712" />
      </mesh>
      {/* Panel top lip — visible edge */}
      <mesh position={[0, -0.342, -0.900]} rotation={[PT, 0, 0]}>
        <boxGeometry args={[3.00, 0.020, 0.046]} />
        <meshLambertMaterial color="#263020" />
      </mesh>
      {/* Green glow strip */}
      <mesh position={[0, -0.345, -0.897]} rotation={[PT, 0, 0]}>
        <boxGeometry args={[3.00, 0.006, 0.006]} />
        <meshBasicMaterial color="#00ff55" />
      </mesh>

      {/* ── LEFT MFD ── */}
      {/* Outer bezel */}
      <mesh position={[-0.370, -0.472, -0.858]} rotation={[PT, 0, 0]}>
        <boxGeometry args={[0.340, 0.220, 0.016]} />
        <meshLambertMaterial color="#0e130d" />
      </mesh>
      {/* Screen */}
      <mesh position={[-0.370, -0.472, -0.851]} rotation={[PT, 0, 0]}>
        <planeGeometry args={[0.296, 0.190]} />
        <meshBasicMaterial map={leftMFDTex} />
      </mesh>
      {/* Bezel screws */}
      {[[-0.535, -0.372], [-0.205, -0.372], [-0.535, -0.572], [-0.205, -0.572]].map(([sx, sy], i) => (
        <mesh key={i} position={[sx, sy, -0.851]} rotation={[PT, 0, 0]}>
          <circleGeometry args={[0.007, 6]} />
          <meshLambertMaterial color="#2a302a" />
        </mesh>
      ))}

      {/* ── RIGHT MFD ── */}
      <mesh position={[ 0.370, -0.472, -0.858]} rotation={[PT, 0, 0]}>
        <boxGeometry args={[0.340, 0.220, 0.016]} />
        <meshLambertMaterial color="#0e130d" />
      </mesh>
      <mesh position={[ 0.370, -0.472, -0.851]} rotation={[PT, 0, 0]}>
        <planeGeometry args={[0.296, 0.190]} />
        <meshBasicMaterial map={rightMFDTex} />
      </mesh>
      {[[ 0.205, -0.372], [ 0.535, -0.372], [ 0.205, -0.572], [ 0.535, -0.572]].map(([sx, sy], i) => (
        <mesh key={i} position={[sx, sy, -0.851]} rotation={[PT, 0, 0]}>
          <circleGeometry args={[0.007, 6]} />
          <meshLambertMaterial color="#2a302a" />
        </mesh>
      ))}

      {/* ── CENTER KEYPAD — colored button grid ── */}
      {Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 3 }, (_, col) => {
          const COLORS = ['#ff2200','#ffaa00','#00ff44','#00aaff','#ff44aa','#aaffaa','#aaff00','#ff8800','#00ffcc'];
          const idx = row * 3 + col;
          return (
            <mesh key={idx}
              position={[-0.076 + col * 0.076, -0.390 + (2 - row) * 0.076 - 0.110, -0.846]}
              rotation={[PT, 0, 0]}>
              <boxGeometry args={[0.058, 0.058, 0.010]} />
              <meshBasicMaterial color={COLORS[idx]} transparent opacity={0.75} />
            </mesh>
          );
        })
      )}

      {/* ── Small gauges flanking center console ── */}
      {([-0.175, -0.100, 0.100, 0.175] as number[]).map((x, i) => (
        <group key={i} position={[x, -0.488, -0.850]} rotation={[PT, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.034, 0.007, 8, 22]} />
            <meshLambertMaterial color="#303830" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.027, 22]} />
            <meshBasicMaterial color="#000e03" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, -0.4 + i * 0.5]}>
            <planeGeometry args={[0.002, 0.020]} />
            <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.002]}>
            <circleGeometry args={[0.003, 8]} />
            <meshBasicMaterial color="#ff8800" />
          </mesh>
        </group>
      ))}

      {/* Indicator LEDs — left panel strip */}
      {(['#ff2200', '#ffaa00', '#00ff44', '#00aaff'] as string[]).map((col, i) => (
        <mesh key={i} position={[-0.620, -0.378 - i * 0.044, -0.852]} rotation={[PT, 0, 0]}>
          <boxGeometry args={[0.032, 0.030, 0.008]} />
          <meshBasicMaterial color={col} transparent opacity={0.80} />
        </mesh>
      ))}
      {/* Right strip */}
      {(['#00ff44', '#ffaa00', '#00aaff', '#ff2200'] as string[]).map((col, i) => (
        <mesh key={i} position={[ 0.620, -0.378 - i * 0.044, -0.852]} rotation={[PT, 0, 0]}>
          <boxGeometry args={[0.032, 0.030, 0.008]} />
          <meshBasicMaterial color={col} transparent opacity={0.80} />
        </mesh>
      ))}

      {/* ════ HUD COMBINER ════ */}
      {/* Support arm — bridges from panel top to combiner bottom */}
      <mesh position={[0, -0.232, -0.898]} rotation={[0.14, 0, 0]}>
        <boxGeometry args={[0.028, 0.228, 0.020]} />
        <meshLambertMaterial color="#232823" />
      </mesh>
      {/* Frame — top bar */}
      <mesh position={[0, 0.074, -0.906]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.480, 8]} />
        <meshBasicMaterial color="#00ff44" transparent opacity={0.95} />
      </mesh>
      {/* Frame — bottom bar */}
      <mesh position={[0, -0.116, -0.906]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.480, 8]} />
        <meshBasicMaterial color="#00ff44" transparent opacity={0.95} />
      </mesh>
      {/* Frame — left side */}
      <mesh position={[-0.238, -0.021, -0.906]}>
        <cylinderGeometry args={[0.006, 0.006, 0.196, 8]} />
        <meshBasicMaterial color="#00ff44" transparent opacity={0.95} />
      </mesh>
      {/* Frame — right side */}
      <mesh position={[ 0.238, -0.021, -0.906]}>
        <cylinderGeometry args={[0.006, 0.006, 0.196, 8]} />
        <meshBasicMaterial color="#00ff44" transparent opacity={0.95} />
      </mesh>
      {/* Combiner glass tint */}
      <mesh position={[0, -0.021, -0.907]}>
        <planeGeometry args={[0.468, 0.184]} />
        <meshBasicMaterial color="#00ff44" transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* Corner joints */}
      {([[-0.238, 0.074], [0.238, 0.074], [-0.238, -0.116], [0.238, -0.116]] as [number,number][]).map(([cx,cy],i) => (
        <mesh key={i} position={[cx, cy, -0.906]}>
          <sphereGeometry args={[0.007, 8, 6]} />
          <meshBasicMaterial color="#00ff44" />
        </mesh>
      ))}

      {/* ════ CONTROL STICK ════ */}
      <mesh position={[0.012, -0.510, -0.808]}>
        <cylinderGeometry args={[0.016, 0.022, 0.110, 8]} />
        <meshLambertMaterial color="#252a24" />
      </mesh>
      <mesh position={[0.012, -0.452, -0.808]}>
        <sphereGeometry args={[0.024, 10, 8]} />
        <meshLambertMaterial color="#1a1e1a" />
      </mesh>
      {/* Red fire button */}
      <mesh position={[0.030, -0.443, -0.786]}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshBasicMaterial color="#ee2200" />
      </mesh>
      {/* Trigger guard ring */}
      <mesh position={[0.012, -0.500, -0.808]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.028, 0.006, 6, 16]} />
        <meshLambertMaterial color="#2a302a" />
      </mesh>

      {/* ════ THROTTLE — left console ════ */}
      <mesh position={[-0.618, -0.350, -0.858]}>
        <boxGeometry args={[0.068, 0.110, 0.048]} />
        <meshLambertMaterial color="#161b15" />
      </mesh>
      <mesh position={[-0.618, -0.285, -0.828]} rotation={[0.40, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.018, 0.120, 8]} />
        <meshLambertMaterial color="#363c34" />
      </mesh>
      <mesh position={[-0.618, -0.248, -0.806]}>
        <boxGeometry args={[0.040, 0.024, 0.032]} />
        <meshLambertMaterial color="#282e28" />
      </mesh>
    </group>
  );
}

// ─── Player bullet (cannon round) ─────────────────────────────────────────────
function BulletMesh({ pos }: { pos: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.position.copy(pos); });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.18, 4, 4]} />
      <meshBasicMaterial color="#ffff88" />
    </mesh>
  );
}

// ─── Missile mesh — AIM-9 (IR) or AIM-120 (BVR) ───────────────────────────────
const _fwdVec = new THREE.Vector3(0, 0, 1);
const _upVec  = new THREE.Vector3(0, 1, 0);

function MissileMesh({ pos, dir, isBVR }: { pos: THREE.Vector3; dir: THREE.Vector3; isBVR: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.copy(pos);
    const d = dir.clone().normalize();
    if (d.lengthSq() > 0.0001) {
      groupRef.current.quaternion.setFromUnitVectors(_fwdVec, d);
    }
  });

  // AIM-9M Sidewinder  — olive-green, round IR seeker dome, swept delta rear fins, small canards
  // AIM-120 AMRAAM    — grey, sharp nose cone, rectangular mid + tail fins
  const bodyColor    = isBVR ? '#7a8a96' : '#5e6b4a';
  const finColor     = isBVR ? '#4e6070' : '#3d4a30';
  const noseColor    = isBVR ? '#b8c8d4' : '#445038';
  const sensorColor  = '#1a1a22';               // IR seeker dome (AIM-9 only)
  const exhaustColor = isBVR ? '#88ccff' : '#ff8800';

  const fins4 = [0, Math.PI / 2, Math.PI, Math.PI * 1.5] as const;

  return (
    <group ref={groupRef}>

      {/* ── Main body ───────────────────────────────── */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.085, 0.085, isBVR ? 3.4 : 2.5, 10]} />
        <meshLambertMaterial color={bodyColor} />
      </mesh>

      {isBVR ? (
        <>
          {/* AIM-120: sharp pointed nose cone */}
          <mesh position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.085, 0.75, 10]} />
            <meshLambertMaterial color={noseColor} />
          </mesh>

          {/* AIM-120: mid-body cruciform fins */}
          {fins4.map((angle, i) => (
            <mesh key={`mf-${i}`} position={[Math.sin(angle)*0.26, Math.cos(angle)*0.26, 0.5]} rotation={[0,0,angle]}>
              <boxGeometry args={[0.50, 0.022, 0.38]} />
              <meshLambertMaterial color={finColor} />
            </mesh>
          ))}

          {/* AIM-120: rear tail fins — larger rectangular */}
          {fins4.map((angle, i) => (
            <mesh key={`tf-${i}`} position={[Math.sin(angle)*0.34, Math.cos(angle)*0.34, -1.4]} rotation={[0,0,angle]}>
              <boxGeometry args={[0.66, 0.022, 0.52]} />
              <meshLambertMaterial color={finColor} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* AIM-9M: round IR seeker dome — distinctive black sphere at nose */}
          <mesh position={[0, 0, 1.42]}>
            <sphereGeometry args={[0.096, 10, 10]} />
            <meshLambertMaterial color={sensorColor} />
          </mesh>

          {/* AIM-9M: nose body behind seeker */}
          <mesh position={[0, 0, 1.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.4, 10]} />
            <meshLambertMaterial color={noseColor} />
          </mesh>

          {/* AIM-9M: small forward canards (45° offset, near nose) */}
          {fins4.map((angle, i) => (
            <mesh key={`canard-${i}`} position={[Math.sin(angle+Math.PI/4)*0.18, Math.cos(angle+Math.PI/4)*0.18, 0.75]} rotation={[0,0,angle+Math.PI/4]}>
              <boxGeometry args={[0.30, 0.018, 0.20]} />
              <meshLambertMaterial color={finColor} />
            </mesh>
          ))}

          {/* AIM-9M: swept delta rear fins — wider than body, angled */}
          {fins4.map((angle, i) => (
            <mesh key={`fin-${i}`} position={[Math.sin(angle)*0.30, Math.cos(angle)*0.30, -0.95]} rotation={[0,0,angle]}>
              <boxGeometry args={[0.58, 0.022, 0.50]} />
              <meshLambertMaterial color={finColor} />
            </mesh>
          ))}
        </>
      )}

      {/* ── Exhaust plume ───────────────────────────── */}
      <mesh position={[0, 0, isBVR ? -1.85 : -1.38]}>
        <sphereGeometry args={[0.10, 7, 7]} />
        <meshBasicMaterial color={exhaustColor} />
      </mesh>
      <mesh position={[0, 0, isBVR ? -2.12 : -1.62]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.055, 0.55, 7]} />
        <meshBasicMaterial color={exhaustColor} transparent opacity={0.55} />
      </mesh>

    </group>
  );
}

function EnemyBulletMesh({ pos }: { pos: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.position.copy(pos); });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.3, 4, 4]} />
      <meshBasicMaterial color="#ff4444" />
    </mesh>
  );
}

function ExplosionMesh({ pos, scale, life, maxLife }: { pos: THREE.Vector3; scale: number; life: number; maxLife: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = life / maxLife;
  useFrame(() => { if (ref.current) ref.current.position.copy(pos); });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[scale * (1 - t * 0.3), 8, 8]} />
      <meshBasicMaterial color={t > 0.5 ? '#ffdd44' : '#ff6600'} transparent opacity={t} />
    </mesh>
  );
}

// ─── Terrain ────────────────────────────────────────────────────────────────
function Terrain({ level }: { level: Level }) {
  const isOcean = level.terrain === 'ocean';
  const color = level.groundColor;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[2000, 2000, 40, 40]} />
        <meshLambertMaterial color={color} wireframe={false} />
      </mesh>
      {/* Mountains */}
      {level.terrain === 'mountains' && Array.from({ length: 20 }).map((_, i) => {
        const x = (i % 5 - 2) * 150 + Math.sin(i * 2.1) * 50;
        const z = Math.floor(i / 5) * 150 - 300 + Math.cos(i * 1.7) * 50;
        const h = 40 + Math.sin(i * 3.3) * 30;
        return (
          <mesh key={i} position={[x, h / 2, z]}>
            <coneGeometry args={[40 + i * 3, h, 6]} />
            <meshLambertMaterial color={level.timeOfDay === 'night' ? '#2a3a2a' : '#4a5a3a'} />
          </mesh>
        );
      })}
      {/* Desert dunes */}
      {level.terrain === 'desert' && Array.from({ length: 15 }).map((_, i) => {
        const x = (i % 5 - 2) * 120 + Math.sin(i * 1.8) * 40;
        const z = Math.floor(i / 5) * 120 - 200 + Math.cos(i * 2.2) * 40;
        return (
          <mesh key={i} position={[x, 4, z]}>
            <sphereGeometry args={[30 + i * 2, 8, 6]} />
            <meshLambertMaterial color="#a08030" />
          </mesh>
        );
      })}
      {/* Ocean waves */}
      {isOcean && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
          <planeGeometry args={[2000, 2000, 20, 20]} />
          <meshLambertMaterial color="#1a3a6a" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ─── Sky / Atmosphere ────────────────────────────────────────────────────────
function SkyDome({ level }: { level: Level }) {
  return (
    <>
      <fog attach="fog" color={level.fogColor} near={200} far={800} />
      <ambientLight intensity={level.timeOfDay === 'night' ? 0.15 : 0.4} />
      <directionalLight
        position={level.timeOfDay === 'dusk' ? [-1, 0.3, -1] : [1, 2, 1]}
        intensity={level.timeOfDay === 'night' ? 0.3 : 0.9}
        color={level.timeOfDay === 'dusk' ? '#ff9960' : '#ffffff'}
      />
      {level.timeOfDay === 'night' && (
        Array.from({ length: 60 }).map((_, i) => (
          <mesh key={i} position={[
            Math.sin(i * 2.3) * 500,
            200 + Math.cos(i * 1.7) * 100,
            Math.cos(i * 3.1) * 500
          ]}>
            <sphereGeometry args={[1.5, 4, 4]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))
      )}
    </>
  );
}

// ─── Clouds ──────────────────────────────────────────────────────────────────
function Clouds() {
  return (
    <group>
      {Array.from({ length: 12 }).map((_, i) => {
        const x = (i % 4 - 1.5) * 200 + Math.sin(i * 2.7) * 60;
        const z = Math.floor(i / 4) * 180 - 250 + Math.cos(i * 1.9) * 60;
        const y = 100 + Math.sin(i * 3.1) * 30;
        return (
          <group key={i} position={[x, y, z]}>
            <mesh>
              <sphereGeometry args={[25, 8, 6]} />
              <meshLambertMaterial color="#ddddee" transparent opacity={0.7} />
            </mesh>
            <mesh position={[20, -5, 0]}>
              <sphereGeometry args={[18, 8, 6]} />
              <meshLambertMaterial color="#ddddee" transparent opacity={0.6} />
            </mesh>
            <mesh position={[-18, -3, 0]}>
              <sphereGeometry args={[20, 8, 6]} />
              <meshLambertMaterial color="#ccccdd" transparent opacity={0.65} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── Game loop (inner component, inside Canvas) ───────────────────────────────
interface GameLoopProps {
  gs: React.MutableRefObject<GameState>;
  level: Level;
  onHUDUpdate: (h: number, m: number, k: number, sp: number, al: number, w: string, fl: number, rwr: boolean, contacts: import('./HUD').RadarContact[], mmode: 'ir' | 'bvr', radarLocked: boolean) => void;
  onGameOver: () => void;
  onMissionComplete: () => void;
  enemyBullets: React.MutableRefObject<Bullet[]>;
  nextEnemyBulletId: React.MutableRefObject<number>;
}

function GameLoop({ gs, level, onHUDUpdate, onGameOver, onMissionComplete, enemyBullets, nextEnemyBulletId, onEject }: GameLoopProps & { onEject: () => void }) {
  const { camera } = useThree();
  const frameRef = useRef(0);
  const gpPrevEject = useRef(false);  // debounce eject button

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = gs.current;
    const k = g.keys;

    // ── Poll gamepad ───────────────────────────────────────────────────────
    const rawGps = navigator.getGamepads();
    let gp: Gamepad | null = null;
    for (const p of rawGps) { if (p && p.connected) { gp = p; break; } }
    const DEAD = 0.15;
    const gpLX   = gp ? (Math.abs(gp.axes[0]) > DEAD ? gp.axes[0] : 0) : 0;
    const gpLY   = gp ? (Math.abs(gp.axes[1]) > DEAD ? gp.axes[1] : 0) : 0;
    const gpFire   = gp ? (gp.buttons[7]?.value ?? 0) > 0.3 || gp.buttons[5]?.pressed : false;
    const gpMissile = gp ? gp.buttons[4]?.pressed ?? false : false;
    const gpDUp    = gp ? gp.buttons[12]?.pressed ?? false : false;
    const gpDDown  = gp ? gp.buttons[13]?.pressed ?? false : false;
    const gpDLeft  = gp ? gp.buttons[14]?.pressed ?? false : false;
    const gpDRight = gp ? gp.buttons[15]?.pressed ?? false : false;
    const gpEjectNow = gp ? ((gp.buttons[1]?.pressed ?? false) || (gp.buttons[9]?.pressed ?? false)) : false;
    if (gpEjectNow && !gpPrevEject.current) { soundManager.stopEngine(); onEject(); }
    gpPrevEject.current = gpEjectNow;

    // ── Flight controls ────────────────────────────────────────────────────
    const pitchRate = 1.4;
    const yawRate = 1.0;

    const doUp    = k['KeyW'] || k['ArrowUp']    || gpDUp;
    const doDown  = k['KeyS'] || k['ArrowDown']  || gpDDown;
    const doLeft  = k['KeyA'] || k['ArrowLeft']  || gpDLeft;
    const doRight = k['KeyD'] || k['ArrowRight'] || gpDRight;

    if (doUp)   g.pitch = Math.min(g.pitch + pitchRate * dt, Math.PI * 0.45);
    if (doDown) g.pitch = Math.max(g.pitch - pitchRate * dt, -Math.PI * 0.45);
    if (doLeft)  { g.yaw += yawRate * dt; g.roll = THREE.MathUtils.lerp(g.roll, 0.6, 0.1); }
    if (doRight) { g.yaw -= yawRate * dt; g.roll = THREE.MathUtils.lerp(g.roll, -0.6, 0.1); }

    // Analog stick overrides digital (smooth input)
    if (gpLY !== 0) g.pitch = THREE.MathUtils.clamp(g.pitch - gpLY * pitchRate * 1.2 * dt, -Math.PI * 0.45, Math.PI * 0.45);
    if (gpLX !== 0) {
      g.yaw -= gpLX * yawRate * 1.2 * dt;
      g.roll = THREE.MathUtils.lerp(g.roll, -gpLX * 0.6, 0.12);
    }

    const anyTurn = doLeft || doRight || gpLX !== 0;
    if (!anyTurn) {
      g.roll = THREE.MathUtils.lerp(g.roll, 0, 0.08);
    }

    // ── G-force vignette — darkens edges during hard turns ──────────────────
    const gForceMag = Math.min(1, Math.abs(g.roll) * (anyTurn ? 1.5 : 0.4));
    document.body.style.setProperty('--g-force', gForceMag.toFixed(3));

    // ── Build rotation quaternion ──────────────────────────────────────────
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), g.pitch);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), g.roll);
    const qFinal = qYaw.clone().multiply(qPitch).multiply(qRoll);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(qFinal);
    const rightVec = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // ── Move player ────────────────────────────────────────────────────────
    g.speed = level.enemyType === 'boss' ? 85 : 70;
    g.playerPos.addScaledVector(forward, g.speed * dt);

    // Altitude
    g.altitude = Math.max(0, g.playerPos.y) * 3.28; // convert to feet (approx)

    // Ground collision — instant death
    if (g.playerPos.y < 5) {
      g.health = 0;
    }

    // Warning timer
    if (g.warningTimer > 0) {
      g.warningTimer -= dt;
      if (g.warningTimer <= 0) g.warning = '';
    }

    // Low altitude warning
    if (g.playerPos.y < 20 && !g.warning) {
      g.warning = '⚠ LOW ALTITUDE';
      g.warningTimer = 1;
    }

    // ── Camera = first person ──────────────────────────────────────────────
    camera.position.copy(g.playerPos);
    camera.quaternion.copy(qFinal);

    // ── Cannon fire ────────────────────────────────────────────────────────
    g.fireTimer -= dt;
    if ((k['Space'] || gpFire) && g.fireTimer <= 0) {
      g.fireTimer = 0.08;
      soundManager.playCannonFire();
      const shotDir = forward.clone();
      const offsets = [
        new THREE.Vector3(2, -0.5, 0).applyQuaternion(qFinal),
        new THREE.Vector3(-2, -0.5, 0).applyQuaternion(qFinal),
      ];
      offsets.forEach(off => {
        g.bullets.push({
          id: g.nextId++, pos: g.playerPos.clone().add(off),
          dir: shotDir.clone(), life: 0.8, isMissile: false,
        });
      });
    }

    // ── Missile mode switch (Tab / gamepad SELECT) ────────────────────────
    g.modeSwitchTimer -= dt;
    const gpSelect = gp ? (gp.buttons[8]?.pressed ?? false) : false;
    if ((k['Tab'] || gpSelect) && g.modeSwitchTimer <= 0) {
      g.modeSwitchTimer = 0.4;
      g.missileMode = g.missileMode === 'ir' ? 'bvr' : 'ir';
      soundManager.playModeSwitchBeep();
    }

    // ── Radar lock (nearest enemy in forward hemisphere within 900u) ──────
    {
      let lockId: number | null = null;
      let lockDist = 900;
      g.enemies.forEach(e => {
        if (e.dead) return;
        const toE = e.pos.clone().sub(g.playerPos);
        const d = toE.length();
        if (d < lockDist && toE.normalize().dot(forward) > 0.2) {
          lockDist = d; lockId = e.id;
        }
      });
      g.radarLockId = lockId;
    }

    // ── Missile fire ──────────────────────────────────────────────────────
    g.missileTimer -= dt;
    if ((k['KeyF'] || gpMissile) && g.missileTimer <= 0 && g.missiles > 0) {
      g.missileTimer = 0.5;
      g.missiles--;

      if (g.missileMode === 'bvr') {
        // BVR (AIM-120 analog) — radar-guided, long range, strong homing
        soundManager.playRadarMissileLaunch();
        let bvrTarget: Enemy | null = null;
        let bvrDist = 1200;
        g.enemies.forEach(e => {
          if (e.dead) return;
          const toE = e.pos.clone().sub(g.playerPos);
          const d = toE.length();
          if (d < bvrDist && toE.normalize().dot(forward) > 0.15) { bvrDist = d; bvrTarget = e; }
        });
        const bt = bvrTarget as Enemy | null;
        const bvrDir = bt !== null
          ? bt.pos.clone().sub(g.playerPos).normalize()
          : forward.clone();
        g.bullets.push({
          id: g.nextId++, pos: g.playerPos.clone().addScaledVector(forward, 8),
          dir: bvrDir, life: 6.5, isMissile: true, isBVR: true,
        });
      } else {
        // IR (AIM-9 analog) — heat-seeking, shorter range
        soundManager.playMissileLaunch();
        let nearest: Enemy | null = null;
        let nearestDist = Infinity;
        g.enemies.forEach(e => {
          if (!e.dead) {
            const d = g.playerPos.distanceTo(e.pos);
            if (d < nearestDist) { nearestDist = d; nearest = e; }
          }
        });
        const target = nearest as Enemy | null;
        const missileDir = target
          ? target.pos.clone().sub(g.playerPos).normalize()
          : forward.clone();
        g.bullets.push({
          id: g.nextId++, pos: g.playerPos.clone().addScaledVector(forward, 8),
          dir: missileDir, life: 4.0, isMissile: true,
        });
      }
    }

    // ── Flare deploy (E key / gamepad Y button) ──────────────────────────────
    g.flareTimer -= dt;
    const gpFlare = gp ? (gp.buttons[3]?.pressed ?? false) : false;
    if ((k['KeyE'] || gpFlare) && g.flareTimer <= 0 && g.flares > 0) {
      g.flareTimer = 0.8;
      g.flares--;
      soundManager.playFlarePop();
      // Defeat any heat-seeking missiles within decoy range
      enemyBullets.current = enemyBullets.current.filter(
        b => !(b.isHeatSeeker && b.pos.distanceTo(g.playerPos) < 150)
      );
    }

    // ── Sidewinder seeker — lock check (enemy in forward cone) ───────────────
    {
      let swLocked = false;
      g.enemies.forEach(e => {
        if (e.dead) return;
        const toE = e.pos.clone().sub(g.playerPos);
        const dist = toE.length();
        if (dist < 720 && toE.normalize().dot(forward) > 0.80) swLocked = true;
      });
      soundManager.setSidewinderLock(swLocked, g.missiles > 0);
    }

    // ── Move bullets ──────────────────────────────────────────────────────
    const bulletSpeed = 280;
    const missileSpeed = 180;
    g.bullets = g.bullets.filter(b => {
      b.life -= dt;
      if (b.life <= 0) return false;
      const speed = b.isMissile ? (b.isBVR ? 320 : missileSpeed) : bulletSpeed;

      // Missile homing
      if (b.isMissile) {
        let nearest: Enemy | null = null;
        let nearestDist = Infinity;
        g.enemies.forEach(e => {
          if (!e.dead) {
            const d = b.pos.distanceTo(e.pos);
            if (d < nearestDist) { nearestDist = d; nearest = e; }
          }
        });
        const nearestEnemy = nearest as Enemy | null;
        if (nearestEnemy) {
          const toTarget = nearestEnemy.pos.clone().sub(b.pos).normalize();
          b.dir.lerp(toTarget, (b.isBVR ? 5.5 : 3) * dt).normalize();
        }
      }

      b.pos.addScaledVector(b.dir, speed * dt);

      // Hit enemies
      for (const e of g.enemies) {
        if (e.dead) continue;
        const dist = b.pos.distanceTo(e.pos);
        const hitR = b.isMissile ? 12 : 6;
        if (dist < hitR) {
          e.health -= b.isMissile ? 3 : 1;
          if (e.health <= 0 && !e.dead) {
            e.dead = true;
            g.kills++;
            g.explosions.push({ id: g.nextId++, pos: e.pos.clone(), scale: 15, life: 1.2, maxLife: 1.2 });
            soundManager.playExplosion(true);
          } else {
            g.explosions.push({ id: g.nextId++, pos: b.pos.clone(), scale: 4, life: 0.3, maxLife: 0.3 });
            soundManager.playExplosion(false);
          }
          return false;
        }
      }
      return true;
    });

    // ── Enemy AI & shooting ───────────────────────────────────────────────
    g.enemies.forEach(e => {
      if (e.dead) return;
      e.phase += dt;

      const toPlayer = g.playerPos.clone().sub(e.pos);
      const dist = toPlayer.length();
      const dir = toPlayer.normalize();

      // Chase player loosely
      const chaseSpeed = e.type === 'boss' ? 95 : e.type === 'advanced' ? 80 : 70;
      const orbitRadius = e.type === 'boss' ? 80 : 120;

      if (dist > orbitRadius + 20) {
        e.vel.lerp(dir.clone().multiplyScalar(chaseSpeed), 2 * dt);
      } else if (dist < orbitRadius - 20) {
        e.vel.lerp(dir.clone().negate().multiplyScalar(chaseSpeed * 0.5), 2 * dt);
      } else {
        // Orbit
        const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
        const orbitDir = dir.clone().multiplyScalar(5).add(right.multiplyScalar(chaseSpeed));
        e.vel.lerp(orbitDir.normalize().multiplyScalar(chaseSpeed), 2 * dt);
      }
      e.vel.y = THREE.MathUtils.lerp(e.vel.y, 60 - e.pos.y, 1.5 * dt); // maintain altitude ~60
      e.pos.addScaledVector(e.vel, dt);
      e.pos.y = Math.max(e.pos.y, 15);

      // Shoot at player
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 200) {
        e.shootTimer = e.shootCooldown + (Math.random() - 0.5) * 0.5;
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15
        );
        enemyBullets.current.push({
          id: nextEnemyBulletId.current++,
          pos: e.pos.clone(),
          dir: dir.clone().add(jitter).normalize(),
          life: 1.5,
          isMissile: false,
        });
      }

      // ── Heat-seeking missile (advanced / boss only) ───────────────────────
      if (e.type !== 'normal') {
        e.missileTimer -= dt;
        if (e.missileTimer <= 0 && dist < 420) {
          e.missileTimer = e.missileCooldown;
          const mdir = g.playerPos.clone().sub(e.pos).normalize();
          enemyBullets.current.push({
            id: nextEnemyBulletId.current++,
            pos: e.pos.clone(),
            dir: mdir,
            life: 7.0,
            isMissile: true,
            isHeatSeeker: true,
          });
        }
      }
    });

    // ── Move enemy bullets ────────────────────────────────────────────────
    const enemyBulletSpeed = 160;
    enemyBullets.current = enemyBullets.current.filter(b => {
      b.life -= dt;
      if (b.life <= 0) return false;
      const bSpeed = b.isHeatSeeker ? 215 : enemyBulletSpeed;
      // Heat-seeking missiles home on player
      if (b.isHeatSeeker) {
        const toPlayer = g.playerPos.clone().sub(b.pos).normalize();
        b.dir.lerp(toPlayer, 2.8 * dt).normalize();
      }
      b.pos.addScaledVector(b.dir, bSpeed * dt);
      // Hit player
      if (b.pos.distanceTo(g.playerPos) < 8) {
        g.health -= level.enemyType === 'boss' ? 18 : level.enemyType === 'advanced' ? 14 : 10;
        g.warning = '⚠ TAKING DAMAGE!';
        g.warningTimer = 1.5;
        g.explosions.push({ id: g.nextId++, pos: g.playerPos.clone().addScaledVector(forward, -5), scale: 6, life: 0.5, maxLife: 0.5 });
        soundManager.playHit();
        return false;
      }
      return true;
    });

    // ── Tick explosions ───────────────────────────────────────────────────
    g.explosions = g.explosions.filter(ex => { ex.life -= dt; return ex.life > 0; });

    // ── Engine sound throttle ─────────────────────────────────────────────
    const throttle = Math.max(0, Math.min(1, (g.pitch + 0.45) / 0.9));
    soundManager.setEngineThrottle(throttle);

    // ── Afterburner ignition thump ────────────────────────────────────────
    if (throttle >= 0.90 && !g.abWasHigh) soundManager.playAfterburnerLight();
    g.abWasHigh = throttle >= 0.85;

    // ── RWR — deedle-deedle when heat-seeker missile is incoming ─────────
    g.rwrTimer -= dt;
    const hasIncomingMissile = enemyBullets.current.some(
      b => b.isHeatSeeker && b.pos.distanceTo(g.playerPos) < 380
    );
    if (hasIncomingMissile && g.rwrTimer <= 0) {
      g.rwrTimer = 0.72;
      soundManager.playRWRDeedle();
      if (!g.warning) { g.warning = '⚠ MISSILE INBOUND!'; g.warningTimer = 0.9; }
    }

    // ── Check win / lose ──────────────────────────────────────────────────
    if (g.health <= 0) { g.health = 0; onGameOver(); }
    const aliveEnemies = g.enemies.filter(e => !e.dead).length;
    if (aliveEnemies === 0 && g.kills >= level.requiredKills) onMissionComplete();

    // HUD update every 3 frames
    frameRef.current++;
    if (frameRef.current % 3 === 0) {
      const radarRange = 900;
      const radarContacts = [
        ...g.enemies.filter(e => !e.dead).map(e => {
          const rel = e.pos.clone().sub(g.playerPos);
          return { id: e.id, relX: rel.dot(rightVec) / radarRange, relY: rel.dot(forward) / radarRange, isMissile: false, isLocked: e.id === g.radarLockId };
        }),
        ...enemyBullets.current.filter(b => b.isHeatSeeker).map(b => {
          const rel = b.pos.clone().sub(g.playerPos);
          return { id: b.id, relX: rel.dot(rightVec) / radarRange, relY: rel.dot(forward) / radarRange, isMissile: true, isLocked: false };
        }),
      ];
      onHUDUpdate(Math.round(g.health), g.missiles, g.kills, g.speed, g.altitude, g.warning, g.flares, hasIncomingMissile, radarContacts, g.missileMode, g.radarLockId !== null);
    }
  });

  return null;
}

// ─── Rendering wrapper (reads from gs ref) ────────────────────────────────────
function Scene({ gs, level, enemyBullets }: { gs: React.MutableRefObject<GameState>; level: Level; enemyBullets: React.MutableRefObject<Bullet[]> }) {
  const [, forceRender] = useState(0);

  useFrame(() => { forceRender(n => n + 1); });

  const g = gs.current;
  const activeEnemies = g.enemies.filter(e => !e.dead);
  const activeBullets = g.bullets;
  const activeExplosions = g.explosions;
  const activeEnemyBullets = enemyBullets.current;

  return (
    <>
      <SkyDome level={level} />
      <Terrain level={level} />
      <Clouds />
      <Cockpit />
      {activeEnemies.map(e => (
        <EnemyJetMesh key={e.id} pos={e.pos} vel={e.vel} type={e.type} health={e.health} maxHealth={e.maxHealth} />
      ))}
      {activeBullets.map(b => (
        b.isMissile
          ? <MissileMesh key={b.id} pos={b.pos} dir={b.dir} isBVR={!!b.isBVR} />
          : <BulletMesh key={b.id} pos={b.pos} />
      ))}
      {activeEnemyBullets.map(b => (
        <EnemyBulletMesh key={b.id} pos={b.pos} />
      ))}
      {activeExplosions.map(ex => (
        <ExplosionMesh key={ex.id} pos={ex.pos} scale={ex.scale} life={ex.life} maxLife={ex.maxLife} />
      ))}
    </>
  );
}

// ─── Main FlightGame component ────────────────────────────────────────────────
interface FlightGameProps {
  level: Level;
  onGameOver: () => void;
  onMissionComplete: () => void;
  onEject: () => void;
}

export default function FlightGame({ level, onGameOver, onMissionComplete, onEject }: FlightGameProps) {
  const maxMissiles = level.enemyType === 'boss' ? 12 : level.enemyType === 'advanced' ? 8 : level.id <= 2 ? 4 : 6;

  const gs = useRef<GameState>({
    playerPos: new THREE.Vector3(0, 80, 0),
    playerRot: new THREE.Euler(0, 0, 0),
    playerVel: new THREE.Vector3(0, 0, 0),
    pitch: 0, yaw: 0, roll: 0,
    speed: 70, health: 100,
    bullets: [], enemies: initEnemies(level),
    explosions: [], kills: 0,
    keys: {},
    fireTimer: 0, missileTimer: 0,
    missiles: maxMissiles,
    warning: '', warningTimer: 0,
    nextId: 1000,
    altitude: 800,
    flares: 6, flareTimer: 0, rwrTimer: 0, abWasHigh: false,
    missileMode: 'ir', radarLockId: null, modeSwitchTimer: 0,
  });

  const enemyBullets = useRef<Bullet[]>([]);
  const nextEnemyBulletId = useRef(5000);

  const [hudHealth, setHudHealth] = useState(100);
  const [hudMissiles, setHudMissiles] = useState(maxMissiles);
  const [hudKills, setHudKills] = useState(0);
  const [hudSpeed, setHudSpeed] = useState(70);
  const [hudAlt, setHudAlt] = useState(800);
  const [hudWarning, setHudWarning] = useState('');
  const [hudFlares, setHudFlares] = useState(6);
  const [hudRwr, setHudRwr] = useState(false);
  const [hudRadarContacts, setHudRadarContacts] = useState<import('./HUD').RadarContact[]>([]);
  const [hudMissileMode, setHudMissileMode] = useState<'ir' | 'bvr'>('ir');
  const [hudRadarLocked, setHudRadarLocked] = useState(false);
  const [gpConnected, setGpConnected] = useState(() =>
    Array.from(navigator.getGamepads()).some(p => p && p.connected)
  );

  useEffect(() => {
    const onConnect = () => setGpConnected(true);
    const onDisconnect = () =>
      setGpConnected(Array.from(navigator.getGamepads()).some(p => p && p.connected));
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  const gameOver = useRef(false);
  const missionDone = useRef(false);

  const handleHUDUpdate = useCallback((h: number, m: number, k: number, sp: number, al: number, w: string, fl: number, rwr: boolean, contacts: import('./HUD').RadarContact[], mmode: 'ir' | 'bvr', radarLocked: boolean) => {
    setHudHealth(h);
    setHudMissiles(m);
    setHudKills(k);
    setHudSpeed(Math.round(sp));
    setHudAlt(Math.round(al));
    setHudWarning(w);
    setHudFlares(fl);
    setHudRwr(rwr);
    setHudRadarContacts(contacts);
    setHudMissileMode(mmode);
    setHudRadarLocked(radarLocked);
  }, []);

  const handleGameOver = useCallback(() => {
    if (!gameOver.current) {
      gameOver.current = true;
      soundManager.stopEngine();
      soundManager.playGameOver();
      setTimeout(onGameOver, 1500);
    }
  }, [onGameOver]);

  const handleMissionComplete = useCallback(() => {
    if (!missionDone.current) {
      missionDone.current = true;
      soundManager.stopEngine();
      soundManager.playMissionComplete();
      setTimeout(onMissionComplete, 1500);
    }
  }, [onMissionComplete]);

  // Start engine on mount, stop on unmount
  useEffect(() => {
    soundManager.resume();
    soundManager.startEngine();
    soundManager.startSidewinderTone();
    return () => { soundManager.stopEngine(); soundManager.stopSidewinderTone(); };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      gs.current.keys[e.code] = true;
      if (e.code === 'Escape') { soundManager.stopEngine(); onEject(); }
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => { gs.current.keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onEject]);

  return (
    <div className="game-container" onClick={() => soundManager.resume()}>
      <Canvas
        gl={{ antialias: false }}
        camera={{ fov: 75, near: 0.5, far: 900, position: [0, 80, 0] }}
        style={{ background: level.skyColor }}
      >
        <Scene gs={gs} level={level} enemyBullets={enemyBullets} />
        <GameLoop
          gs={gs} level={level}
          onHUDUpdate={handleHUDUpdate}
          onGameOver={handleGameOver}
          onMissionComplete={handleMissionComplete}
          enemyBullets={enemyBullets}
          nextEnemyBulletId={nextEnemyBulletId}
          onEject={onEject}
        />
      </Canvas>
      <HUD
        health={hudHealth} maxHealth={100}
        missiles={hudMissiles} maxMissiles={maxMissiles}
        kills={hudKills} requiredKills={level.requiredKills}
        speed={hudSpeed} altitude={hudAlt}
        levelName={level.codename}
        objective={level.objective}
        warning={hudWarning}
        flares={hudFlares} maxFlares={6}
        rwr={hudRwr}
        radarContacts={hudRadarContacts}
        missileMode={hudMissileMode}
        radarLocked={hudRadarLocked}
        onEject={onEject}
        controllerConnected={gpConnected}
      />
    </div>
  );
}
