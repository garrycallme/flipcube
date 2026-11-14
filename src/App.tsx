import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameplayHud } from './components/GameplayHud';
import { MenuOverlays } from './components/MenuOverlays';
import { soundEngine } from './game/audio';
import { crazyGames } from './game/crazyGames';
import { CubeSceneManager } from './game/CubeSceneManager';
import {
  calculateStars,
  createInitialGameState,
  stepGame,
} from './game/engine';
import { getLevelById, LEVELS } from './game/levels';
import { solveFromState } from './game/solver';
import {
  createDefaultSaveData,
  loadSaveData,
  persistSaveData,
  recordLevelCompletion,
} from './game/storage';
import type {
  DPadMode,
  GameState,
  LevelDef,
  PlayerAction,
  SaveData,
  ScreenMode,
  StepResult,
} from './game/types';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CubeSceneManager | null>(null);

  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [screen, setScreen] = useState<ScreenMode>('menu');
  const [currentLevel, setCurrentLevel] = useState<LevelDef>(
    () => getLevelById(Math.min(loadSaveData().highestUnlockedLevel, LEVELS.length)) ?? LEVELS[0]
  );
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState(
      getLevelById(Math.min(loadSaveData().highestUnlockedLevel, LEVELS.length)) ?? LEVELS[0]
    )
  );
  const [lastStars, setLastStars] = useState<number>(3);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeHint, setActiveHint] = useState<PlayerAction | null>(null);
  const [hintDisabled, setHintDisabled] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);

  // Refs for synchronous access inside event listeners & animation callbacks
  const screenRef = useRef<ScreenMode>(screen);
  const levelRef = useRef<LevelDef>(currentLevel);
  const stateRef = useRef<GameState>(gameState);
  const saveRef = useRef<SaveData>(saveData);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  screenRef.current = screen;
  levelRef.current = currentLevel;
  stateRef.current = gameState;
  saveRef.current = saveData;

  const showTransientMessage = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 2800);
  }, []);

  // Initialize CrazyGames SDK v3 & sync audio settings
  useEffect(() => {
    const touchCapable =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    setIsTouchDevice(touchCapable);

    soundEngine.setSoundEnabled(saveRef.current.settings.soundEnabled);
    soundEngine.setMusicEnabled(saveRef.current.settings.musicEnabled);

    let mounted = true;
    void crazyGames.init().then((ok) => {
      if (!mounted || !ok) return;
      const merged = loadSaveData();
      setSaveData(merged);
      soundEngine.setSoundEnabled(merged.settings.soundEnabled);
      soundEngine.setMusicEnabled(merged.settings.musicEnabled);
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Sync CrazyGames gameplayStart / gameplayStop strictly with active gameplay state
  useEffect(() => {
    if (screen === 'playing') {
      crazyGames.gameplayStart();
    } else {
      crazyGames.gameplayStop();
    }
  }, [screen]);

  // Mount isolated Three.js canvas once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const manager = new CubeSceneManager(container, {
      onLand: () => soundEngine.playLand(),
      onContextLost: (lost) => setContextLost(lost),
    });
    sceneRef.current = manager;
    manager.setMenuShowcase(true);
    manager.loadLevel(levelRef.current, stateRef.current);

    return () => {
      manager.dispose();
      sceneRef.current = null;
      crazyGames.gameplayStop();
    };
  }, []);

  const loadAndStartLevel = useCallback((levelId: number) => {
    const lvl = getLevelById(levelId) ?? LEVELS[0];
    const init = createInitialGameState(lvl);
    setCurrentLevel(lvl);
    setGameState(init);
    setActiveHint(null);
    setHintDisabled(false);
    setStatusMessage(null);
    setScreen('playing');

    sceneRef.current?.setMenuShowcase(false);
    sceneRef.current?.loadLevel(lvl, init);
  }, []);

  const handleRestart = useCallback(() => {
    soundEngine.unlock();
    const init = createInitialGameState(levelRef.current);
    setGameState(init);
    setActiveHint(null);
    setHintDisabled(false);
    setStatusMessage(null);
    setScreen('playing');

    sceneRef.current?.setMenuShowcase(false);
    sceneRef.current?.resetCubeVisuals(init);
    sceneRef.current?.setHint(null, null);
  }, []);

  const handleAction = useCallback(
    (action: PlayerAction) => {
      soundEngine.unlock();
      if (screenRef.current !== 'playing') return;
      const manager = sceneRef.current;
      if (!manager || manager.isAnimating()) return;

      const lvl = levelRef.current;
      const curr = stateRef.current;
      if (curr.status !== 'playing') return;

      const result: StepResult = stepGame(lvl, curr, action);
      if (!result.valid) {
        if (result.direction) {
          soundEngine.playBlocked();
          manager.playStepTransition(result, () => undefined);
        }
        return;
      }

      // Clear active hint once player acts
      setActiveHint(null);
      manager.setHint(null, null);

      // Play immediate transition SFX
      if (result.direction) {
        soundEngine.playRoll();
      }
      for (const ev of result.events) {
        if (ev.type === 'switch_activated' || ev.type === 'switch_toggled') {
          soundEngine.playSwitch();
        } else if (ev.type === 'target_opened' || ev.type === 'target_closed') {
          soundEngine.playBridgeOrGate();
        } else if (ev.type === 'teleported') {
          soundEngine.playTeleport();
        } else if (ev.type === 'crumbled') {
          soundEngine.playCrumble();
        } else if (ev.type === 'goal_locked_hint' && ev.message) {
          showTransientMessage(ev.message);
        }
      }

      // Update React HUD moves & orientation immediately, then run 3D animation
      setGameState(result.nextState);

      manager.playStepTransition(result, (doneRes) => {
        if (doneRes.nextState.status === 'won') {
          soundEngine.playWin();
          const stars = calculateStars(lvl, doneRes.nextState.moves);
          setLastStars(stars);
          const updatedSave = recordLevelCompletion(
            saveRef.current,
            lvl.id,
            doneRes.nextState.moves,
            stars
          );
          setSaveData(updatedSave);
          setScreen('won');

          if (lvl.id === LEVELS.length) {
            crazyGames.happytime();
          }
        } else if (doneRes.nextState.status === 'failed') {
          soundEngine.playFail();
          setScreen('failed');
        }
      });
    },
    [showTransientMessage]
  );

  const handleRequestHint = useCallback(() => {
    soundEngine.unlock();
    if (screenRef.current !== 'playing') return;
    if (sceneRef.current?.isAnimating()) return;

    const res = solveFromState(levelRef.current, stateRef.current, 25000);
    if (res.solvable && res.path.length > 0) {
      const nextStep = res.path[0];
      setActiveHint(nextStep);
      setHintDisabled(false);
      sceneRef.current?.setHint(nextStep, stateRef.current);
    } else {
      setActiveHint(null);
      setHintDisabled(true);
      sceneRef.current?.setHint(null, null);
      showTransientMessage('No solution from current tiles — Restart to reset.');
    }
  }, [showTransientMessage]);

  const handlePlayContinue = useCallback(() => {
    soundEngine.unlock();
    const targetId = Math.min(saveRef.current.highestUnlockedLevel, LEVELS.length);
    loadAndStartLevel(targetId);
  }, [loadAndStartLevel]);

  const handleNextLevel = useCallback(() => {
    soundEngine.unlock();
    const nextId = Math.min(levelRef.current.id + 1, LEVELS.length);
    loadAndStartLevel(nextId);
  }, [loadAndStartLevel]);

  const handleOpenLevels = useCallback(() => {
    soundEngine.unlock();
    sceneRef.current?.setMenuShowcase(true);
    setScreen('levels');
  }, []);

  const handleOpenSettings = useCallback(() => {
    soundEngine.unlock();
    setScreen('settings');
  }, []);

  const handleBackToMenu = useCallback(() => {
    soundEngine.unlock();
    sceneRef.current?.setMenuShowcase(true);
    setScreen('menu');
  }, []);

  const handlePause = useCallback(() => {
    if (screenRef.current === 'playing') {
      setScreen('paused');
    } else if (screenRef.current === 'paused') {
      setScreen('playing');
    }
  }, []);

  const handleToggleSound = useCallback(() => {
    soundEngine.unlock();
    setSaveData((prev) => {
      const nextVal = !prev.settings.soundEnabled;
      soundEngine.setSoundEnabled(nextVal);
      const next: SaveData = {
        ...prev,
        settings: { ...prev.settings, soundEnabled: nextVal },
      };
      persistSaveData(next);
      return next;
    });
  }, []);

  const handleToggleMusic = useCallback(() => {
    soundEngine.unlock();
    setSaveData((prev) => {
      const nextVal = !prev.settings.musicEnabled;
      soundEngine.setMusicEnabled(nextVal);
      const next: SaveData = {
        ...prev,
        settings: { ...prev.settings, musicEnabled: nextVal },
      };
      persistSaveData(next);
      return next;
    });
  }, []);

  const handleChangeDpadMode = useCallback((mode: DPadMode) => {
    setSaveData((prev) => {
      const next: SaveData = {
        ...prev,
        settings: { ...prev.settings, dpadMode: mode },
      };
      persistSaveData(next);
      return next;
    });
  }, []);

  const handleResetProgress = useCallback(() => {
    const fresh = createDefaultSaveData();
    fresh.settings = { ...saveRef.current.settings };
    persistSaveData(fresh);
    setSaveData(fresh);
    const lvl1 = LEVELS[0];
    const init = createInitialGameState(lvl1);
    setCurrentLevel(lvl1);
    setGameState(init);
    sceneRef.current?.loadLevel(lvl1, init);
  }, []);

  // Keyboard Controls (prevent repeat, prevent page scroll, clear on blur)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
            e.code
          )
        ) {
          e.preventDefault();
        }
        return;
      }

      const mode = screenRef.current;

      if (mode === 'playing') {
        switch (e.code) {
          case 'ArrowUp':
          case 'KeyW':
            e.preventDefault();
            handleAction('UP');
            break;
          case 'ArrowDown':
          case 'KeyS':
            e.preventDefault();
            handleAction('DOWN');
            break;
          case 'ArrowLeft':
          case 'KeyA':
            e.preventDefault();
            handleAction('LEFT');
            break;
          case 'ArrowRight':
          case 'KeyD':
            e.preventDefault();
            handleAction('RIGHT');
            break;
          case 'Space':
            e.preventDefault();
            handleAction('WAIT');
            break;
          case 'KeyR':
            e.preventDefault();
            handleRestart();
            break;
          case 'KeyH':
            e.preventDefault();
            handleRequestHint();
            break;
          case 'Escape':
            e.preventDefault();
            handlePause();
            break;
        }
      } else if (mode === 'paused') {
        if (e.code === 'Escape') {
          e.preventDefault();
          setScreen('playing');
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          handleRestart();
        }
      } else if (mode === 'won') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (levelRef.current.id < LEVELS.length) {
            handleNextLevel();
          } else {
            handleOpenLevels();
          }
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          handleRestart();
        }
      } else if (mode === 'failed') {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') {
          e.preventDefault();
          handleRestart();
        }
      } else if (mode === 'menu') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handlePlayContinue();
        }
      }
    };

    const onBlur = () => {
      touchStartRef.current = null;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    handleAction,
    handleNextLevel,
    handleOpenLevels,
    handlePause,
    handlePlayContinue,
    handleRequestHint,
    handleRestart,
  ]);

  // Touch Swipe Detection on the 3D Viewport
  const handleTouchStart = (e: React.TouchEvent) => {
    if (screen !== 'playing' || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (screen !== 'playing' || !touchStartRef.current || e.changedTouches.length === 0) {
      touchStartRef.current = null;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 28) return;

    if (absX > absY) {
      handleAction(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      handleAction(dy > 0 ? 'DOWN' : 'UP');
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#090d1a]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Isolated WebGL Viewport Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090d1a]/95 p-6 text-center">
          <div className="max-w-sm bg-[#0d1428] border border-white/15 rounded-2xl p-6">
            <h2 className="font-display font-bold text-xl text-white">
              3D Context Paused
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              Graphics context was interrupted. Reload or tap below to restore the view.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-[44px] px-5 py-2 rounded-xl bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer"
            >
              Reload Game
            </button>
          </div>
        </div>
      )}

      {/* Active Gameplay HUD */}
      {screen === 'playing' && (
        <GameplayHud
          level={currentLevel}
          gameState={gameState}
          statusMessage={statusMessage}
          activeHint={activeHint}
          hintDisabled={hintDisabled}
          dpadMode={saveData.settings.dpadMode}
          isTouchDevice={isTouchDevice}
          onAction={handleAction}
          onRestart={handleRestart}
          onPause={handlePause}
          onRequestHint={handleRequestHint}
        />
      )}

      {/* Menu, Level Select, Settings, Pause, Victory, Failure Modals */}
      <MenuOverlays
        screen={screen}
        saveData={saveData}
        currentLevel={currentLevel}
        lastMoves={gameState.moves}
        lastStars={lastStars}
        failReason={gameState.failReason}
        onPlayContinue={handlePlayContinue}
        onStartLevel={loadAndStartLevel}
        onOpenLevels={handleOpenLevels}
        onOpenSettings={handleOpenSettings}
        onBackToMenu={handleBackToMenu}
        onResume={() => setScreen('playing')}
        onRestart={handleRestart}
        onNextLevel={handleNextLevel}
        onToggleSound={handleToggleSound}
        onToggleMusic={handleToggleMusic}
        onChangeDpadMode={handleChangeDpadMode}
        onResetProgress={handleResetProgress}
      />
    </div>
  );
}
