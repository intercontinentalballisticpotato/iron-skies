import { useState, useCallback, useEffect } from 'react';
import MainMenu from './components/MainMenu';
import LevelSelector from './components/LevelSelector';
import Briefing from './components/Briefing';
import MissionComplete from './components/MissionComplete';
import GameOver from './components/GameOver';
import FlightGame from './game/FlightGame';
import { Level, LEVELS } from './data/levels';
import { soundManager } from './game/SoundManager';

type Screen = 'menu' | 'selector' | 'briefing' | 'game' | 'complete' | 'gameover';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [selectedLevel, setSelectedLevel] = useState<Level>(LEVELS[0]);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const [lastKills, setLastKills] = useState(0);
  const [gameKey, setGameKey] = useState(0); // force remount on retry

  const handleStart = useCallback(() => setScreen('selector'), []);
  const handleSelectLevel = useCallback((level: Level) => {
    setSelectedLevel(level);
    setScreen('briefing');
  }, []);
  const handleLaunch = useCallback(() => setScreen('game'), []);
  const handleBack = useCallback(() => setScreen('selector'), []);
  const handleBackToMenu = useCallback(() => setScreen('menu'), []);

  const handleMissionComplete = useCallback(() => {
    setLastKills(selectedLevel.requiredKills);
    setCompletedLevels(prev =>
      prev.includes(selectedLevel.id) ? prev : [...prev, selectedLevel.id]
    );
    setScreen('complete');
  }, [selectedLevel]);

  const handleGameOver = useCallback(() => {
    setScreen('gameover');
  }, []);

  const handleEject = useCallback(() => {
    setScreen('selector');
  }, []);

  const handleRetry = useCallback(() => {
    setGameKey(k => k + 1);
    setScreen('game');
  }, []);

  // Start ambient music on menu, stop it when leaving
  useEffect(() => {
    if (screen === 'menu') {
      soundManager.playMenuMusic();
    } else {
      soundManager.stopMenuMusic();
    }
  }, [screen]);

  const handleContinue = useCallback(() => {
    // Advance to next level or go back to selector
    const nextIdx = LEVELS.findIndex(l => l.id === selectedLevel.id) + 1;
    if (nextIdx < LEVELS.length) {
      setSelectedLevel(LEVELS[nextIdx]);
      setScreen('briefing');
    } else {
      setScreen('selector');
    }
  }, [selectedLevel]);

  return (
    <div className="app-root">
      {screen === 'menu' && (
        <MainMenu onStart={handleStart} />
      )}
      {screen === 'selector' && (
        <LevelSelector
          completedLevels={completedLevels}
          onSelectLevel={handleSelectLevel}
          onBack={handleBackToMenu}
        />
      )}
      {screen === 'briefing' && (
        <Briefing
          level={selectedLevel}
          onLaunch={handleLaunch}
          onBack={handleBack}
        />
      )}
      {screen === 'game' && (
        <FlightGame
          key={gameKey}
          level={selectedLevel}
          onGameOver={handleGameOver}
          onMissionComplete={handleMissionComplete}
          onEject={handleEject}
        />
      )}
      {screen === 'complete' && (
        <MissionComplete
          level={selectedLevel}
          kills={lastKills}
          onContinue={handleContinue}
        />
      )}
      {screen === 'gameover' && (
        <GameOver
          level={selectedLevel}
          kills={lastKills}
          onRetry={handleRetry}
          onMenu={handleBackToMenu}
        />
      )}
    </div>
  );
}
