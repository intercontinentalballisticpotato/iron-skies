import { useEffect, useState } from 'react';

interface MainMenuProps {
  onStart: () => void;
}

export default function MainMenu({ onStart }: MainMenuProps) {
  const [blink, setBlink] = useState(true);
  const [scanline, setScanline] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setScanline(s => (s + 1) % 100), 16);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') onStart();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onStart]);

  return (
    <div className="main-menu" onClick={onStart} style={{ cursor: 'pointer' }}>
      <div className="scanlines" />
      <div className="menu-content">
        <div className="title-block">
          <div className="title-top">— CLASSIFIED —</div>
          <div className="title-main">
            <span className="title-retro">IRON</span>
            <span className="title-accent"> SKIES</span>
          </div>
          <div className="title-sub">COMBAT FLIGHT SIMULATOR</div>
          <div className="title-divider">{'═'.repeat(36)}</div>
        </div>

        <div className="menu-art">
          <pre className="jet-ascii">{`
       /\\
      /  \\
     / /\\ \\
    / /  \\ \\
   /_/ /\\ \\_\\
   \\_\\/  \\/_/
       ||
      /||\\
     / || \\
    /  ||  \\
          `}</pre>
        </div>

        <div className="menu-stats">
          <div className="stat-row">
            <span>MISSIONS</span><span>05</span>
          </div>
          <div className="stat-row">
            <span>AIRCRAFT</span><span>F-16 VIPER</span>
          </div>
          <div className="stat-row">
            <span>THREAT LEVEL</span><span>MAXIMUM</span>
          </div>
        </div>

        <div className="title-divider">{'═'.repeat(36)}</div>

        <div className="press-start" style={{ opacity: blink ? 1 : 0 }}>[ PRESS ENTER TO SCRAMBLE ]</div>

        <div className="menu-footer">
          <span>ARROW KEYS / WASD — STEER</span>
          <span>SPACE — FIRE CANNON</span>
          <span>F — FIRE MISSILE</span>
        </div>
      </div>
    </div>
  );
}
