import { useEffect, useRef, useState, useCallback } from 'react';
import { LEVELS, Level } from '../data/levels';

interface LevelSelectorProps {
  completedLevels: number[];
  onSelectLevel: (level: Level) => void;
  onBack: () => void;
}

const MAP_WIDTH = 700;
const MAP_HEIGHT = 420;
const HELI_SPEED = 3;
const HELI_SIZE = 24;
const SELECT_RADIUS = 45;

export default function LevelSelector({ completedLevels, onSelectLevel, onBack }: LevelSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heliPos = useRef({ x: 60, y: MAP_HEIGHT / 2 });
  const heliAnim = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const hoveredLevel = useRef<Level | null>(null);
  const selectedLevel = useRef<Level | null>(null);
  const [hovered, setHovered] = useState<Level | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === 'Escape') onBack();
      if ((e.code === 'Enter' || e.code === 'Space') && hoveredLevel.current) {
        onSelectLevel(hoveredLevel.current);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onBack, onSelectLevel]);

  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Poll gamepad
    const rawGps = navigator.getGamepads();
    let gp: Gamepad | null = null;
    for (const p of rawGps) { if (p && p.connected) { gp = p; break; } }
    const DEAD = 0.18;
    const gpLX = gp ? (Math.abs(gp.axes[0]) > DEAD ? gp.axes[0] : 0) : 0;
    const gpLY = gp ? (Math.abs(gp.axes[1]) > DEAD ? gp.axes[1] : 0) : 0;
    const gpDUp    = gp ? gp.buttons[12]?.pressed ?? false : false;
    const gpDDown  = gp ? gp.buttons[13]?.pressed ?? false : false;
    const gpDLeft  = gp ? gp.buttons[14]?.pressed ?? false : false;
    const gpDRight = gp ? gp.buttons[15]?.pressed ?? false : false;
    const gpA      = gp ? gp.buttons[0]?.pressed ?? false : false;

    // Move heli
    const k = keys.current;
    const moveUp    = k['KeyW'] || k['ArrowUp']    || gpDUp    || gpLY < -DEAD;
    const moveDown  = k['KeyS'] || k['ArrowDown']  || gpDDown  || gpLY >  DEAD;
    const moveLeft  = k['KeyA'] || k['ArrowLeft']  || gpDLeft  || gpLX < -DEAD;
    const moveRight = k['KeyD'] || k['ArrowRight'] || gpDRight || gpLX >  DEAD;

    // Analog speed scaling for stick
    const analogSpeedY = Math.abs(gpLY) > DEAD ? Math.abs(gpLY) : 1;
    const analogSpeedX = Math.abs(gpLX) > DEAD ? Math.abs(gpLX) : 1;

    if (moveUp)    heliPos.current.y = Math.max(HELI_SIZE, heliPos.current.y - HELI_SPEED * (gpDUp    ? 1 : analogSpeedY));
    if (moveDown)  heliPos.current.y = Math.min(MAP_HEIGHT - HELI_SIZE, heliPos.current.y + HELI_SPEED * (gpDDown  ? 1 : analogSpeedY));
    if (moveLeft)  heliPos.current.x = Math.max(HELI_SIZE, heliPos.current.x - HELI_SPEED * (gpDLeft  ? 1 : analogSpeedX));
    if (moveRight) heliPos.current.x = Math.min(MAP_WIDTH - HELI_SIZE, heliPos.current.x + HELI_SPEED * (gpDRight ? 1 : analogSpeedX));

    // A button = select level
    if (gpA && hoveredLevel.current && hoveredLevel.current !== selectedLevel.current) {
      selectedLevel.current = hoveredLevel.current;
      onSelectLevel(hoveredLevel.current);
    }

    heliAnim.current += 0.15;

    // Check hovering
    let newHovered: Level | null = null;
    for (const lvl of LEVELS) {
      const dx = heliPos.current.x - lvl.mapX;
      const dy = heliPos.current.y - lvl.mapY;
      if (Math.sqrt(dx * dx + dy * dy) < SELECT_RADIUS) {
        newHovered = lvl;
        break;
      }
    }
    if (newHovered !== hoveredLevel.current) {
      hoveredLevel.current = newHovered;
      setHovered(newHovered);
    }

    // ── Background gradient ──
    const bgGrad = ctx.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT);
    bgGrad.addColorStop(0,   '#243020');
    bgGrad.addColorStop(0.5, '#2c3a1e');
    bgGrad.addColorStop(1,   '#202c18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // ── Terrain blobs (rounded rects) ──
    const terrainBlobs = [
      { x: 20,  y: 20,  w: 155, h: 95,  r: 22, color: '#3a5028' },
      { x: 170, y: 75,  w: 210, h: 125, r: 24, color: '#455830' },
      { x: 305, y: 25,  w: 170, h: 105, r: 18, color: '#56502a' },
      { x: 70,  y: 215, w: 175, h: 110, r: 20, color: '#405232' },
      { x: 370, y: 195, w: 210, h: 150, r: 22, color: '#2e4028' },
      { x: 440, y: 295, w: 130, h:  85, r: 14, color: '#384e28' },
    ];
    terrainBlobs.forEach(b => {
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, b.r);
      ctx.fillStyle = b.color;
      ctx.fill();
    });

    // ── Ocean / water area (level 4 zone, right side) ──
    ctx.beginPath();
    ctx.roundRect(518, 60, 170, 220, 22);
    const oceanGrad = ctx.createLinearGradient(518, 60, 688, 280);
    oceanGrad.addColorStop(0, 'rgba(15,45,75,0.72)');
    oceanGrad.addColorStop(1, 'rgba(10,35,60,0.72)');
    ctx.fillStyle = oceanGrad;
    ctx.fill();
    // Waves
    ctx.strokeStyle = 'rgba(50,110,155,0.28)';
    ctx.lineWidth = 1;
    for (let wy = 82; wy < 272; wy += 11) {
      ctx.beginPath();
      ctx.moveTo(524, wy);
      for (let wx = 524; wx < 684; wx += 28) {
        ctx.quadraticCurveTo(wx + 7, wy - 3, wx + 14, wy);
        ctx.quadraticCurveTo(wx + 21, wy + 3, wx + 28, wy);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(50,110,155,0.18)';
    ctx.beginPath();
    ctx.roundRect(518, 60, 170, 220, 22);
    ctx.stroke();

    // ── Mountain icons (right half) ──
    const drawMtn = (x: number, y: number, s: number, snow: boolean) => {
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x - s * 0.85, y + s * 0.6);
      ctx.lineTo(x + s * 0.85, y + s * 0.6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(72,62,36,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,95,50,0.40)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      if (snow) {
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x - s * 0.28, y - s * 0.65);
        ctx.lineTo(x + s * 0.28, y - s * 0.65);
        ctx.closePath();
        ctx.fillStyle = 'rgba(210,210,195,0.38)';
        ctx.fill();
      }
    };
    [[375,45,14,true],[402,58,11,true],[426,38,13,true],[450,52,10,false],
     [472,40,12,true],[498,48,10,false],[520,34,13,true],[488,62,9,false],
     [398,258,11,true],[428,268,9,false],[458,248,12,true],[490,262,10,false],
     [514,252,9,false]].forEach(([x,y,s,sn]) => drawMtn(x as number, y as number, s as number, !!sn));

    // ── Enemy territory shading ──
    ctx.beginPath();
    ctx.roundRect(478, 0, 222, 175, 14);
    ctx.fillStyle = 'rgba(120,20,20,0.13)';
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(200,40,40,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(200,50,50,0.50)';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('◈ HOSTILE AIRSPACE ◈', 590, 7);

    // ── Coordinate grid ──
    ctx.strokeStyle = 'rgba(100,140,60,0.09)';
    ctx.lineWidth = 1;
    for (let x = 0; x < MAP_WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < MAP_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y); ctx.stroke();
    }

    // ── River system ──
    ctx.strokeStyle = 'rgba(40,100,145,0.55)';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 158);
    ctx.bezierCurveTo(75, 152, 155, 178, 225, 168);
    ctx.bezierCurveTo(295, 158, 342, 192, 418, 186);
    ctx.bezierCurveTo(468, 183, 510, 172, 560, 178);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(225, 168);
    ctx.bezierCurveTo(232, 228, 252, 282, 274, 345);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(342, 192);
    ctx.bezierCurveTo(352, 242, 362, 295, 358, 385);
    ctx.stroke();
    // River highlight
    ctx.strokeStyle = 'rgba(80,155,200,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 155);
    ctx.bezierCurveTo(75, 149, 155, 175, 225, 165);
    ctx.bezierCurveTo(295, 155, 342, 189, 418, 183);
    ctx.stroke();

    // ── Road ──
    ctx.strokeStyle = 'rgba(160,145,75,0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 202);
    ctx.lineTo(120, 200); ctx.lineTo(260, 150); ctx.lineTo(380, 222);
    ctx.lineTo(480, 140); ctx.lineTo(560, 282); ctx.lineTo(700, 262);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Flight path arrows between levels ──
    ctx.strokeStyle = 'rgba(215,195,75,0.42)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    for (let i = 0; i < LEVELS.length - 1; i++) {
      const a = LEVELS[i]; const b = LEVELS[i + 1];
      ctx.beginPath(); ctx.moveTo(a.mapX, a.mapY); ctx.lineTo(b.mapX, b.mapY); ctx.stroke();
      const dx = b.mapX - a.mapX; const dy = b.mapY - a.mapY;
      const len = Math.sqrt(dx * dx + dy * dy);
      const mx = a.mapX + dx * 0.52; const my = a.mapY + dy * 0.52;
      const ux = dx / len; const uy = dy / len;
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(215,195,75,0.50)';
      ctx.beginPath();
      ctx.moveTo(mx + ux * 7, my + uy * 7);
      ctx.lineTo(mx - uy * 4, my + ux * 4);
      ctx.lineTo(mx + uy * 4, my - ux * 4);
      ctx.closePath(); ctx.fill();
      ctx.setLineDash([7, 5]);
    }
    ctx.setLineDash([]);

    // ── Radar display (bottom-left corner) ──
    const RAD = { x: 72, y: MAP_HEIGHT - 62, r: 50 };
    const sweep = heliAnim.current * 0.55;
    // Radar bg
    ctx.beginPath(); ctx.arc(RAD.x, RAD.y, RAD.r, 0, Math.PI * 2);
    const radarBg = ctx.createRadialGradient(RAD.x, RAD.y, 0, RAD.x, RAD.y, RAD.r);
    radarBg.addColorStop(0,   'rgba(0,28,10,0.92)');
    radarBg.addColorStop(1,   'rgba(0,12,4,0.92)');
    ctx.fillStyle = radarBg; ctx.fill();
    // Rings
    ctx.strokeStyle = 'rgba(0,200,70,0.28)'; ctx.lineWidth = 0.8;
    [0.33, 0.66, 1.0].forEach(f => {
      ctx.beginPath(); ctx.arc(RAD.x, RAD.y, RAD.r * f, 0, Math.PI * 2); ctx.stroke();
    });
    // Cross-hairs
    ctx.beginPath(); ctx.moveTo(RAD.x - RAD.r, RAD.y); ctx.lineTo(RAD.x + RAD.r, RAD.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(RAD.x, RAD.y - RAD.r); ctx.lineTo(RAD.x, RAD.y + RAD.r); ctx.stroke();
    // Sweep trail
    for (let t = 5; t >= 1; t--) {
      ctx.strokeStyle = `rgba(0,255,70,${0.06 + (5 - t) * 0.02})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(RAD.x, RAD.y);
      ctx.lineTo(RAD.x + Math.cos(sweep - t * 0.22) * RAD.r, RAD.y + Math.sin(sweep - t * 0.22) * RAD.r);
      ctx.stroke();
    }
    // Sweep line
    ctx.strokeStyle = 'rgba(0,255,70,0.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(RAD.x, RAD.y);
    ctx.lineTo(RAD.x + Math.cos(sweep) * RAD.r, RAD.y + Math.sin(sweep) * RAD.r); ctx.stroke();
    // Border
    ctx.strokeStyle = 'rgba(0,200,70,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(RAD.x, RAD.y, RAD.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,200,70,0.55)'; ctx.font = '6px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('RADAR', RAD.x, RAD.y + RAD.r + 4);

    // ── Level markers — hexagonal military style ──
    const HEX_R = 19;
    const hex = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else         ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
    };

    LEVELS.forEach((lvl, idx) => {
      const isCompleted = completedLevels.includes(lvl.id);
      const isHovered   = hoveredLevel.current?.id === lvl.id;
      const isLocked    = idx > 0 && !completedLevels.includes(LEVELS[idx - 1].id);
      const pulse       = isHovered ? Math.sin(heliAnim.current * 3.5) * 3.5 : 0;

      // Glow halo
      if (isHovered || isCompleted) {
        hex(lvl.mapX, lvl.mapY, HEX_R + 9 + pulse);
        ctx.strokeStyle = isCompleted ? 'rgba(70,200,70,0.30)' : 'rgba(255,215,40,0.40)';
        ctx.lineWidth = 6; ctx.stroke();
      }
      // Outer hex
      hex(lvl.mapX, lvl.mapY, HEX_R + pulse * 0.4);
      ctx.fillStyle = isLocked ? '#1c1c18' : isCompleted ? '#1a3a18' : isHovered ? '#3a3000' : '#1e2c0e';
      ctx.fill();
      ctx.strokeStyle = isLocked ? '#383830' : isCompleted ? '#55cc55' : isHovered ? '#ffdd44' : '#a09040';
      ctx.lineWidth = isHovered ? 2.5 : 1.5; ctx.stroke();
      // Inner hex
      hex(lvl.mapX, lvl.mapY, 10);
      ctx.fillStyle = isLocked ? '#242420' : isCompleted ? '#2a5228' : isHovered ? '#554800' : '#2a3a10';
      ctx.fill();
      // Label
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = isLocked ? '#484840' : isCompleted ? '#55cc55' : isHovered ? '#ffdd44' : '#c8b44a';
      ctx.fillText(isCompleted ? '✓' : isLocked ? '✕' : String(lvl.id), lvl.mapX, lvl.mapY);
      // Name tag
      if (!isLocked) {
        const tagW = 84;
        ctx.fillStyle = 'rgba(0,0,0,0.48)';
        ctx.beginPath(); ctx.roundRect(lvl.mapX - tagW / 2, lvl.mapY + 23, tagW, 13, 2); ctx.fill();
        ctx.font = '8px monospace';
        ctx.fillStyle = isHovered ? '#ffdd44' : '#909060';
        ctx.textBaseline = 'middle';
        ctx.fillText(lvl.name.toUpperCase().slice(0, 14), lvl.mapX, lvl.mapY + 29.5);
      }
    });

    // ── Helicopter ──
    const hx = heliPos.current.x;
    const hy = heliPos.current.y;
    const rotorAngle = heliAnim.current * 4.5;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(hx + 4, hy + 9, 20, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

    // Skid struts
    ctx.strokeStyle = '#506838'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx - 11, hy + 5); ctx.lineTo(hx - 11, hy + 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 5,  hy + 5); ctx.lineTo(hx + 5,  hy + 11); ctx.stroke();
    // Skid bars
    ctx.beginPath(); ctx.moveTo(hx - 14, hy + 11); ctx.lineTo(hx + 9,  hy + 11); ctx.stroke();

    // Main fuselage
    ctx.beginPath(); ctx.roundRect(hx - 13, hy - 5, 23, 10, 4);
    ctx.fillStyle = '#567040'; ctx.fill();
    ctx.strokeStyle = '#3a5028'; ctx.lineWidth = 0.6; ctx.stroke();

    // Cabin glazing
    ctx.beginPath(); ctx.roundRect(hx - 10, hy - 9, 13, 9, 4);
    ctx.fillStyle = 'rgba(90,170,215,0.48)'; ctx.fill();
    ctx.strokeStyle = '#3a6070'; ctx.lineWidth = 0.5; ctx.stroke();
    // Glazing frame cross
    ctx.strokeStyle = 'rgba(40,80,100,0.6)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 9); ctx.lineTo(hx - 4, hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 10, hy - 4); ctx.lineTo(hx + 3, hy - 4); ctx.stroke();

    // Tail boom
    ctx.beginPath(); ctx.roundRect(hx + 10, hy - 3, 16, 5, 2);
    ctx.fillStyle = '#4a6830'; ctx.fill();
    ctx.strokeStyle = '#374e22'; ctx.lineWidth = 0.5; ctx.stroke();
    // Tail fin
    ctx.beginPath();
    ctx.moveTo(hx + 23, hy - 3); ctx.lineTo(hx + 28, hy - 9); ctx.lineTo(hx + 28, hy - 3);
    ctx.closePath(); ctx.fillStyle = '#4a6030'; ctx.fill();

    // Main rotor disc (blurred ellipse)
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy - 10, 20, 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(130,210,70,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    // Rotor blades ×2
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#88cc40';
    ctx.beginPath();
    ctx.moveTo(hx - 2 + Math.cos(rotorAngle) * 20, hy - 10 + Math.sin(rotorAngle) * 5);
    ctx.lineTo(hx - 2 + Math.cos(rotorAngle + Math.PI) * 20, hy - 10 + Math.sin(rotorAngle + Math.PI) * 5);
    ctx.stroke();
    ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(130,210,60,0.55)';
    ctx.beginPath();
    ctx.moveTo(hx - 2 + Math.cos(rotorAngle + Math.PI / 2) * 20, hy - 10 + Math.sin(rotorAngle + Math.PI / 2) * 5);
    ctx.lineTo(hx - 2 + Math.cos(rotorAngle - Math.PI / 2) * 20, hy - 10 + Math.sin(rotorAngle - Math.PI / 2) * 5);
    ctx.stroke();
    // Rotor hub
    ctx.beginPath(); ctx.arc(hx - 2, hy - 10, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4028'; ctx.fill();

    // Tail rotor
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#70b030';
    ctx.beginPath();
    ctx.moveTo(hx + 28 + Math.cos(rotorAngle * 2.2) * 5, hy - 6 + Math.sin(rotorAngle * 2.2) * 5);
    ctx.lineTo(hx + 28 + Math.cos(rotorAngle * 2.2 + Math.PI) * 5, hy - 6 + Math.sin(rotorAngle * 2.2 + Math.PI) * 5);
    ctx.stroke();

    animRef.current = requestAnimationFrame(drawMap);
  }, [completedLevels]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(drawMap);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawMap]);

  return (
    <div className="level-selector">
      <div className="scanlines" />
      <div className="selector-ui">
        <div className="selector-header">
          <div className="selector-title">THEATER OF OPERATIONS</div>
          <div className="selector-sub">FLY YOUR HELICOPTER TO SELECT A MISSION — PRESS ENTER TO LAUNCH</div>
        </div>

        <div className="map-container">
          <div className="map-corner top-left">GRID A-1</div>
          <div className="map-corner top-right">CLASSIFIED</div>
          <canvas ref={canvasRef} width={MAP_WIDTH} height={MAP_HEIGHT} className="map-canvas" />
          <div className="map-corner bot-left">SCALE 1:500,000</div>
          <div className="map-corner bot-right">NATO STANDARD</div>
        </div>

        <div className="mission-info">
          {hovered ? (
            <>
              <div className="mission-name">{hovered.codename} — {hovered.name}</div>
              <div className="mission-obj">{hovered.objective}</div>
              <div className="mission-details">
                <span>ENEMIES: {hovered.enemyCount}</span>
                <span>THREAT: {hovered.enemyType.toUpperCase()}</span>
                <span>TERRAIN: {hovered.terrain.toUpperCase()}</span>
                <span>TIME: {hovered.timeOfDay.toUpperCase()}</span>
              </div>
            </>
          ) : (
            <div className="mission-idle">[ FLY TO A MISSION MARKER ]</div>
          )}
        </div>

        <button className="back-btn" onClick={onBack}>[ESC] RETURN TO BASE</button>
      </div>
    </div>
  );
}
