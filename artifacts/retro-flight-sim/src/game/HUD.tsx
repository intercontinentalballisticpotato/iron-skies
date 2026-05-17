import { useEffect, useRef, useState } from 'react';

export interface RadarContact { id: number; relX: number; relY: number; isMissile: boolean; isLocked: boolean; }

// ─── Radar MFD Canvas Component ───────────────────────────────────────────────
function RadarMFD({ contacts, missileMode }: { contacts: RadarContact[]; missileMode: 'ir' | 'bvr' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contactsRef = useRef(contacts);
  const modeRef = useRef(missileMode);
  contactsRef.current = contacts;
  modeRef.current = missileMode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let sweep = 0;
    let last = performance.now();
    let rafId: number;

    const SIZE = canvas.width;   // 130
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE / 2 - 3;     // 62

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      sweep = (sweep + dt * (Math.PI * 2) / 3.5) % (Math.PI * 2);

      const cs = contactsRef.current;
      const mode = modeRef.current;

      ctx.clearRect(0, 0, SIZE, SIZE);

      // Clip to circle
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();

      // Background
      ctx.fillStyle = '#000e00'; ctx.fillRect(0, 0, SIZE, SIZE);

      // Range rings
      ctx.lineWidth = 0.7;
      [0.35, 0.68].forEach(f => {
        ctx.strokeStyle = '#0d2a0d';
        ctx.beginPath(); ctx.arc(cx, cy, r * f, 0, Math.PI * 2); ctx.stroke();
      });

      // Cross-hairs
      ctx.strokeStyle = '#0a1a0a'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();

      // Sweep glow sector
      ctx.fillStyle = 'rgba(0,180,0,0.08)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, sweep - Math.PI / 2 - 1.3, sweep - Math.PI / 2, false);
      ctx.closePath();
      ctx.fill();

      // Sweep line
      const sx = cx + Math.sin(sweep) * r;
      const sy = cy - Math.cos(sweep) * r;
      ctx.strokeStyle = 'rgba(0,255,60,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,255,60,0.22)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy); ctx.stroke();

      // Contacts
      ctx.shadowBlur = 0;
      cs.forEach(c => {
        const bx = cx + Math.max(-0.92, Math.min(0.92, c.relX)) * r * 0.92;
        const by = cy - Math.max(-0.92, Math.min(0.92, c.relY)) * r * 0.92;
        if (c.isMissile) {
          ctx.fillStyle = '#ff5500'; ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
        } else if (c.isLocked && mode === 'bvr') {
          ctx.strokeStyle = '#ffee00'; ctx.shadowColor = '#ffee00'; ctx.shadowBlur = 12;
          ctx.lineWidth = 1.5;
          const s = 5.5;
          ctx.strokeRect(bx - s, by - s, s * 2, s * 2);
          ctx.fillStyle = '#ffee00';
          ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#00ff55'; ctx.shadowColor = '#00ff55'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
      });

      // Own-ship blip (center)
      ctx.fillStyle = '#44aaff'; ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Nose-up tick
      ctx.strokeStyle = '#44ff44'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - r + 7); ctx.lineTo(cx, cy - r + 1); ctx.lineTo(cx + 3, cy - r + 7);
      ctx.stroke();

      ctx.restore();

      // Circular border
      ctx.strokeStyle = '#1a5a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []); // contactsRef / modeRef updated by assignment above

  return <canvas ref={canvasRef} width={130} height={130} className="radar-mfd" />;
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
interface HUDProps {
  health: number;
  maxHealth: number;
  missiles: number;
  maxMissiles: number;
  kills: number;
  requiredKills: number;
  speed: number;
  altitude: number;
  levelName: string;
  objective: string;
  warning: string;
  flares: number;
  maxFlares: number;
  rwr: boolean;
  radarContacts: RadarContact[];
  missileMode: 'ir' | 'bvr';
  radarLocked: boolean;
  onEject: () => void;
  controllerConnected?: boolean;
}

export default function HUD({
  health, maxHealth, missiles, maxMissiles, kills, requiredKills,
  speed, altitude, levelName, objective, warning, flares, maxFlares, rwr,
  radarContacts, missileMode, radarLocked,
  onEject, controllerConnected = false,
}: HUDProps) {
  const [blinkWarn, setBlinkWarn] = useState(true);
  const [gpToast, setGpToast] = useState(false);
  const prevGp = useState(controllerConnected)[0];

  useEffect(() => {
    const interval = setInterval(() => setBlinkWarn(b => !b), 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (controllerConnected && !prevGp) {
      setGpToast(true);
      const t = setTimeout(() => setGpToast(false), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [controllerConnected, prevGp]);

  const healthPct = (health / maxHealth) * 100;
  const healthColor = healthPct > 60 ? '#44ff44' : healthPct > 30 ? '#ffaa00' : '#ff3333';
  const lowHealth = healthPct <= 30;
  const modeColor = missileMode === 'bvr' ? '#ffee00' : '#44ff44';

  return (
    <div className="hud-overlay">
      {/* Crosshair */}
      <div className="crosshair">
        <div className="crosshair-line top" />
        <div className="crosshair-line bottom" />
        <div className="crosshair-line left" />
        <div className="crosshair-line right" />
        <div className="crosshair-center" />
      </div>

      {/* Top bar */}
      <div className="hud-top">
        <div className="hud-mission">
          <div className="hud-label">MISSION</div>
          <div className="hud-value">{levelName}</div>
        </div>
        <div className="hud-center-top">
          {rwr && blinkWarn && (
            <div className="hud-warning" style={{ color: '#ff6600', letterSpacing: '0.15em' }}>◆ RWR — MISSILE INBOUND</div>
          )}
          {!rwr && warning && blinkWarn && (
            <div className="hud-warning">{warning}</div>
          )}
          {gpToast && (
            <div className="hud-warning" style={{ color: '#44aaff' }}>
              CONTROLLER CONNECTED
            </div>
          )}
        </div>
        <div className="hud-kills">
          <div className="hud-label">KILLS</div>
          <div className="hud-value">{kills} / {requiredKills}</div>
        </div>
      </div>

      {/* Bottom left — health bar + radar MFD */}
      <div className="hud-bottom-left">
        <div className="hud-label">AIRFRAME</div>
        <div className="hud-bar-wrap">
          <div className="hud-bar" style={{ width: `${healthPct}%`, background: healthColor }} />
        </div>
        <div className="hud-value" style={{ color: healthColor, marginBottom: 8 }}>
          {lowHealth && blinkWarn ? '⚠ CRITICAL' : `${health}%`}
        </div>

        {/* Radar MFD */}
        <RadarMFD contacts={radarContacts} missileMode={missileMode} />
        <div className="radar-mfd-label">
          RADAR&nbsp;
          <span style={{ color: modeColor }}>
            {missileMode === 'bvr' ? 'BVR' : 'IR'}
          </span>
          {radarLocked && missileMode === 'bvr' && (
            <span className={`radar-lock-indicator${blinkWarn ? '' : ' dim'}`}>&nbsp;◆LCK</span>
          )}
        </div>
      </div>

      {/* Bottom right — weapons */}
      <div className="hud-bottom-right">
        <div className="hud-weapon">
          <div className="hud-label">CANNON</div>
          <div className="hud-value">∞ RDS</div>
        </div>
        <div className="hud-weapon">
          <div className="hud-label">MISSILES</div>
          <div className="hud-missiles">
            {Array.from({ length: maxMissiles }).map((_, i) => (
              <div
                key={i}
                className={`hud-missile-pip ${i < missiles ? (missileMode === 'bvr' ? 'bvr-active' : 'active') : 'used'}`}
              />
            ))}
          </div>
          <div className="hud-value">{missiles} RDY</div>
          <div className="hud-missile-mode" style={{ color: modeColor }}>
            {missileMode === 'bvr' ? '▣ AIM-120 BVR' : '◈ AIM-9M  IR'}
          </div>
        </div>
        <div className="hud-weapon">
          <div className="hud-label">FLARES</div>
          <div className="hud-missiles">
            {Array.from({ length: maxFlares }).map((_, i) => (
              <div key={i} className={`hud-missile-pip ${i < flares ? 'flare-pip' : 'used'}`} />
            ))}
          </div>
          <div className="hud-value">{flares} RDY</div>
        </div>
      </div>

      {/* Flight instruments — bottom center */}
      <div className="hud-instruments">
        <div className="hud-instrument">
          <div className="hud-label">SPD</div>
          <div className="hud-value">{Math.round(speed)} KT</div>
        </div>
        <div className="hud-instrument">
          <div className="hud-label">ALT</div>
          <div className="hud-value">{Math.round(altitude)} FT</div>
        </div>
      </div>

      {/* Objective ticker */}
      <div className="hud-objective">
        OBJ: {objective}
      </div>

      {/* Controls hint */}
      <div className="hud-controls">
        {controllerConnected ? (
          <>
            <span style={{ color: '#44aaff' }}>&#x25CF; CTRL</span>
            &nbsp;&nbsp;L-STICK: STEER &nbsp;|&nbsp; RT/RB: CANNON &nbsp;|&nbsp; LB: MISSILE &nbsp;|&nbsp; Y: FLARES &nbsp;|&nbsp; SELECT: MODE &nbsp;|&nbsp; B/START: EJECT
          </>
        ) : (
          <>WASD/ARROWS: STEER &nbsp;|&nbsp; SPACE: CANNON &nbsp;|&nbsp; F: MISSILE &nbsp;|&nbsp; E: FLARES &nbsp;|&nbsp; TAB: MODE &nbsp;|&nbsp; ESC: EJECT</>
        )}
      </div>

      {/* G-force vignette */}
      <div className="g-vignette" />

      {/* Cockpit frame */}
      <div className="cockpit-frame">
        <div className="cockpit-top" />
        <div className="cockpit-left" />
        <div className="cockpit-right" />
        <div className="cockpit-bottom" />
      </div>
    </div>
  );
}
