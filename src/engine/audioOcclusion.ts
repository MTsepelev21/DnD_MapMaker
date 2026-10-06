import { Point, PositionalAudioSource, WallSegment } from '../types/vtt';

/**
 * Checks if line segment AB intersects line segment CD.
 */
export function lineSegmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const ccw = (
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number,
    p3x: number,
    p3y: number
  ): boolean => {
    return (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
  };

  return (
    ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
    ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
  );
}

/**
 * Traces a sound ray from listener to source and calculates wall intersections.
 * Solid walls and closed doors attenuate and muffle the sound.
 * Open doors let sound pass freely without muffling.
 */
export function countWallAudioOcclusions(
  listener: Point,
  source: Point,
  walls: WallSegment[]
): number {
  let count = 0;
  const lx = listener.x;
  const ly = listener.y;
  const sx = source.x;
  const sy = source.y;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    // Open doors let sound pass unobstructed
    if (w.type === 'door' && w.isOpen) {
      continue;
    }
    // Windows let most sound pass (or count as 0 occlusion)
    if (w.type === 'window') {
      continue;
    }

    if (lineSegmentsIntersect(lx, ly, sx, sy, w.x1, w.y1, w.x2, w.y2)) {
      count++;
    }
  }

  return count;
}

export interface SpatialAudioCalculation {
  distance: number;
  distanceGain: number;
  wallCount: number;
  cutoffFrequency: number;
  occlusionGain: number;
  finalGain: number;
  pan: number; // -1 (left) to 1 (right)
}

/**
 * Calculates real-time 2D spatial acoustic parameters:
 * - Stereo Panning based on horizontal listener-source angle
 * - Distance attenuation with smooth curve
 * - LowPass filter cutoff and volume reduction based on wall occlusion count
 */
export function calculateSpatialAudio(
  listener: Point,
  source: PositionalAudioSource,
  walls: WallSegment[]
): SpatialAudioCalculation {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const distance = Math.hypot(dx, dy);

  // 1. Distance Attenuation
  const minD = Math.max(10, source.minDistance);
  const maxD = Math.max(minD + 10, source.maxDistance);

  let distanceGain = 0;
  if (distance <= minD) {
    distanceGain = 1.0;
  } else if (distance >= maxD) {
    distanceGain = 0.0;
  } else {
    // Smooth cosine roll-off
    const normalized = (distance - minD) / (maxD - minD);
    distanceGain = 0.5 * (1 + Math.cos(normalized * Math.PI));
  }

  // 2. Stereo Panning (-1 = full left, 0 = center, +1 = full right)
  const panSpan = maxD * 0.75;
  const pan = Math.max(-1, Math.min(1, dx / Math.max(1, panSpan)));

  // 3. Wall Occlusion & Muffler
  const wallCount = countWallAudioOcclusions(listener, { x: source.x, y: source.y }, walls);

  let cutoffFrequency = 22000;
  let occlusionGain = 1.0;

  if (wallCount === 1) {
    // 1 solid wall or closed door: muffled, typical adjacent room
    cutoffFrequency = 1000;
    occlusionGain = 0.70;
  } else if (wallCount === 2) {
    // 2 walls: heavy muffling
    cutoffFrequency = 450;
    occlusionGain = 0.35;
  } else if (wallCount >= 3) {
    // 3+ walls: very deep low-frequency rumble
    cutoffFrequency = 280;
    occlusionGain = 0.18;
  }

  const finalGain = Math.max(0, Math.min(1, source.volume * distanceGain * occlusionGain));

  return {
    distance,
    distanceGain,
    wallCount,
    cutoffFrequency,
    occlusionGain,
    finalGain,
    pan,
  };
}
