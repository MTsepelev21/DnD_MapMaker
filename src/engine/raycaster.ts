import { Point, RaycastResult, WallSegment } from '../types/vtt';

/**
 * Computes the intersection between a ray starting at (ox, oy) in direction (dx, dy)
 * and a line segment (x1, y1) -> (x2, y2).
 *
 * Parametric equations:
 * Ray:     P(t) = O + t * D,       for t >= 0
 * Segment: S(u) = A + u * (B - A), for 0 <= u <= 1
 */
export function getRaySegmentIntersection(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; paramT: number } | null {
  const r_px = ox;
  const r_py = oy;
  const r_dx = dx;
  const r_dy = dy;

  const s_px = x1;
  const s_py = y1;
  const s_dx = x2 - x1;
  const s_dy = y2 - y1;

  // Cross product of direction vectors to check if parallel
  const denom = s_dx * r_dy - s_dy * r_dx;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }

  const u = ((r_px - s_px) * r_dy - (r_py - s_py) * r_dx) / denom;
  if (u < -1e-7 || u > 1 + 1e-7) {
    return null;
  }

  const t = ((s_px - r_px) * s_dy - (s_py - r_py) * s_dx) / -denom;
  if (t < 0) {
    return null;
  }

  return {
    x: r_px + r_dx * t,
    y: r_py + r_dy * t,
    paramT: t,
  };
}

/**
 * 2D Raycasting Visibility Polygon Algorithm
 *
 * 1. Filters segments that block line-of-sight (solid walls + closed doors) within range.
 * 2. Collects unique vertices from all blocking segments + bounding perimeter angles.
 * 3. Casts 3 rays per vertex (angle - EPSILON, angle, angle + EPSILON) to look past corners.
 * 4. Clamps ray distance to the token's maximum vision radius (radiusPx).
 * 5. Sorts hit points by angle [-PI, PI] to construct a closed 2D Visibility Polygon.
 */
export function computeVisibilityPolygon(
  origin: Point,
  radiusPx: number,
  walls: WallSegment[],
  mapWidth: number,
  mapHeight: number,
  perimeterSteps = 72,
  brightRadiusPx?: number,
  dimRadiusPx?: number,
  lightColor?: string,
  tokenId?: string
): RaycastResult {
  const ox = origin.x;
  const oy = origin.y;
  const maxRSq = (radiusPx + 4) * (radiusPx + 4);

  // Filter active light-blocking segments:
  // - 'wall' always blocks
  // - 'door' blocks ONLY when !isOpen
  // - 'window' never blocks light
  const activeSegments: { x1: number; y1: number; x2: number; y2: number }[] = [
    // Map outer boundary segments
    { x1: 0, y1: 0, x2: mapWidth, y2: 0 },
    { x1: mapWidth, y1: 0, x2: mapWidth, y2: mapHeight },
    { x1: mapWidth, y1: mapHeight, x2: 0, y2: mapHeight },
    { x1: 0, y1: mapHeight, x2: 0, y2: 0 },
  ];

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.type === 'window') continue;
    if (w.type === 'door' && w.isOpen) continue;

    // Quick bounding check: skip segments completely far outside the vision circle
    const minX = Math.min(w.x1, w.x2);
    const maxX = Math.max(w.x1, w.x2);
    const minY = Math.min(w.y1, w.y2);
    const maxY = Math.max(w.y1, w.y2);

    const closestX = Math.max(minX, Math.min(ox, maxX));
    const closestY = Math.max(minY, Math.min(oy, maxY));
    const distSq = (closestX - ox) ** 2 + (closestY - oy) ** 2;

    if (distSq <= maxRSq) {
      activeSegments.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
    }
  }

  // Collect candidate ray angles
  const angles: number[] = [];
  const EPSILON = 0.00012;

  // 1. Uniform perimeter rays so open circular field of view is smooth
  for (let i = 0; i < perimeterSteps; i++) {
    const a = -Math.PI + (i * 2 * Math.PI) / perimeterSteps;
    angles.push(a);
  }

  // 2. Vertex rays for every endpoint of active segments
  const seenVertices = new Set<string>();
  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i];
    const pts = [
      { x: seg.x1, y: seg.y1 },
      { x: seg.x2, y: seg.y2 },
    ];
    for (const pt of pts) {
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.y * 10)}`;
      if (seenVertices.has(key)) continue;
      seenVertices.add(key);

      const dx = pt.x - ox;
      const dy = pt.y - oy;
      if (dx * dx + dy * dy <= maxRSq * 1.35) {
        const baseAngle = Math.atan2(dy, dx);
        angles.push(baseAngle - EPSILON, baseAngle, baseAngle + EPSILON);
      }
    }

    // 3. Circle-segment intersection angles where a wall crosses the vision circle boundary
    const circleHits = getCircleSegmentIntersections(ox, oy, radiusPx, seg.x1, seg.y1, seg.x2, seg.y2);
    for (const ch of circleHits) {
      const a = Math.atan2(ch.y - oy, ch.x - ox);
      angles.push(a - EPSILON, a, a + EPSILON);
    }
  }

  // Cast rays and find closest hit for each angle
  const rays: { x: number; y: number; angle: number; dist: number }[] = [];

  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let minT = radiusPx; // Clamp to vision radius
    let closestX = ox + dx * radiusPx;
    let closestY = oy + dy * radiusPx;

    for (let j = 0; j < activeSegments.length; j++) {
      const seg = activeSegments[j];
      const hit = getRaySegmentIntersection(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2);
      if (hit && hit.paramT < minT) {
        minT = hit.paramT;
        closestX = hit.x;
        closestY = hit.y;
      }
    }

    // Normalize angle to [-PI, PI] for sorting
    const normalizedAngle = Math.atan2(dy, dx);
    rays.push({
      x: closestX,
      y: closestY,
      angle: normalizedAngle,
      dist: minT,
    });
  }

  // Sort rays counter-clockwise by angle
  rays.sort((a, b) => a.angle - b.angle);

  // Deduplicate ultra-close consecutive points to keep the polygon clean
  const polygon: Point[] = [];
  for (let i = 0; i < rays.length; i++) {
    const curr = rays[i];
    if (polygon.length > 0) {
      const prev = polygon[polygon.length - 1];
      const dSq = (curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2;
      if (dSq < 0.05) continue;
    }
    polygon.push({ x: curr.x, y: curr.y });
  }

  return {
    polygon,
    rays,
    origin: { x: ox, y: oy },
    radiusPx,
    brightRadiusPx,
    dimRadiusPx,
    lightColor,
    tokenId,
  };
}

/**
 * Helper: finds points where a segment (x1,y1)-(x2,y2) intersects a circle centered at (cx,cy) with radius r.
 */
function getCircleSegmentIntersections(
  cx: number,
  cy: number,
  r: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Point[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  if (a < 1e-9) return [];

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  const pts: Point[] = [];
  if (t1 >= 0 && t1 <= 1) {
    pts.push({ x: x1 + t1 * dx, y: y1 + t1 * dy });
  }
  if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 1e-6) {
    pts.push({ x: x1 + t2 * dx, y: y1 + t2 * dy });
  }
  return pts;
}

/**
 * Core Point-in-Polygon algorithm (Ray Casting / Even-Odd Rule).
 * Returns true if point (pt.x, pt.y) is strictly or approximately inside the polygon.
 */
export function isPointInPolygon(pt: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Requirement 4: Entity Culling & Visibility Check
 * isInFieldOfView(entityX, entityY, sightPolygons, radiusTolerance)
 *
 * Checks if an entity (token, trap, or object) located at (entityX, entityY)
 * falls inside ANY active line-of-sight polygon (or Party Vision union).
 * Also checks candidate perimeter points within radiusTolerance to prevent
 * visual popping when large monster tokens partially cross the vision threshold.
 */
export function isInFieldOfView(
  entityX: number,
  entityY: number,
  sightPolygons: Point[] | Point[][],
  radiusTolerance = 14
): boolean {
  if (!sightPolygons) return false;

  // Robust polygon normalization
  let polygons: Point[][];
  if (!Array.isArray(sightPolygons) || sightPolygons.length === 0) {
    return false;
  }

  const firstElem = sightPolygons[0];
  if (Array.isArray(firstElem)) {
    // Already an array of polygons: Point[][]
    polygons = sightPolygons as Point[][];
  } else if (firstElem && typeof (firstElem as Point).x === 'number') {
    // Single polygon: Point[]
    polygons = [sightPolygons as Point[]];
  } else {
    return false;
  }

  if (polygons.length === 0) return false;

  // Candidate sample points: center + cardinal offset points
  const r = Math.max(8, radiusTolerance);
  const testPoints: Point[] = [
    { x: entityX, y: entityY },
    { x: entityX - r, y: entityY },
    { x: entityX + r, y: entityY },
    { x: entityX, y: entityY - r },
    { x: entityX, y: entityY + r },
    { x: entityX - r * 0.7, y: entityY - r * 0.7 },
    { x: entityX + r * 0.7, y: entityY + r * 0.7 },
    { x: entityX - r * 0.7, y: entityY + r * 0.7 },
    { x: entityX + r * 0.7, y: entityY - r * 0.7 },
  ];

  for (let p = 0; p < polygons.length; p++) {
    const poly = polygons[p];
    if (!poly || poly.length < 3) continue;

    for (let t = 0; t < testPoints.length; t++) {
      if (isPointInPolygon(testPoints[t], poly)) {
        return true;
      }
    }
  }

  return false;
}
