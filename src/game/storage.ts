import { crazyGames } from './crazyGames';
import { LEVELS } from './levels';
import type { DPadMode, LevelProgress, SaveData } from './types';

const SAVE_KEY = 'cube_flip_save_v1';
const TOTAL_LEVELS = LEVELS.length;

export function createDefaultSaveData(): SaveData {
  return {
    version: 1,
    highestUnlockedLevel: 1,
    levels: {},
    settings: {
      soundEnabled: true,
      musicEnabled: true,
      dpadMode: 'auto',
    },
  };
}

function sanitizeSaveData(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const defaults = createDefaultSaveData();
  const highestUnlocked =
    typeof obj.highestUnlockedLevel === 'number' &&
    Number.isFinite(obj.highestUnlockedLevel)
      ? Math.max(1, Math.min(TOTAL_LEVELS, Math.floor(obj.highestUnlockedLevel)))
      : defaults.highestUnlockedLevel;

  const sanitizedLevels: Record<number, LevelProgress> = {};
  if (obj.levels && typeof obj.levels === 'object') {
    for (const [k, v] of Object.entries(obj.levels as Record<string, unknown>)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS) continue;
      if (!v || typeof v !== 'object') continue;
      const entry = v as Record<string, unknown>;
      const completed = Boolean(entry.completed);
      const stars =
        typeof entry.stars === 'number' && Number.isFinite(entry.stars)
          ? Math.max(0, Math.min(3, Math.floor(entry.stars)))
          : 0;
      const bestMoves =
        typeof entry.bestMoves === 'number' &&
        Number.isFinite(entry.bestMoves) &&
        entry.bestMoves > 0
          ? Math.floor(entry.bestMoves)
          : null;
      sanitizedLevels[id] = { completed, stars, bestMoves };
    }
  }

  let soundEnabled = defaults.settings.soundEnabled;
  let musicEnabled = defaults.settings.musicEnabled;
  let dpadMode: DPadMode = defaults.settings.dpadMode;

  if (obj.settings && typeof obj.settings === 'object') {
    const s = obj.settings as Record<string, unknown>;
    if (typeof s.soundEnabled === 'boolean') soundEnabled = s.soundEnabled;
    if (typeof s.musicEnabled === 'boolean') musicEnabled = s.musicEnabled;
    if (s.dpadMode === 'auto' || s.dpadMode === 'always' || s.dpadMode === 'off') {
      dpadMode = s.dpadMode;
    }
  }

  return {
    version: 1,
    highestUnlockedLevel: highestUnlocked,
    levels: sanitizedLevels,
    settings: {
      soundEnabled,
      musicEnabled,
      dpadMode,
    },
  };
}

function tryParseSave(json: string | null): SaveData | null {
  if (!json) return null;
  try {
    return sanitizeSaveData(JSON.parse(json));
  } catch {
    return null;
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

/**
 * Loads saved progress from CrazyGames Data Module (when initialized) and localStorage,
 * merging safely if both exist so existing player progress is never overwritten by defaults.
 */
export function loadSaveData(): SaveData {
  const cgSave = tryParseSave(crazyGames.dataGetItem(SAVE_KEY));
  const localSave = tryParseSave(safeLocalGet(SAVE_KEY));

  if (cgSave && localSave) {
    // Merge keeping higher progress across both sources
    const mergedLevels: Record<number, LevelProgress> = { ...localSave.levels };
    for (const [idStr, cgProg] of Object.entries(cgSave.levels)) {
      const id = Number(idStr);
      const localProg = mergedLevels[id];
      if (!localProg) {
        mergedLevels[id] = cgProg;
      } else {
        mergedLevels[id] = {
          completed: localProg.completed || cgProg.completed,
          stars: Math.max(localProg.stars, cgProg.stars),
          bestMoves:
            localProg.bestMoves !== null && cgProg.bestMoves !== null
              ? Math.min(localProg.bestMoves, cgProg.bestMoves)
              : localProg.bestMoves ?? cgProg.bestMoves,
        };
      }
    }
    return {
      version: 1,
      highestUnlockedLevel: Math.max(
        cgSave.highestUnlockedLevel,
        localSave.highestUnlockedLevel
      ),
      levels: mergedLevels,
      settings: cgSave.settings,
    };
  }

  return cgSave ?? localSave ?? createDefaultSaveData();
}

export function persistSaveData(data: SaveData): void {
  const serialized = JSON.stringify(data);
  crazyGames.dataSetItem(SAVE_KEY, serialized);
  safeLocalSet(SAVE_KEY, serialized);
}

export function recordLevelCompletion(
  current: SaveData,
  levelId: number,
  moves: number,
  stars: number
): SaveData {
  const prev = current.levels[levelId];
  const updatedProgress: LevelProgress = {
    completed: true,
    stars: Math.max(prev?.stars ?? 0, stars),
    bestMoves:
      prev?.bestMoves !== null && prev?.bestMoves !== undefined
        ? Math.min(prev.bestMoves, moves)
        : moves,
  };

  const nextUnlocked = Math.min(
    TOTAL_LEVELS,
    Math.max(current.highestUnlockedLevel, levelId + 1)
  );

  const next: SaveData = {
    ...current,
    highestUnlockedLevel: nextUnlocked,
    levels: {
      ...current.levels,
      [levelId]: updatedProgress,
    },
  };

  persistSaveData(next);
  return next;
}
