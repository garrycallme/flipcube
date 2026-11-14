import { stepGame } from './engine';
import type { GameState, LevelDef, PlayerAction } from './types';

function serializeState(s: GameState): string {
  const o = s.orientation;
  return [
    s.cubePos.x,
    s.cubePos.z,
    o.top,
    o.bottom,
    o.front,
    o.back,
    o.left,
    o.right,
    s.activatedSwitches.join(';'),
    s.openTargets.join(';'),
    s.brokenTiles.join(';'),
    s.crackedTile ?? '',
    s.movingSteps.join(','),
  ].join('|');
}

export interface SolveResult {
  solvable: boolean;
  optimalMoves: number;
  path: PlayerAction[];
  exploredStates: number;
}

/**
 * Deterministic Breadth-First Search solver using the exact engine transitions.
 * Computes the true shortest-move solution from any GameState.
 */
export function solveFromState(
  level: LevelDef,
  initialState: GameState,
  maxStates = 25000
): SolveResult {
  if (initialState.status === 'won') {
    return { solvable: true, optimalMoves: 0, path: [], exploredStates: 1 };
  }
  if (initialState.status === 'failed') {
    return { solvable: false, optimalMoves: -1, path: [], exploredStates: 1 };
  }

  const actions: PlayerAction[] =
    (level.movingPlatforms?.length ?? 0) > 0
      ? ['UP', 'DOWN', 'LEFT', 'RIGHT', 'WAIT']
      : ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  const visited = new Set<string>();
  visited.add(serializeState(initialState));

  interface QueueNode {
    state: GameState;
    path: PlayerAction[];
  }

  const queue: QueueNode[] = [{ state: initialState, path: [] }];
  let head = 0;

  while (head < queue.length && visited.size < maxStates) {
    const { state, path } = queue[head++];

    for (const action of actions) {
      const res = stepGame(level, state, action);
      if (!res.valid) continue;

      if (res.nextState.status === 'won') {
        const winningPath = [...path, action];
        return {
          solvable: true,
          optimalMoves: winningPath.length,
          path: winningPath,
          exploredStates: visited.size,
        };
      }

      if (res.nextState.status === 'failed') {
        continue;
      }

      const key = serializeState(res.nextState);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ state: res.nextState, path: [...path, action] });
      }
    }
  }

  return {
    solvable: false,
    optimalMoves: -1,
    path: [],
    exploredStates: visited.size,
  };
}
