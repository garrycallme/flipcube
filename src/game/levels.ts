import type { GridCoord, LevelDef, TileDef, TileType, WorldDef } from './types';

export const WORLDS: WorldDef[] = [
  {
    id: 1,
    name: 'Starter Island',
    subtitle: 'Master the roll across floating sanctuaries',
    accentHex: '#22d3ee',
    bgTopHex: '#0b132b',
    bgBottomHex: '#131f42',
    platformHex: '#1e3a5f',
  },
  {
    id: 2,
    name: 'Switch Garden',
    subtitle: 'Trigger circuits and align cube faces',
    accentHex: '#fbbf24',
    bgTopHex: '#10142c',
    bgBottomHex: '#1e1b4b',
    platformHex: '#26325b',
  },
  {
    id: 3,
    name: 'Moving Dimension',
    subtitle: 'Synchronize with orbital ferries',
    accentHex: '#a78bfa',
    bgTopHex: '#0e1129',
    bgBottomHex: '#221847',
    platformHex: '#282c58',
  },
  {
    id: 4,
    name: 'Fragile Heights',
    subtitle: 'Cross crumbling spans and evade spikes',
    accentHex: '#fb7185',
    bgTopHex: '#160f24',
    bgBottomHex: '#2a1630',
    platformHex: '#2e2545',
  },
  {
    id: 5,
    name: 'Cube Master',
    subtitle: 'Quantum warps and master orientation trials',
    accentHex: '#34d399',
    bgTopHex: '#090e1f',
    bgBottomHex: '#172542',
    platformHex: '#1e2c4a',
  },
];

function makeTiles(
  coords: Array<[number, number] | [number, number, TileType, Partial<TileDef>?]>
): TileDef[] {
  const map = new Map<string, TileDef>();
  for (const entry of coords) {
    const [x, z, type = 'normal', extra = {}] = entry;
    map.set(`${x},${z}`, { x, z, type, ...extra });
  }
  return Array.from(map.values());
}

function rectCoords(x1: number, z1: number, x2: number, z2: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
      out.push([x, z]);
    }
  }
  return out;
}

function pingPongPath(points: GridCoord[]): GridCoord[] {
  if (points.length <= 1) return points;
  const rev = points.slice(1, -1).reverse();
  return [...points, ...rev];
}

export const LEVELS: LevelDef[] = [
  // ================= WORLD 1: STARTER ISLAND =================
  {
    id: 1,
    worldId: 1,
    name: 'First Roll',
    hintBanner: 'Roll with Arrow Keys, WASD, or Swipe to reach the green Goal.',
    parMoves: 5,
    twoStarMoves: 7,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, -1],
      [3, -2, 'goal'],
    ]),
  },
  {
    id: 2,
    worldId: 1,
    name: 'The Arch',
    hintBanner: 'Navigate around gaps — you cannot roll onto empty space.',
    parMoves: 8,
    twoStarMoves: 10,
    start: { x: 0, z: 1 },
    tiles: makeTiles([
      [0, 1],
      [0, 0],
      [0, -1],
      [1, -1],
      [2, -1],
      [3, -1],
      [3, 0],
      [3, 1],
      [4, 1, 'goal'],
    ]),
  },
  {
    id: 3,
    worldId: 1,
    name: 'Zigzag Ridge',
    parMoves: 10,
    twoStarMoves: 13,
    start: { x: 0, z: 2 },
    tiles: makeTiles([
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 1],
      [2, 0],
      [3, 0],
      [4, 0],
      [4, -1],
      [4, -2],
      [5, -2],
      [5, -3, 'goal'],
    ]),
  },
  {
    id: 4,
    worldId: 1,
    name: 'Sky Courtyard',
    parMoves: 9,
    twoStarMoves: 12,
    start: { x: 0, z: 2 },
    tiles: makeTiles([
      ...rectCoords(0, 0, 4, 2).filter(
        ([x, z]) => !(x === 1 && z === 1) && !(x === 2 && z === 2) && !(x === 3 && z === 0)
      ),
      [4, 0, 'goal'],
    ]),
  },
  {
    id: 5,
    worldId: 1,
    name: 'Twin Spans',
    parMoves: 10,
    twoStarMoves: 13,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [1, -1],
      [2, -1],
      [3, -1],
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 0],
      [4, 0],
      [4, -1],
      [5, -1],
      [5, 0],
      [5, 1, 'goal'],
    ]),
  },

  // ================= WORLD 2: SWITCH GARDEN =================
  {
    id: 6,
    worldId: 2,
    name: 'Golden Pressure',
    hintBanner: 'Roll onto the yellow Switch to extend the translucent Bridge.',
    parMoves: 10,
    twoStarMoves: 13,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, -1],
      [2, -2, 'switch', { condition: 'any', targets: ['3,0', '4,0'] }],
      [3, 0, 'bridge', { initiallyOpen: false }],
      [4, 0, 'bridge', { initiallyOpen: false }],
      [5, 0],
      [6, 0, 'goal'],
    ]),
  },
  {
    id: 7,
    worldId: 2,
    name: 'Gatekeeper',
    hintBanner: 'Energy Gates block passage until their linked Switch is pressed.',
    parMoves: 12,
    twoStarMoves: 15,
    start: { x: 0, z: 1 },
    tiles: makeTiles([
      ...rectCoords(0, 0, 2, 2),
      [2, -1],
      [1, -1],
      [0, -1, 'switch', { condition: 'any', targets: ['3,1'] }],
      [3, 1, 'gate', { initiallyOpen: false }],
      [4, 1],
      [5, 1, 'goal'],
    ]),
  },
  {
    id: 8,
    worldId: 2,
    name: 'Dual Circuit',
    parMoves: 18,
    twoStarMoves: 23,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [1, -1],
      [1, -2],
      [2, -2, 'switch', { condition: 'any', targets: ['2,0'] }],
      [2, 0, 'bridge', { initiallyOpen: false }],
      [3, 0],
      [3, 1],
      [3, 2],
      [4, 2, 'switch', { condition: 'any', targets: ['4,0'] }],
      [4, 0, 'bridge', { initiallyOpen: false }],
      [5, 0],
      [5, -1, 'goal'],
    ]),
  },
  {
    id: 9,
    worldId: 2,
    name: 'Gold Face Lock',
    hintBanner: 'Diamond Switches only trigger when the GOLD cube face lands face-down!',
    parMoves: 9,
    twoStarMoves: 12,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      // Rolling straight east puts GOLD down at (2,0); detouring onto (2,-1) forces deliberate alignment
      ...rectCoords(0, -1, 2, 1),
      [2, -1, 'switch', { condition: 'gold_down', targets: ['3,0'] }],
      [3, 0, 'bridge', { initiallyOpen: false }],
      [4, 0],
      [5, 0, 'goal'],
    ]),
  },
  {
    id: 10,
    worldId: 2,
    name: 'Master of Faces',
    hintBanner: 'Align GOLD face-down for Amber switches and CYAN face-down for Cyan switches.',
    parMoves: 10,
    twoStarMoves: 14,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      ...rectCoords(0, -1, 3, 1),
      [2, -1, 'switch', { condition: 'gold_down', targets: ['4,0'] }],
      [3, 1, 'switch', { condition: 'cyan_down', targets: ['5,0'] }],
      [4, 0, 'bridge', { initiallyOpen: false }],
      [5, 0, 'gate', { initiallyOpen: false }],
      [6, 0, 'goal'],
    ]),
  },

  // ================= WORLD 3: MOVING DIMENSION =================
  {
    id: 11,
    worldId: 3,
    name: 'Ferry Glide',
    hintBanner: 'Moving Platforms step once per move. Press Space / Wait to ride across!',
    parMoves: 6,
    twoStarMoves: 9,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [5, 0],
      [6, 0, 'goal'],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-1',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ]),
        initialStep: 2,
      },
    ],
  },
  {
    id: 12,
    worldId: 3,
    name: 'Timed Crossing',
    parMoves: 7,
    twoStarMoves: 10,
    start: { x: 0, z: 1 },
    tiles: makeTiles([
      [0, 1],
      [1, 1],
      [1, 0],
      [5, 0],
      [5, -1],
      [6, -1, 'goal'],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-2',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ]),
        initialStep: 2,
      },
    ],
  },
  {
    id: 13,
    worldId: 3,
    name: 'Switch & Shuttle',
    parMoves: 10,
    twoStarMoves: 14,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2, 'switch', { condition: 'any', targets: ['5,0'] }],
      [4, 0],
      [5, 0, 'gate', { initiallyOpen: false }],
      [6, 0, 'goal'],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-3',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
        ]),
        initialStep: 0,
      },
    ],
  },
  {
    id: 14,
    worldId: 3,
    name: 'Double Ferry',
    hintBanner: 'Transfer directly from one Moving Platform to another mid-void.',
    parMoves: 9,
    twoStarMoves: 12,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [6, 1],
      [7, 1, 'goal'],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-a',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ]),
        initialStep: 0,
      },
      {
        id: 'ferry-b',
        path: pingPongPath([
          { x: 4, z: 1 },
          { x: 5, z: 1 },
        ]),
        initialStep: 0,
      },
    ],
  },
  {
    id: 15,
    worldId: 3,
    name: 'Orbital Lock',
    parMoves: 12,
    twoStarMoves: 16,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      ...rectCoords(0, -1, 1, 1),
      [1, -1, 'switch', { condition: 'gold_down', targets: ['6,0'] }],
      [5, 0],
      [6, 0, 'gate', { initiallyOpen: false }],
      [7, 0, 'goal'],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-5',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ]),
        initialStep: 1,
      },
    ],
  },

  // ================= WORLD 4: FRAGILE HEIGHTS =================
  {
    id: 16,
    worldId: 4,
    name: 'Thin Ice',
    hintBanner: 'Cracked tiles shatter the instant you roll off them!',
    parMoves: 9,
    twoStarMoves: 12,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0, 'crumbling'],
      [1, 1, 'crumbling'],
      [2, 1, 'crumbling'],
      [3, 1, 'crumbling'],
      [3, 0, 'crumbling'],
      [3, -1, 'crumbling'],
      [4, -1, 'crumbling'],
      [5, -1],
      [5, 0, 'goal'],
    ]),
  },
  {
    id: 17,
    worldId: 4,
    name: 'Spike Alley',
    hintBanner: 'Avoid metallic Spike hazards — touching them ends the run.',
    parMoves: 9,
    twoStarMoves: 12,
    start: { x: 0, z: 1 },
    tiles: makeTiles([
      ...rectCoords(0, 0, 5, 2),
      [1, 1, 'spike'],
      [2, 0, 'spike'],
      [3, 2, 'spike'],
      [4, 0, 'spike'],
      [5, 1, 'goal'],
    ]),
  },
  {
    id: 18,
    worldId: 4,
    name: 'No Return',
    parMoves: 12,
    twoStarMoves: 16,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0, 'crumbling'],
      [2, 0, 'crumbling'],
      [3, 0],
      [3, -1],
      [3, -2, 'switch', { condition: 'any', targets: ['1,-2', '2,-2'] }],
      [2, -2, 'bridge', { initiallyOpen: false }],
      [1, -2, 'bridge', { initiallyOpen: false }],
      [0, -2],
      [-1, -2, 'goal'],
    ]),
  },
  {
    id: 19,
    worldId: 4,
    name: 'Razor Edge',
    parMoves: 12,
    twoStarMoves: 16,
    start: { x: 0, z: 1 },
    tiles: makeTiles([
      [0, 1],
      [1, 1, 'crumbling'],
      [1, 0, 'spike'],
      [1, 2],
      [2, 2, 'crumbling'],
      [2, 1],
      [2, 0],
      [3, 0, 'switch', { condition: 'any', targets: ['4,1'] }],
      [3, 1, 'spike'],
      [3, 2, 'crumbling'],
      [4, 2],
      [4, 1, 'gate', { initiallyOpen: false }],
      [4, 0, 'spike'],
      [5, 1],
      [6, 1, 'goal'],
    ]),
  },
  {
    id: 20,
    worldId: 4,
    name: 'Glass Gauntlet',
    parMoves: 16,
    twoStarMoves: 21,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      ...rectCoords(0, 0, 1, 1),
      [2, 1, 'crumbling'],
      [2, 0, 'spike'],
      ...rectCoords(3, 1, 4, 2),
      [3, 0, 'crumbling'],
      [3, -1],
      [4, 1, 'switch', { condition: 'gold_down', targets: ['4,-1'] }],
      [4, 0, 'spike'],
      [4, -1, 'gate', { initiallyOpen: false }],
      [5, -1],
      [5, 0, 'goal'],
    ]),
  },

  // ================= WORLD 5: CUBE MASTER =================
  {
    id: 21,
    worldId: 5,
    name: 'Quantum Leap',
    hintBanner: 'Purple Teleporters warp your cube while preserving its exact orientation.',
    parMoves: 6,
    twoStarMoves: 9,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [2, 0, 'teleport', { pairId: 1, teleportTo: { x: 5, z: 0 } }],
      [5, 0, 'teleport', { pairId: 1, teleportTo: { x: 2, z: 0 } }],
      [6, 0],
      [6, -1],
      [7, -1],
      [7, -2, 'goal'],
    ]),
  },
  {
    id: 22,
    worldId: 5,
    name: 'Phase Shift',
    parMoves: 10,
    twoStarMoves: 14,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [2, 0, 'teleport', { pairId: 1, teleportTo: { x: 0, z: -3 } }],
      [0, -3, 'teleport', { pairId: 1, teleportTo: { x: 2, z: 0 } }],
      [1, -3],
      [2, -3, 'switch', { condition: 'any', targets: ['3,0'] }],
      [3, 0, 'bridge', { initiallyOpen: false }],
      [4, 0, 'teleport', { pairId: 2, teleportTo: { x: 5, z: -3 } }],
      [5, -3, 'teleport', { pairId: 2, teleportTo: { x: 4, z: 0 } }],
      [6, -3],
      [7, -3, 'goal'],
    ]),
  },
  {
    id: 23,
    worldId: 5,
    name: 'Fragile Warp',
    parMoves: 8,
    twoStarMoves: 12,
    start: { x: 0, z: 1 },
    tiles: makeTiles([
      [0, 1],
      [1, 1, 'crumbling'],
      [2, 1],
      [2, 0, 'spike'],
      [2, 2, 'crumbling'],
      [3, 2, 'teleport', { pairId: 1, teleportTo: { x: 5, z: 0 } }],
      [5, 0, 'teleport', { pairId: 1, teleportTo: { x: 3, z: 2 } }],
      [6, 0, 'crumbling'],
      [6, 1],
      [7, 1, 'spike'],
      [6, -1],
      [7, -1],
      [8, -1, 'goal'],
    ]),
  },
  {
    id: 24,
    worldId: 5,
    name: 'Prism Alignment',
    parMoves: 24,
    twoStarMoves: 30,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      ...rectCoords(0, -1, 1, 1),
      [1, 1, 'switch', { condition: 'gold_down', targets: ['6,0'] }],
      [5, 0],
      [5, -1, 'teleport', { pairId: 1, teleportTo: { x: 5, z: 2 } }],
      [5, 2, 'teleport', { pairId: 1, teleportTo: { x: 5, z: -1 } }],
      [6, 2],
      [7, 2, 'switch', { condition: 'cyan_down', targets: ['7,0'] }],
      [6, 0, 'bridge', { initiallyOpen: false }],
      [7, 0, 'gate', { initiallyOpen: false }],
      [8, 0, 'goal'],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-24',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ]),
        initialStep: 0,
      },
    ],
  },
  {
    id: 25,
    worldId: 5,
    name: 'Cube Master Finale',
    hintBanner: 'Final Trial: Land on the Gold-ringed Goal with the GOLD face down!',
    parMoves: 27,
    twoStarMoves: 34,
    start: { x: 0, z: 0 },
    tiles: makeTiles([
      [0, 0],
      [1, 0],
      [5, 0],
      [5, -1],
      [5, -2, 'teleport', { pairId: 2, teleportTo: { x: 1, z: -2 } }],
      [5, 1, 'crumbling'],
      [5, 2, 'teleport', { pairId: 1, teleportTo: { x: 0, z: -3 } }],
      [0, -3, 'teleport', { pairId: 1, teleportTo: { x: 5, z: 2 } }],
      ...rectCoords(0, -3, 1, -2),
      [1, -2, 'teleport', { pairId: 2, teleportTo: { x: 5, z: -2 } }],
      [1, -3, 'switch', { condition: 'gold_down', targets: ['6,0'] }],
      [6, 0, 'bridge', { initiallyOpen: false }],
      ...rectCoords(7, -1, 9, 1),
      [8, -1, 'spike'],
      [8, 1, 'spike'],
      [9, 0, 'goal', { goalCondition: 'gold_down' }],
    ]),
    movingPlatforms: [
      {
        id: 'ferry-25',
        path: pingPongPath([
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ]),
        initialStep: 2,
      },
    ],
  },
];

export function getLevelById(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function getWorldById(id: number): WorldDef {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}
