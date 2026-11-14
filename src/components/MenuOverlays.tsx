import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Grid2x2,
  Lock,
  Music,
  Play,
  RotateCcw,
  Settings,
  Star,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LEVELS, WORLDS } from '../game/levels';
import type { DPadMode, LevelDef, SaveData, ScreenMode } from '../game/types';
import { GameLogo } from './GameLogo';

interface MenuOverlaysProps {
  screen: ScreenMode;
  saveData: SaveData;
  currentLevel: LevelDef;
  lastMoves: number;
  lastStars: number;
  failReason?: string;
  onPlayContinue: () => void;
  onStartLevel: (levelId: number) => void;
  onOpenLevels: () => void;
  onOpenSettings: () => void;
  onBackToMenu: () => void;
  onResume: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onChangeDpadMode: (mode: DPadMode) => void;
  onResetProgress: () => void;
}

const StarRow: React.FC<{ stars: number; size?: number }> = ({ stars, size = 18 }) => (
  <div className="flex items-center gap-1" aria-label={`${stars} of 3 stars`}>
    {[1, 2, 3].map((i) => (
      <Star
        key={i}
        size={size}
        className={
          i <= stars
            ? 'text-amber-400 fill-amber-400'
            : 'text-slate-600 fill-slate-800/60'
        }
      />
    ))}
  </div>
);

export const MenuOverlays: React.FC<MenuOverlaysProps> = ({
  screen,
  saveData,
  currentLevel,
  lastMoves,
  lastStars,
  failReason,
  onPlayContinue,
  onStartLevel,
  onOpenLevels,
  onOpenSettings,
  onBackToMenu,
  onResume,
  onRestart,
  onNextLevel,
  onToggleSound,
  onToggleMusic,
  onChangeDpadMode,
  onResetProgress,
}) => {
  const [selectedWorld, setSelectedWorld] = useState<number>(currentLevel.worldId || 1);
  const [confirmReset, setConfirmReset] = useState(false);

  const totalStars = Object.values(saveData.levels).reduce((acc, l) => acc + l.stars, 0);
  const completedCount = Object.values(saveData.levels).filter((l) => l.completed).length;
  const maxStars = LEVELS.length * 3;
  const hasNextLevel = currentLevel.id < LEVELS.length;

  if (screen === 'playing') return null;

  // 1. MAIN MENU (Staged on calm left/bottom negative space so live 3D diorama shines)
  if (screen === 'menu') {
    const resumeId = Math.min(saveData.highestUnlockedLevel, LEVELS.length);
    const hasProgress = completedCount > 0 || saveData.highestUnlockedLevel > 1;

    return (
      <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-10 pointer-events-none">
        {/* Top Row: Quiet progress summary + Quick Audio */}
        <div className="flex items-center justify-between gap-4 pointer-events-auto">
          <div className="text-xs sm:text-sm text-slate-300 font-medium flex items-center gap-2 bg-[#0b1122]/85 border border-white/10 rounded-lg px-3.5 py-2">
            <span className="font-mono-num text-amber-400 font-semibold">{totalStars}/{maxStars}</span>
            <span>Stars</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono-num text-cyan-300 font-semibold">{completedCount}/{LEVELS.length}</span>
            <span>Cleared</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={saveData.settings.soundEnabled ? 'Mute Sound Effects' : 'Enable Sound Effects'}
              title={saveData.settings.soundEnabled ? 'Sound On' : 'Sound Off'}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                saveData.settings.soundEnabled
                  ? 'bg-[#0b1122]/90 border-white/15 text-slate-100 hover:border-cyan-400/50'
                  : 'bg-[#0b1122]/90 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              {saveData.settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span className="hidden sm:inline">SFX</span>
            </button>
            <button
              type="button"
              onClick={onToggleMusic}
              aria-label={saveData.settings.musicEnabled ? 'Mute Music' : 'Enable Music'}
              title={saveData.settings.musicEnabled ? 'Music On' : 'Music Off'}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                saveData.settings.musicEnabled
                  ? 'bg-[#0b1122]/90 border-white/15 text-slate-100 hover:border-cyan-400/50'
                  : 'bg-[#0b1122]/90 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music size={16} />
              <span className="hidden sm:inline">{saveData.settings.musicEnabled ? 'Music On' : 'Music Off'}</span>
            </button>
          </div>
        </div>

        {/* Bottom-Left Anchor: Title Lockup + Primary CTA */}
        <div className="max-w-md pointer-events-auto bg-[#0b1122]/90 border border-white/12 rounded-2xl p-6 sm:p-7 shadow-2xl">
          <GameLogo />

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onPlayContinue}
              className="w-full min-h-[48px] px-6 py-3 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-display font-bold text-base sm:text-lg rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-amber-500/20 whitespace-nowrap"
            >
              <Play size={20} className="fill-slate-950" />
              <span>{hasProgress ? `Continue · Level ${resumeId}` : 'Play Game'}</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenLevels}
                className="min-h-[44px] px-4 py-2.5 bg-slate-800/90 hover:bg-slate-700/90 border border-white/10 text-slate-100 font-medium text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Grid2x2 size={17} />
                <span>Levels</span>
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="min-h-[44px] px-4 py-2.5 bg-slate-800/90 hover:bg-slate-700/90 border border-white/10 text-slate-100 font-medium text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Settings size={17} />
                <span>Settings</span>
              </button>
            </div>
          </div>

          <p className="mt-5 pt-4 border-t border-white/10 text-xs text-slate-400 text-center">
            WASD / Arrows Roll · Space Wait · R Restart · Esc Pause
          </p>
        </div>
      </div>
    );
  }

  // 2. LEVEL SELECT SCREEN
  if (screen === 'levels') {
    const activeWorld = WORLDS.find((w) => w.id === selectedWorld) ?? WORLDS[0];
    const worldLevels = LEVELS.filter((l) => l.worldId === activeWorld.id);

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#070b17]/88">
        <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0d1428] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
            <button
              type="button"
              onClick={onBackToMenu}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft size={16} />
              <span>Menu</span>
            </button>

            <h2 className="font-display font-bold text-lg sm:text-xl text-white">
              Select Level
            </h2>

            <div className="text-xs sm:text-sm text-slate-300 font-mono-num whitespace-nowrap shrink-0">
              {totalStars} / {maxStars} Stars
            </div>
          </div>

          {/* World Tabs */}
          <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/10 overflow-x-auto">
            {WORLDS.map((w) => {
              const wLevels = LEVELS.filter((l) => l.worldId === w.id);
              const wStars = wLevels.reduce(
                (sum, l) => sum + (saveData.levels[l.id]?.stars ?? 0),
                0
              );
              const isSelected = w.id === selectedWorld;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWorld(w.id)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>
                    {w.id}. {w.name}
                  </span>
                  <span
                    className={`font-mono-num text-xs ${
                      isSelected ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {wStars}/15
                  </span>
                </button>
              );
            })}
          </div>

          {/* World Subtitle + Level Grid */}
          <div className="p-5 overflow-y-auto flex-1">
            <div className="mb-4">
              <h3 className="font-display font-semibold text-base text-white">
                World {activeWorld.id}: {activeWorld.name}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                {activeWorld.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {worldLevels.map((lvl) => {
                const unlocked = lvl.id <= saveData.highestUnlockedLevel;
                const prog = saveData.levels[lvl.id];
                const isCurrent = lvl.id === saveData.highestUnlockedLevel;

                return (
                  <button
                    key={lvl.id}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => unlocked && onStartLevel(lvl.id)}
                    className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[116px] ${
                      unlocked
                        ? isCurrent
                          ? 'bg-slate-800/95 border-amber-400/70 hover:border-amber-300 cursor-pointer'
                          : 'bg-slate-900/90 border-white/10 hover:border-cyan-400/50 hover:bg-slate-800/90 cursor-pointer'
                        : 'bg-slate-950/60 border-white/5 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-mono-num text-slate-400">
                          Level {lvl.id}
                          {isCurrent && !prog?.completed ? ' · Next' : ''}
                        </div>
                        <div className="font-display font-semibold text-base text-white mt-0.5">
                          {lvl.name}
                        </div>
                      </div>

                      {!unlocked ? (
                        <Lock size={17} className="text-slate-500 shrink-0 mt-0.5" />
                      ) : prog?.completed ? (
                        <Check size={17} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 pt-2.5 border-t border-white/8">
                      <StarRow stars={prog?.stars ?? 0} size={15} />
                      <span className="text-xs font-mono-num text-slate-400">
                        {prog?.bestMoves != null
                          ? `Best ${prog.bestMoves} · Par ${lvl.parMoves}`
                          : `Par ${lvl.parMoves}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. SETTINGS MODAL
  if (screen === 'settings') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b17]/88">
        <div className="w-full max-w-md bg-[#0d1428] border border-white/12 rounded-2xl shadow-2xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h2 className="font-display font-bold text-xl text-white">Settings</h2>
            <button
              type="button"
              onClick={onBackToMenu}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium cursor-pointer whitespace-nowrap"
            >
              Done
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">Sound Effects</div>
                <div className="text-xs text-slate-400">Rolling, switch, and portal audio</div>
              </div>
              <button
                type="button"
                onClick={onToggleSound}
                className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  saveData.settings.soundEnabled
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {saveData.settings.soundEnabled ? 'Enabled' : 'Muted'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">Ambient Music</div>
                <div className="text-xs text-slate-400">Procedural synth soundtrack</div>
              </div>
              <button
                type="button"
                onClick={onToggleMusic}
                className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  saveData.settings.musicEnabled
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {saveData.settings.musicEnabled ? 'Enabled' : 'Muted'}
              </button>
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="text-sm font-medium text-white mb-2">On-Screen Controls</div>
              <div className="grid grid-cols-3 gap-2">
                {(['auto', 'always', 'off'] as DPadMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChangeDpadMode(mode)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                      saveData.settings.dpadMode === mode
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/30 text-rose-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 size={16} />
                  <span>Reset Saved Progress</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 flex flex-col gap-2.5">
                  <span className="text-xs text-rose-200 text-center">
                    Erase all unlocked levels and stars?
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onResetProgress();
                        setConfirmReset(false);
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Confirm Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. PAUSE MODAL
  if (screen === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b17]/82">
        <div className="w-full max-w-sm bg-[#0d1428] border border-white/12 rounded-2xl shadow-2xl p-6">
          <div className="text-xs font-mono-num text-slate-400">
            World {currentLevel.worldId} · Level {currentLevel.id}
          </div>
          <h2 className="font-display font-bold text-2xl text-white mt-0.5">
            Paused
          </h2>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full min-h-[46px] px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play size={18} className="fill-slate-950" />
              <span>Resume</span>
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full min-h-[44px] px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={17} />
              <span>Restart Level</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onToggleSound}
                className="min-h-[44px] px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {saveData.settings.soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                <span>{saveData.settings.soundEnabled ? 'SFX On' : 'SFX Off'}</span>
              </button>
              <button
                type="button"
                onClick={onToggleMusic}
                className="min-h-[44px] px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Music size={15} />
                <span>{saveData.settings.musicEnabled ? 'Music On' : 'Music Off'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onOpenLevels}
                className="min-h-[44px] px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-medium rounded-xl cursor-pointer"
              >
                Level Select
              </button>
              <button
                type="button"
                onClick={onBackToMenu}
                className="min-h-[44px] px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-medium rounded-xl cursor-pointer"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. LEVEL COMPLETE MODAL
  if (screen === 'won') {
    const bestMoves = saveData.levels[currentLevel.id]?.bestMoves ?? lastMoves;
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b17]/82">
        <div className="w-full max-w-sm bg-[#0d1428] border border-emerald-400/30 rounded-2xl shadow-2xl p-6 text-center">
          <div className="text-xs font-mono-num text-emerald-400 font-semibold">
            Level {currentLevel.id} Complete
          </div>
          <h2 className="font-display font-bold text-2xl text-white mt-1">
            {currentLevel.name}
          </h2>

          <div className="mt-4 flex justify-center">
            <StarRow stars={lastStars} size={32} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 py-3 px-3 rounded-xl bg-slate-900/80 border border-white/8">
            <div>
              <div className="text-[11px] text-slate-400">Moves</div>
              <div className="font-mono-num text-lg font-bold text-white">{lastMoves}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Best</div>
              <div className="font-mono-num text-lg font-bold text-amber-400">{bestMoves}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Par (3★)</div>
              <div className="font-mono-num text-lg font-bold text-cyan-300">
                {currentLevel.parMoves}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {hasNextLevel ? (
              <button
                type="button"
                onClick={onNextLevel}
                className="w-full min-h-[48px] px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play size={18} className="fill-slate-950" />
                <span>Next Level</span>
              </button>
            ) : (
              <div className="py-2 text-sm font-medium text-amber-300">
                All 25 Levels Mastered!
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onRestart}
                className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Replay</span>
              </button>
              <button
                type="button"
                onClick={onOpenLevels}
                className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl cursor-pointer"
              >
                Levels
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 6. LEVEL FAILED MODAL
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b17]/82">
      <div className="w-full max-w-sm bg-[#0d1428] border border-rose-500/35 rounded-2xl shadow-2xl p-6 text-center">
        <div className="text-xs font-mono-num text-rose-400 font-semibold">
          Level {currentLevel.id} Failed
        </div>
        <h2 className="font-display font-bold text-2xl text-white mt-1">
          {failReason || 'Obstacle Hit'}
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          Regroup and try a different route.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[48px] px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw size={18} />
            <span>Retry Level</span>
          </button>
          <button
            type="button"
            onClick={onOpenLevels}
            className="w-full min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl cursor-pointer"
          >
            Return to Level Select
          </button>
        </div>
      </div>
    </div>
  );
};
