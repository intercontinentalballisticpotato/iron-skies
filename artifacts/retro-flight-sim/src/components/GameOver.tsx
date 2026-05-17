import { useEffect, useState } from 'react';
import { Level } from '../data/levels';

interface GameOverProps {
  level: Level;
  kills: number;
  onRetry: () => void;
  onMenu: () => void;
}

export default function GameOver({ level, kills, onRetry, onMenu }: GameOverProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') onRetry();
      if (e.code === 'Escape') onMenu();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onRetry, onMenu]);

  if (!show) return <div style={{ background: '#000', width: '100vw', height: '100vh' }} />;

  return (
    <div className="result-screen game-over">
      <div className="scanlines" />
      <div className="result-content">
        <div className="result-top-line">— MAYDAY MAYDAY MAYDAY —</div>
        <div className="result-title gameover">MISSION FAILED</div>
        <div className="title-divider">{'═'.repeat(36)}</div>
        <div className="result-mission-name">{level.name}</div>

        <div className="result-stats">
          <div className="result-stat">
            <span className="stat-label">ENEMY AIRCRAFT DESTROYED</span>
            <span className="stat-value">{kills}</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">OBJECTIVE STATUS</span>
            <span className="stat-value gameover">FAILED</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">PILOT STATUS</span>
            <span className="stat-value gameover">KIA</span>
          </div>
        </div>

        <div className="title-divider">{'─'.repeat(36)}</div>

        <div className="result-message">
          The skies are unforgiving. You knew that when you climbed in the cockpit.
          Regroup. Debrief. Go again.
        </div>

        <div className="result-actions">
          <button className="result-btn primary" onClick={onRetry}>[ENTER] FLY AGAIN</button>
          <button className="result-btn" onClick={onMenu}>[ESC] MAIN MENU</button>
        </div>
      </div>
    </div>
  );
}
