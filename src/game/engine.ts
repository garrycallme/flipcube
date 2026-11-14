import {
  cloneOrientation,
  createDefaultOrientation,
  getDirectionDelta,
  matchesFaceCondition,
  rotateOrientation,
} from './cubeMath';
import type {
  GameState,
  GridCoord,
  LevelDef,
  MoveDirection,
  PlayerAction,
  StepEvent,
  StepResult,
  TileDef,
} from './types';

export function coordKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function getTileAt(level: LevelDef, x: number, z: number): TileDef | undefined {
  return level.tiles.find((t) => t.x === x && t.z === z);
}

export function getMovingPlatformPos(
  level: LevelDef,
  movingSteps: number[],
  platformIndex: number
): GridCoord | undefined {
  const mp = level.movingPlatforms?.[platformIndex];
  if (!mp || mp.path.length === 0) return undefined;
  const idx = ((movingSteps[platformIndex] ?? 0) % mp.path.length + mp.path.length) % mp.path.length;
  return mp.path[idx];
}

export function findMovingPlatformAt(
  level: LevelDef,
  movingSteps: number[],
  x: number,
  z: number
): number {
  if (!level.movingPlatforms) return -1;
  for (let i = 0; i < level.movingPlatforms.length; i++) {
    const pos = getMovingPlatformPos(level, movingSteps, i);
    if (pos && pos.x === x && pos.z === z) {
      return i;
    }
  }
  return -1;
}

export function isTileWalkable(
  level: LevelDef,
  state: Pick<GameState, 'openTargets' | 'brokenTiles' | 'movingSteps'>,
  x: number,
  z: number
): boolean {
  if (findMovingPlatformAt(level, state.movingSteps, x, z) !== -1) {
    return true;
  }

  const tile = getTileAt(level, x, z);
  if (!tile) return false;

  const key = coordKey(x, z);
  switch (tile.type) {
    case 'bridge':
    case 'gate':
      return state.openTargets.includes(key);
    case 'crumbling':
      return !state.brokenTiles.includes(key);
    case 'normal':
    case 'goal':
    case 'switch':
    case 'spike':
    case 'teleport':
      return true;
  }
}

export function createInitialGameState(level: LevelDef): GameState {
  const openTargets = level.tiles
    .filter((t) => (t.type === 'bridge' || t.type === 'gate') && t.initiallyOpen)
    .map((t) => coordKey(t.x, t.z))
    .sort();

  const startTile = getTileAt(level, level.start.x, level.start.z);

  return {
    levelId: level.id,
    cubePos: { ...level.start },
    orientation: cloneOrientation(level.initialOrientation ?? createDefaultOrientation()),
    moves: 0,
    activatedSwitches: [],
    openTargets,
    brokenTiles: [],
    crackedTile: startTile?.type === 'crumbling' ? coordKey(startTile.x, startTile.z) : null,
    movingSteps: level.movingPlatforms?.map((mp) => mp.initialStep ?? 0) ?? [],
    status: 'playing',
  };
}

export function stepGame(level: LevelDef, prevState: GameState, action: PlayerAction): StepResult {
  if (prevState.status !== 'playing') {
    return {
      valid: false,
      prevState,
      nextState: prevState,
      landedPos: prevState.cubePos,
      events: [],
    };
  }

  const hasMoving = (level.movingPlatforms?.length ?? 0) > 0;
  if (action === 'WAIT') {
    if (!hasMoving) {
      return {
        valid: false,
        prevState,
        nextState: prevState,
        landedPos: prevState.cubePos,
        events: [],
      };
    }

    const events: StepEvent[] = [];
    const ridingIdx = findMovingPlatformAt(level, prevState.movingSteps, prevState.cubePos.x, prevState.cubePos.z);
    const nextMovingSteps = prevState.movingSteps.map((s, idx) => {
      const len = level.movingPlatforms![idx].path.length;
      return (s + 1) % len;
    });

    let nextCubePos = { ...prevState.cubePos };
    let carried: StepResult['carriedByPlatform'] = undefined;

    if (ridingIdx !== -1) {
      const mp = level.movingPlatforms![ridingIdx];
      const nextPlatformPos = getMovingPlatformPos(level, nextMovingSteps, ridingIdx)!;
      carried = {
        id: mp.id,
        from: { ...prevState.cubePos },
        to: { ...nextPlatformPos },
      };
      nextCubePos = { ...nextPlatformPos };
      events.push({
        type: 'platform_carried',
        from: carried.from,
        to: carried.to,
      });
    } else {
      events.push({ type: 'platform_moved' });
    }

    const nextState: GameState = {
      ...prevState,
      cubePos: nextCubePos,
      orientation: cloneOrientation(prevState.orientation),
      moves: prevState.moves + 1,
      movingSteps: nextMovingSteps,
    };

    return {
      valid: true,
      prevState,
      nextState,
      landedPos: prevState.cubePos,
      carriedByPlatform: carried,
      events,
    };
  }

  // Directional Roll
  const { dx, dz } = getDirectionDelta(action);
  const nx = prevState.cubePos.x + dx;
  const nz = prevState.cubePos.z + dz;

  if (!isTileWalkable(level, prevState, nx, nz)) {
    return {
      valid: false,
      prevState,
      nextState: prevState,
      direction: action,
      landedPos: prevState.cubePos,
      events: [{ type: 'blocked', coord: { x: nx, z: nz } }],
    };
  }

  const events: StepEvent[] = [{ type: 'rolled', from: prevState.cubePos, to: { x: nx, z: nz } }];
  const nextOrientation = rotateOrientation(prevState.orientation, action);
  const landedPos: GridCoord = { x: nx, z: nz };

  const activatedSet = new Set(prevState.activatedSwitches);
  const openSet = new Set(prevState.openTargets);
  const brokenSet = new Set(prevState.brokenTiles);

  let nextCrackedTile: string | null = null;
  if (prevState.crackedTile) {
    brokenSet.add(prevState.crackedTile);
    events.push({ type: 'crumbled', coord: { ...prevState.cubePos } });
  }

  let finalPos: GridCoord = { ...landedPos };
  let teleportedFrom: GridCoord | undefined;
  let teleportedTo: GridCoord | undefined;

  const landedOnMovingIdx = findMovingPlatformAt(level, prevState.movingSteps, nx, nz);
  const destTile = landedOnMovingIdx === -1 ? getTileAt(level, nx, nz) : undefined;

  if (destTile) {
    if (destTile.type === 'crumbling') {
      nextCrackedTile = coordKey(nx, nz);
    } else if (destTile.type === 'spike') {
      const failedState: GameState = {
        ...prevState,
        cubePos: finalPos,
        orientation: nextOrientation,
        moves: prevState.moves + 1,
        activatedSwitches: Array.from(activatedSet).sort(),
        openTargets: Array.from(openSet).sort(),
        brokenTiles: Array.from(brokenSet).sort(),
        crackedTile: null,
        status: 'failed',
        failReason: 'Hit hazard spikes',
      };
      events.push({ type: 'failed', coord: finalPos, message: 'Hit hazard spikes' });
      return {
        valid: true,
        prevState,
        nextState: failedState,
        direction: action,
        landedPos,
        events,
      };
    } else if (destTile.type === 'switch') {
      const cond = destTile.condition ?? 'any';
      const switchKey = coordKey(nx, nz);
      if (matchesFaceCondition(nextOrientation, cond)) {
        if (destTile.toggle) {
          if (activatedSet.has(switchKey)) activatedSet.delete(switchKey);
          else activatedSet.add(switchKey);

          for (const tKey of destTile.targets ?? []) {
            if (openSet.has(tKey)) {
              openSet.delete(tKey);
              events.push({ type: 'target_closed' });
            } else {
              openSet.add(tKey);
              events.push({ type: 'target_opened' });
            }
          }
          events.push({ type: 'switch_toggled', coord: landedPos });
        } else if (!activatedSet.has(switchKey)) {
          activatedSet.add(switchKey);
          events.push({ type: 'switch_activated', coord: landedPos });
          for (const tKey of destTile.targets ?? []) {
            if (!openSet.has(tKey)) {
              openSet.add(tKey);
              events.push({ type: 'target_opened' });
            }
          }
        }
      } else {
        const faceLabel = cond === 'gold_down' ? 'GOLD' : 'CYAN';
        events.push({
          type: 'goal_locked_hint',
          coord: landedPos,
          message: `Switch requires ${faceLabel} face down`,
        });
      }
    } else if (destTile.type === 'teleport' && destTile.teleportTo) {
      teleportedFrom = { ...landedPos };
      teleportedTo = { ...destTile.teleportTo };
      finalPos = { ...destTile.teleportTo };
      events.push({ type: 'teleported', from: teleportedFrom, to: teleportedTo });
    }
  }

  // Advance moving platforms after cube lands
  let nextMovingSteps = prevState.movingSteps;
  let carried: StepResult['carriedByPlatform'] = undefined;

  if (hasMoving) {
    nextMovingSteps = prevState.movingSteps.map((s, idx) => {
      const len = level.movingPlatforms![idx].path.length;
      return (s + 1) % len;
    });

    if (landedOnMovingIdx !== -1) {
      const mp = level.movingPlatforms![landedOnMovingIdx];
      const nextPlatformPos = getMovingPlatformPos(level, nextMovingSteps, landedOnMovingIdx)!;
      carried = {
        id: mp.id,
        from: { ...landedPos },
        to: { ...nextPlatformPos },
      };
      finalPos = { ...nextPlatformPos };
      events.push({
        type: 'platform_carried',
        from: carried.from,
        to: carried.to,
      });
    } else {
      events.push({ type: 'platform_moved' });
    }
  }

  // Check goal condition at finalPos
  let status: GameState['status'] = 'playing';
  let failReason: string | undefined;

  const finalTile = getTileAt(level, finalPos.x, finalPos.z);
  if (finalTile?.type === 'goal') {
    const goalCond = finalTile.goalCondition ?? 'any';
    if (matchesFaceCondition(nextOrientation, goalCond)) {
      status = 'won';
      events.push({ type: 'won', coord: finalPos });
    } else {
      const msg =
        goalCond === 'gold_down'
          ? 'Goal requires GOLD face down'
          : goalCond === 'gold_up'
            ? 'Goal requires GOLD face on top'
            : 'Goal requires CYAN face down';
      events.push({ type: 'goal_locked_hint', coord: finalPos, message: msg });
    }
  }

  // Check if stranded (no walkable neighbor tiles and no moving platforms to wait on)
  const tempStateForCheck: GameState = {
    ...prevState,
    cubePos: finalPos,
    orientation: nextOrientation,
    moves: prevState.moves + 1,
    activatedSwitches: Array.from(activatedSet).sort(),
    openTargets: Array.from(openSet).sort(),
    brokenTiles: Array.from(brokenSet).sort(),
    crackedTile: nextCrackedTile,
    movingSteps: nextMovingSteps,
    status,
    failReason,
  };

  if (status === 'playing' && !hasMoving) {
    const dirs: MoveDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const anyWalkable = dirs.some((d) => {
      const delta = getDirectionDelta(d);
      return isTileWalkable(level, tempStateForCheck, finalPos.x + delta.dx, finalPos.z + delta.dz);
    });
    if (!anyWalkable) {
      tempStateForCheck.status = 'failed';
      tempStateForCheck.failReason = 'Stranded with no valid moves';
      events.push({ type: 'failed', coord: finalPos, message: 'Stranded with no valid moves' });
    }
  }

  return {
    valid: true,
    prevState,
    nextState: tempStateForCheck,
    direction: action,
    landedPos,
    teleportedFrom,
    teleportedTo,
    carriedByPlatform: carried,
    events,
  };
}

export function calculateStars(level: LevelDef, moves: number): number {
  if (moves <= level.parMoves) return 3;
  if (moves <= level.twoStarMoves) return 2;
  return 1;
}
