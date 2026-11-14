import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  Lightbulb,
  Pause,
  RotateCcw,
} from 'lucide-react';
import type {
  CubeFaceId,
  DPadMode,
  GameState,
  LevelDef,
  PlayerAction,
} from '../game/types';

interface GameplayHudProps {
  level: LevelDef;
  gameState: GameState;
  statusMessage: string | null;
  activeHint: PlayerAction | null;
  hintDisabled: boolean;
  dpadMode: DPadMode;
  isTouchDevice: boolean;
  onAction: (action: PlayerAction) => void;
  onRestart: () => void;
  onPause: () => void;
  onRequestHint: () => void;
}

function FaceSwatch({ face, label }: { face: CubeFaceId; label: string }) {
  const colorClass =
    face === 'GOLD'
      ? 'bg-amber-400 border-amber-200 text-amber-300'
      : face === 'CYAN'
        ? 'bg-cyan-400 border-cyan-200 text-cyan-300'
        : 'bg-slate-300 border-slate-100 text-slate-300';

  const faceName = face === 'GOLD' ? 'Gold' : face === 'CYAN' ? 'Cyan' : 'White';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span
        className={`w-3 h-3 rounded-[3px] border inline-block shrink-0 ${colorClass.split(' ').slice(0, 2).join(' ')}`}
      />
      <span className={`text-xs font-medium ${colorClass.split(' ')[2]}`}>
        {faceName}
      </span>
    </div>
  );
}

export const GameplayHud: React.FC<GameplayHudProps> = ({
  level,
  gameState,
  statusMessage,
  activeHint,
  hintDisabled,
  dpadMode,
  isTouchDevice,
  onAction,
  onRestart,
  onPause,
  onRequestHint,
}) => {
  const hasMoving = (level.movingPlatforms?.length ?? 0) > 0;
  const showDpad =
    dpadMode === 'always' || (dpadMode === 'auto' && isTouchDevice);

  const hintLabel =
    activeHint === 'UP'
      ? 'Hint: Roll Up'
      : activeHint === 'DOWN'
        ? 'Hint: Roll Down'
        : activeHint === 'LEFT'
          ? 'Hint: Roll Left'
          : activeHint === 'RIGHT'
            ? 'Hint: Roll Right'
            : activeHint === 'WAIT'
              ? 'Hint: Wait 1 Turn (Space)'
              : null;

  const bannerText = hintLabel || statusMessage || level.hintBanner || null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3.5 sm:p-5">
      {/* Top Perimeter Bar */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left Level & Moves Cluster */}
        <div className="pointer-events-auto bg-[#0b1122]/88 border border-white/10 rounded-xl px-3.5 py-2.5 flex flex-col gap-1.5 shadow-lg">
          <div className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap">
            <span className="font-mono-num text-amber-400 font-semibold">
              L{level.id}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-display font-semibold text-white">
              {level.name}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Moves</span>
              <span className="font-mono-num text-sm font-bold text-white">
                {gameState.moves}
              </span>
              <span className="font-mono-num text-slate-500">
                / {level.parMoves}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">|</span>
            <FaceSwatch face={gameState.orientation.top} label="Top" />
            <FaceSwatch face={gameState.orientation.bottom} label="Down" />
          </div>
        </div>

        {/* Top-Right Compact Action Cluster */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            disabled={hintDisabled}
            onClick={onRequestHint}
            title="Show Next Move Hint (H)"
            aria-label="Hint"
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              hintDisabled
                ? 'bg-[#0b1122]/60 border-white/5 text-slate-500 cursor-not-allowed'
                : 'bg-[#0b1122]/88 border-white/12 text-amber-300 hover:border-amber-400/60 hover:bg-slate-800/90 cursor-pointer'
            }`}
          >
            <Lightbulb size={16} />
            <span className="hidden sm:inline">Hint</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            title="Restart Level (R)"
            aria-label="Restart Level"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0b1122]/88 border border-white/12 text-slate-200 hover:border-cyan-400/50 hover:bg-slate-800/90 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">Restart</span>
          </button>

          <button
            type="button"
            onClick={onPause}
            title="Pause (Esc)"
            aria-label="Pause"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0b1122]/88 border border-white/12 text-slate-200 hover:border-white/30 hover:bg-slate-800/90 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pause size={16} />
            <span className="hidden sm:inline">Pause</span>
          </button>
        </div>
      </div>

      {/* Bottom Perimeter: Tip Banner + Optional Touch / Click D-Pad */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1 flex justify-start sm:justify-center">
          {bannerText && (
            <div className="bg-[#0b1122]/88 border border-white/12 rounded-xl px-4 py-2 text-xs sm:text-sm text-slate-200 max-w-lg shadow-lg">
              {bannerText}
            </div>
          )}
        </div>

        {(showDpad || hasMoving) && (
          <div className="pointer-events-auto flex items-end gap-2.5 shrink-0">
            {hasMoving && (
              <button
                type="button"
                onClick={() => onAction('WAIT')}
                title="Wait 1 Turn (Space)"
                className="min-h-[48px] px-3.5 py-2 rounded-xl bg-[#0b1122]/90 border border-indigo-400/40 hover:border-indigo-300 active:scale-95 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition-transform cursor-pointer whitespace-nowrap"
              >
                <Clock size={16} />
                <span>Wait</span>
              </button>
            )}

            {showDpad && (
              <div className="grid grid-cols-3 gap-1.5 w-[156px]">
                <div />
                <button
                  type="button"
                  onClick={() => onAction('UP')}
                  aria-label="Roll Up"
                  className="w-12 h-12 rounded-xl bg-[#0b1122]/90 border border-white/15 active:bg-amber-400 active:text-slate-950 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowUp size={20} />
                </button>
                <div />
                <button
                  type="button"
                  onClick={() => onAction('LEFT')}
                  aria-label="Roll Left"
                  className="w-12 h-12 rounded-xl bg-[#0b1122]/90 border border-white/15 active:bg-amber-400 active:text-slate-950 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onAction('DOWN')}
                  aria-label="Roll Down"
                  className="w-12 h-12 rounded-xl bg-[#0b1122]/90 border border-white/15 active:bg-amber-400 active:text-slate-950 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowDown size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onAction('RIGHT')}
                  aria-label="Roll Right"
                  className="w-12 h-12 rounded-xl bg-[#0b1122]/90 border border-white/15 active:bg-amber-400 active:text-slate-950 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
