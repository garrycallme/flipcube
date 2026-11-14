export type CubeFaceId = 'GOLD' | 'CYAN' | 'WHITE_A' | 'WHITE_B' | 'WHITE_C' | 'WHITE_D';

export interface CubeOrientation {
  top: CubeFaceId;
  bottom: CubeFaceId;
  front: CubeFaceId; // +Z
  back: CubeFaceId;  // -Z
  left: CubeFaceId;  // -X
  right: CubeFaceId; // +X
}

export type MoveDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type PlayerAction = MoveDirection | 'WAIT';

export type TileType =
  | 'normal'
  | 'goal'
  | 'switch'
  | 'bridge'
  | 'gate'
  | 'crumbling'
  | 'spike'
  | 'teleport';

export type FaceCondition = 'any' | 'gold_down' | 'cyan_down' | 'gold_up';

export interface GridCoord {
  x: number;
  z: number;
}

export interface TileDef {
  x: number;
  z: number;
  type: TileType;
  // Switch properties
  condition?: FaceCondition;
  targets?: string[]; // "x,z" keys of bridges or gates controlled by this switch
  toggle?: boolean; // if true, toggles on each step; otherwise latches active
  // Bridge / Gate properties
  initiallyOpen?: boolean;
  // Goal properties
  goalCondition?: FaceCondition;
  // Teleport properties
  pairId?: number;
  teleportTo?: GridCoord;
}

export interface MovingPlatformDef {
  id: string;
  path: GridCoord[]; // Sequence of tiles cycled through per move (ping-pong or loop)
  initialStep?: number;
}

export interface WorldDef {
  id: number;
  name: string;
  subtitle: string;
  accentHex: string;
  bgTopHex: string;
  bgBottomHex: string;
  platformHex: string;
}

export interface LevelDef {
  id: number; // 1..25
  worldId: number; // 1..5
  name: string;
  hintBanner?: string;
  parMoves: number; // 3-star threshold (verified by BFS solver)
  twoStarMoves: number; // 2-star threshold
  start: GridCoord;
  initialOrientation?: CubeOrientation;
  tiles: TileDef[];
  movingPlatforms?: MovingPlatformDef[];
}

export interface GameState {
  levelId: number;
  cubePos: GridCoord;
  orientation: CubeOrientation;
  moves: number;
  activatedSwitches: string[]; // sorted "x,z" keys
  openTargets: string[]; // sorted "x,z" keys of open bridges/gates
  brokenTiles: string[]; // sorted "x,z" keys of broken crumbling tiles
  crackedTile: string | null; // "x,z" key of crumbling tile currently stood on
  movingSteps: number[]; // current path index for each moving platform
  status: 'playing' | 'won' | 'failed';
  failReason?: string;
}

export interface StepEvent {
  type:
    | 'rolled'
    | 'blocked'
    | 'switch_activated'
    | 'switch_toggled'
    | 'target_opened'
    | 'target_closed'
    | 'crumbled'
    | 'teleported'
    | 'platform_moved'
    | 'platform_carried'
    | 'goal_locked_hint'
    | 'won'
    | 'failed';
  coord?: GridCoord;
  from?: GridCoord;
  to?: GridCoord;
  message?: string;
}

export interface StepResult {
  valid: boolean;
  prevState: GameState;
  nextState: GameState;
  direction?: MoveDirection;
  landedPos: GridCoord; // Position right after roll (before teleport/carry)
  teleportedFrom?: GridCoord;
  teleportedTo?: GridCoord;
  carriedByPlatform?: { id: string; from: GridCoord; to: GridCoord };
  events: StepEvent[];
}

export interface LevelProgress {
  completed: boolean;
  stars: number; // 0..3
  bestMoves: number | null;
}

export type DPadMode = 'auto' | 'always' | 'off';

export interface SaveData {
  version: number;
  highestUnlockedLevel: number;
  levels: Record<number, LevelProgress>;
  settings: {
    soundEnabled: boolean;
    musicEnabled: boolean;
    dpadMode: DPadMode;
  };
}

export type ScreenMode =
  | 'menu'
  | 'levels'
  | 'playing'
  | 'paused'
  | 'won'
  | 'failed'
  | 'settings';
