import { useEffect, useState } from 'react';
import { Level } from '../data/levels';

interface BriefingProps {
  level: Level;
  onLaunch: () => void;
  onBack: () => void;
}

export default function Briefing({ level, onLaunch, onBack }: BriefingProps) {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    setVisibleLines(0);
    const interval = setInterval(() => {
      setVisibleLines(v => {
        if (v >= level.briefing.length) {
          clearInterval(interval);
          return v;
        }
        return v + 1;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [level]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') onLaunch();
      if (e.code === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onLaunch, onBack]);

  return (
    <div className="briefing-screen">
      <div className="scanlines" />
      <div className="briefing-content">
        <div className="briefing-header">
          <div className="briefing-codename">{level.codename}</div>
          <div className="briefing-title">{level.name}</div>
          <div className="title-divider">{'─'.repeat(40)}</div>
        </div>

        <div className="briefing-body">
          {level.briefing.slice(0, visibleLines).map((line, i) => (
            <div key={i} className={`briefing-line ${line === '' ? 'briefing-gap' : ''}`}>
              {line}
            </div>
          ))}
          {visibleLines < level.briefing.length && (
            <span className="cursor-blink">█</span>
          )}
        </div>

        <div className="briefing-footer">
          <div className="title-divider">{'─'.repeat(40)}</div>
          <div className="briefing-objective">
            <span className="obj-label">OBJECTIVE: </span>
            <span className="obj-text">{level.objective}</span>
          </div>
          <div className="briefing-actions">
            <button className="briefing-btn" onClick={onBack}>[ESC] ABORT</button>
            <button className="briefing-btn primary" onClick={onLaunch}>[ENTER] LAUNCH</button>
          </div>
        </div>
      </div>
    </div>
  );
}
