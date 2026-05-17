import { useEffect, useState } from 'react';
import { Level } from '../data/levels';

interface MissionCompleteProps {
  level: Level;
  kills: number;
  onContinue: () => void;
}

export default function MissionComplete({ level, kills, onContinue }: MissionCompleteProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') onContinue();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onContinue]);

  if (!show) return <div style={{ background: '#000', width: '100vw', height: '100vh' }} />;

  return (
    <div className="result-screen mission-complete">
      <div className="scanlines" />
      <div className="result-content">
        <div className="result-top-line">— TRANSMISSION RECEIVED —</div>
        <div className="result-title complete">MISSION ACCOMPLISHED</div>
        <div className="title-divider">{'═'.repeat(36)}</div>
        <div className="result-mission-name">{level.name}</div>

        <div className="result-stats">
          <div className="result-stat">
            <span className="stat-label">ENEMY AIRCRAFT DESTROYED</span>
            <span className="stat-value">{kills}</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">OBJECTIVE STATUS</span>
            <span className="stat-value complete">COMPLETE</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">PILOT STATUS</span>
            <span className="stat-value complete">ALIVE</span>
          </div>
        </div>

        <div className="title-divider">{'─'.repeat(36)}</div>

        <div className="result-message">
          {level.id === 5
            ? 'You have defeated the Phantom. There is only one Ace of Aces. You.'
            : `Well done, pilot. The sky is ours. Return to base for the next briefing.`
          }
        </div>

        <div className="result-action">[ PRESS ENTER TO CONTINUE ]</div>
      </div>
    </div>
  );
}
