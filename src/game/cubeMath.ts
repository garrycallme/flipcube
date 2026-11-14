import type { CubeFaceId, CubeOrientation, FaceCondition, MoveDirection } from './types';

export function createDefaultOrientation(): CubeOrientation {
  return {
    top: 'GOLD',
    bottom: 'CYAN',
    front: 'WHITE_A',
    back: 'WHITE_B',
    left: 'WHITE_C',
    right: 'WHITE_D',
  };
}

export function cloneOrientation(o: CubeOrientation): CubeOrientation {
  return {
    top: o.top,
    bottom: o.bottom,
    front: o.front,
    back: o.back,
    left: o.left,
    right: o.right,
  };
}

/**
 * Deterministic 90-degree face permutation matching Three.js right-handed rotation:
 * - UP (dz = -1): rotates -90 deg around +X
 *   new.top = old.front, new.back = old.top, new.bottom = old.back, new.front = old.bottom
 * - DOWN (dz = +1): rotates +90 deg around +X
 *   new.top = old.back, new.front = old.top, new.bottom = old.front, new.back = old.bottom
 * - LEFT (dx = -1): rotates +90 deg around +Z
 *   new.top = old.right, new.left = old.top, new.bottom = old.left, new.right = old.bottom
 * - RIGHT (dx = +1): rotates -90 deg around +Z
 *   new.top = old.left, new.right = old.top, new.bottom = old.right, new.left = old.bottom
 */
export function rotateOrientation(o: CubeOrientation, dir: MoveDirection): CubeOrientation {
  switch (dir) {
    case 'UP':
      return {
        top: o.front,
        back: o.top,
        bottom: o.back,
        front: o.bottom,
        left: o.left,
        right: o.right,
      };
    case 'DOWN':
      return {
        top: o.back,
        front: o.top,
        bottom: o.front,
        back: o.bottom,
        left: o.left,
        right: o.right,
      };
    case 'LEFT':
      return {
        top: o.right,
        left: o.top,
        bottom: o.left,
        right: o.bottom,
        front: o.front,
        back: o.back,
      };
    case 'RIGHT':
      return {
        top: o.left,
        right: o.top,
        bottom: o.right,
        left: o.bottom,
        front: o.front,
        back: o.back,
      };
  }
}

export function getDirectionDelta(dir: MoveDirection): { dx: number; dz: number } {
  switch (dir) {
    case 'UP':
      return { dx: 0, dz: -1 };
    case 'DOWN':
      return { dx: 0, dz: 1 };
    case 'LEFT':
      return { dx: -1, dz: 0 };
    case 'RIGHT':
      return { dx: 1, dz: 0 };
  }
}

export function matchesFaceCondition(
  orientation: CubeOrientation,
  condition: FaceCondition = 'any'
): boolean {
  switch (condition) {
    case 'any':
      return true;
    case 'gold_down':
      return orientation.bottom === 'GOLD';
    case 'cyan_down':
      return orientation.bottom === 'CYAN';
    case 'gold_up':
      return orientation.top === 'GOLD';
  }
}

export function isSpecialFace(face: CubeFaceId): boolean {
  return face === 'GOLD' || face === 'CYAN';
}
