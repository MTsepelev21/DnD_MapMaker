import { Point, Token, WallSegment } from '../types/vtt';
import {
  SpellShapeType,
  SpellTemplate,
  SpellColorTheme,
  SpellPresetConfig,
  SpellCastEffect,
} from '../types/spells';
import { lineSegmentsIntersect } from './audioOcclusion';
import { computeVisibilityPolygon } from './raycaster';

export const SPELL_THEME_COLORS: Record<
  SpellColorTheme,
  { fill: string; stroke: string; glow: string; text: string; particle: string }
> = {
  fire: {
    fill: 'rgba(239, 68, 68, 0.28)',
    stroke: '#F97316',
    glow: 'rgba(249, 115, 22, 0.75)',
    text: '#FDBA74',
    particle: '#F97316',
  },
  cold: {
    fill: 'rgba(56, 189, 248, 0.25)',
    stroke: '#38BDF8',
    glow: 'rgba(56, 189, 248, 0.8)',
    text: '#BAE6FD',
    particle: '#38BDF8',
  },
  lightning: {
    fill: 'rgba(250, 204, 21, 0.28)',
    stroke: '#FACC15',
    glow: 'rgba(250, 204, 21, 0.85)',
    text: '#FEF08A',
    particle: '#FDE047',
  },
  acid: {
    fill: 'rgba(16, 185, 129, 0.28)',
    stroke: '#10B981',
    glow: 'rgba(16, 185, 129, 0.8)',
    text: '#A7F3D0',
    particle: '#34D399',
  },
  radiant: {
    fill: 'rgba(245, 158, 11, 0.3)',
    stroke: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.85)',
    text: '#FDE68A',
    particle: '#FBBF24',
  },
  necrotic: {
    fill: 'rgba(168, 85, 247, 0.28)',
    stroke: '#C084FC',
    glow: 'rgba(168, 85, 247, 0.8)',
    text: '#E9D5FF',
    particle: '#C084FC',
  },
  arcane: {
    fill: 'rgba(139, 92, 246, 0.26)',
    stroke: '#A78BFA',
    glow: 'rgba(139, 92, 246, 0.8)',
    text: '#DDD6FE',
    particle: '#A78BFA',
  },
};

export const POPULAR_DND_SPELLS: SpellPresetConfig[] = [
  {
    name: 'Fireball (Огненный шар)',
    shape: 'circle',
    rangeFt: 20,
    theme: 'fire',
    saveType: 'DEX',
    defaultDamage: '8d6',
    description: 'Взрыв 20 фт. радиус огня. 8d6 урона огнем, DEX save на половину.',
  },
  {
    name: 'Spirit Guardians (Духовные стражи)',
    shape: 'circle',
    rangeFt: 15,
    theme: 'radiant',
    saveType: 'WIS',
    defaultDamage: '3d8',
    description: '15 фт. аура вокруг кастера. WIS save или 3d8 излучения.',
  },
  {
    name: 'Burning Hands (Огненные ладони)',
    shape: 'cone',
    rangeFt: 15,
    coneAngleDeg: 53.13,
    theme: 'fire',
    saveType: 'DEX',
    defaultDamage: '3d6',
    description: 'Конус 15 фт. огня от кастера (53.13°). DEX save или 3d6 огня.',
  },
  {
    name: 'Cone of Cold (Конус холода)',
    shape: 'cone',
    rangeFt: 60,
    coneAngleDeg: 60,
    theme: 'cold',
    saveType: 'CON',
    defaultDamage: '8d8',
    description: 'Конус 60 фт. ледяного вихря (60°). CON save или 8d8 холода.',
  },
  {
    name: "Dragon's Breath (Дыхание дракона)",
    shape: 'cone',
    rangeFt: 15,
    coneAngleDeg: 53.13,
    theme: 'acid',
    saveType: 'DEX',
    defaultDamage: '3d6',
    description: 'Конус 15 фт. едкого дыхания. DEX save или 3d6 кислоты.',
  },
  {
    name: 'Lightning Bolt (Молния)',
    shape: 'line',
    rangeFt: 100,
    widthFt: 5,
    theme: 'lightning',
    saveType: 'DEX',
    defaultDamage: '8d6',
    description: 'Линия 100 фт. длиной и 5 фт. шириной. DEX save или 8d6 электричества.',
  },
  {
    name: 'Aganazzar’s Scorcher (Испепелитель)',
    shape: 'line',
    rangeFt: 30,
    widthFt: 5,
    theme: 'fire',
    saveType: 'DEX',
    defaultDamage: '3d8',
    description: 'Линия 30 фт. струи пламени. DEX save или 3d8 огня.',
  },
  {
    name: 'Faerie Fire (Огонь фей)',
    shape: 'cube',
    rangeFt: 20,
    theme: 'arcane',
    saveType: 'DEX',
    description: 'Куб 20 фт. разноцветного сияния. DEX save или преимущество на атаки.',
  },
  {
    name: 'Web (Паутина)',
    shape: 'cube',
    rangeFt: 20,
    theme: 'acid',
    saveType: 'DEX',
    description: 'Куб 20 фт. липкой паутины. Опутывает задетых врагов.',
  },
  {
    name: 'Fog Cloud (Облако тумана)',
    shape: 'circle',
    rangeFt: 20,
    theme: 'cold',
    saveType: 'CON',
    description: 'Сфера 20 фт. густого тумана. Полностью блокирует видимость.',
  },
];

// D&D 5e Cone standard half-angle: ~26.565° (total aperture 53.13° so width at distance D = D)
export const DND_CONE_HALF_ANGLE = Math.atan(0.5); // ~0.4636 rad (26.565 deg)

/**
 * Complete Manager and geometry calculation engine for D&D 5e AoE Spell Templates.
 */
export class SpellTemplateManager {
  /**
   * Checks if a point (px, py) is inside a circle with center (cx, cy) and radius.
   * Accounts for token physical radius.
   */
  static isPointInCircle(
    px: number,
    py: number,
    cx: number,
    cy: number,
    radiusPx: number,
    tokenRadiusPx = 0
  ): boolean {
    const dist = Math.hypot(px - cx, py - cy);
    return dist <= radiusPx + tokenRadiusPx * 0.7;
  }

  /**
   * Checks if a point (px, py) is inside a cone originating at (ox, oy) pointing in direction angleRad.
   * Supports standard D&D 53.13° cone or custom aperture (e.g. 60°, 90°).
   */
  static isPointInCone(
    px: number,
    py: number,
    ox: number,
    oy: number,
    lengthPx: number,
    angleRad: number,
    halfAngleRad = DND_CONE_HALF_ANGLE,
    tokenRadiusPx = 0
  ): boolean {
    const dx = px - ox;
    const dy = py - oy;
    const dist = Math.hypot(dx, dy);

    if (dist > lengthPx + tokenRadiusPx * 0.7) {
      return false;
    }
    if (dist < 1e-4) {
      return true; // Right at apex
    }

    // Normalized angle difference [-PI, PI]
    const pointAngle = Math.atan2(dy, dx);
    let diff = pointAngle - angleRad;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const angleMargin = dist > 0 ? Math.asin(Math.min(0.9, (tokenRadiusPx * 0.6) / dist)) : 0;
    return Math.abs(diff) <= halfAngleRad + angleMargin;
  }

  /**
   * Checks if a point (px, py) is inside an Oriented Bounding Box (OBB) representing a Line/Beam spell.
   * Beam starts at (ox, oy), extends by lengthPx at angleRad, with thickness widthPx.
   */
  static isPointInRotatedRect(
    px: number,
    py: number,
    ox: number,
    oy: number,
    lengthPx: number,
    widthPx: number,
    angleRad: number,
    tokenRadiusPx = 0
  ): boolean {
    const dx = px - ox;
    const dy = py - oy;

    const cos = Math.cos(-angleRad);
    const sin = Math.sin(-angleRad);

    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfWidth = widthPx / 2 + tokenRadiusPx * 0.7;
    return (
      localX >= -tokenRadiusPx * 0.5 &&
      localX <= lengthPx + tokenRadiusPx * 0.7 &&
      Math.abs(localY) <= halfWidth
    );
  }

  /**
   * Alias for isPointInRotatedRect for Line/Beam spells.
   */
  static isPointInLine(
    px: number,
    py: number,
    ox: number,
    oy: number,
    lengthPx: number,
    widthPx: number,
    angleRad: number,
    tokenRadiusPx = 0
  ): boolean {
    return this.isPointInRotatedRect(px, py, ox, oy, lengthPx, widthPx, angleRad, tokenRadiusPx);
  }

  /**
   * Checks if a point (px, py) is inside an Axis-Aligned Cube/Square with center (cx, cy) and side sizePx.
   */
  static isPointInCube(
    px: number,
    py: number,
    cx: number,
    cy: number,
    sizePx: number,
    tokenRadiusPx = 0
  ): boolean {
    const half = sizePx / 2 + tokenRadiusPx * 0.7;
    return Math.abs(px - cx) <= half && Math.abs(py - cy) <= half;
  }

  /**
   * Checks if line segment from origin to target center is obstructed by any solid wall or closed door.
   * (Cover / Line of Effect check for explosions & spells).
   */
  static isLineOfEffectBlocked(
    origin: Point,
    target: Point,
    walls: WallSegment[]
  ): boolean {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.type === 'window') continue;
      if (w.type === 'door' && w.isOpen) continue;

      if (lineSegmentsIntersect(origin.x, origin.y, target.x, target.y, w.x1, w.y1, w.x2, w.y2)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluates all tokens on the map to determine which ones are affected by the spell template.
   */
  static detectAffectedTokens(
    template: SpellTemplate,
    tokens: Token[],
    cellSizePx: number,
    walls: WallSegment[]
  ): string[] {
    const affected: string[] = [];
    const rangePx = (template.radiusFt / 5) * cellSizePx;
    const widthPx = ((template.widthFt || 5) / 5) * cellSizePx;
    const origin: Point = { x: template.x, y: template.y };

    const halfAngle =
      template.coneAngleDeg !== undefined
        ? (template.coneAngleDeg * Math.PI) / 360
        : DND_CONE_HALF_ANGLE;

    for (const token of tokens) {
      const tokRadius = (token.size * cellSizePx) / 2;
      const center: Point = {
        x: (token.x + token.size / 2) * cellSizePx,
        y: (token.y + token.size / 2) * cellSizePx,
      };

      let isInShape = false;
      switch (template.shape) {
        case 'circle':
          isInShape = this.isPointInCircle(center.x, center.y, origin.x, origin.y, rangePx, tokRadius);
          break;
        case 'cone':
          isInShape = this.isPointInCone(
            center.x,
            center.y,
            origin.x,
            origin.y,
            rangePx,
            template.angle,
            halfAngle,
            tokRadius
          );
          break;
        case 'line':
          isInShape = this.isPointInLine(
            center.x,
            center.y,
            origin.x,
            origin.y,
            rangePx,
            widthPx,
            template.angle,
            tokRadius
          );
          break;
        case 'cube':
          isInShape = this.isPointInCube(center.x, center.y, origin.x, origin.y, rangePx, tokRadius);
          break;
      }

      if (!isInShape) continue;

      // Check Wall Obstruction / Cover if enabled
      if (template.blockByWalls) {
        const isBlocked = this.isLineOfEffectBlocked(origin, center, walls);
        if (isBlocked) continue;
      }

      affected.push(token.id);
    }

    return affected;
  }

  /**
   * Renders an AoE Spell Template on Canvas with glowing neon borders, animated pulse,
   * and raycast wall clipping when blockByWalls is enabled.
   */
  static drawTemplate(
    ctx: CanvasRenderingContext2D,
    template: SpellTemplate,
    cellSizePx: number,
    now: number,
    isHoverPreview = false,
    isSelected = false,
    walls: WallSegment[] = [],
    mapWidth = 4000,
    mapHeight = 4000
  ): void {
    const { shape, x, y, radiusFt, angle, theme } = template;
    const rangePx = (radiusFt / 5) * cellSizePx;
    const widthPx = ((template.widthFt || 5) / 5) * cellSizePx;
    const themeColors = SPELL_THEME_COLORS[theme] || SPELL_THEME_COLORS.fire;

    const pulse = Math.sin(now / 220) * 0.12;
    const alphaFill = isHoverPreview ? 0.22 : 0.28 + pulse;

    const halfAngle =
      template.coneAngleDeg !== undefined
        ? (template.coneAngleDeg * Math.PI) / 360
        : DND_CONE_HALF_ANGLE;

    ctx.save();

    // 1. Raycast Wall Clipping: If blockByWalls is enabled and walls exist, clip the canvas context
    if (template.blockByWalls && walls.length > 0) {
      const visPoly = computeVisibilityPolygon(
        { x, y },
        rangePx * 1.15,
        walls,
        mapWidth,
        mapHeight,
        64
      );
      if (visPoly && visPoly.polygon.length > 2) {
        ctx.beginPath();
        ctx.moveTo(visPoly.polygon[0].x, visPoly.polygon[0].y);
        for (let i = 1; i < visPoly.polygon.length; i++) {
          ctx.lineTo(visPoly.polygon[i].x, visPoly.polygon[i].y);
        }
        ctx.closePath();
        ctx.clip();
      }
    }

    // 2. Neon glow & semi-transparent fill
    ctx.fillStyle = themeColors.fill.replace(/[\d.]+\)$/, `${Math.max(0.08, alphaFill)})`);
    ctx.strokeStyle = themeColors.stroke;
    ctx.lineWidth = isSelected ? 3.5 : isHoverPreview ? 2 : 2.5;

    ctx.shadowColor = themeColors.glow;
    ctx.shadowBlur = isSelected ? 18 : isHoverPreview ? 8 : 14;

    ctx.beginPath();
    switch (shape) {
      case 'circle': {
        ctx.arc(x, y, rangePx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner tactical radius ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = themeColors.stroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, rangePx * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Center crosshair marker
        ctx.fillStyle = themeColors.stroke;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'cone': {
        const startAngle = angle - halfAngle;
        const endAngle = angle + halfAngle;

        ctx.moveTo(x, y);
        ctx.arc(x, y, rangePx, startAngle, endAngle, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Apex beacon dot
        ctx.shadowBlur = 0;
        ctx.fillStyle = themeColors.stroke;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Arc centerline
        ctx.strokeStyle = themeColors.stroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * rangePx, y + Math.sin(angle) * rangePx);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }

      case 'line': {
        const halfW = widthPx / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const perpX = -sin * halfW;
        const perpY = cos * halfW;

        const p1 = { x: x + perpX, y: y + perpY };
        const p2 = { x: x - perpX, y: y - perpY };
        const p3 = { x: x + cos * rangePx - perpX, y: y + sin * rangePx - perpY };
        const p4 = { x: x + cos * rangePx + perpX, y: y + sin * rangePx + perpY };

        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Centerline laser guide
        ctx.shadowBlur = 0;
        ctx.strokeStyle = themeColors.stroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cos * rangePx, y + sin * rangePx);
        ctx.stroke();
        ctx.setLineDash([]);

        // Origin marker
        ctx.fillStyle = themeColors.stroke;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'cube': {
        const half = rangePx / 2;
        ctx.rect(x - half, y - half, rangePx, rangePx);
        ctx.fill();
        ctx.stroke();

        // Center crosshair marker
        ctx.shadowBlur = 0;
        ctx.fillStyle = themeColors.stroke;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Corner tick marks
        ctx.strokeStyle = themeColors.stroke;
        ctx.lineWidth = 1.5;
        const tick = 6;
        ctx.strokeRect(x - half, y - half, tick, tick);
        ctx.strokeRect(x + half - tick, y - half, tick, tick);
        ctx.strokeRect(x - half, y + half - tick, tick, tick);
        ctx.strokeRect(x + half - tick, y + half - tick, tick, tick);
        break;
      }
    }

    ctx.restore();

    // 3. Selection Accents and Direction Handles (outside clipping)
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);

      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(x, y, rangePx + 5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape === 'cone' || shape === 'line') {
        // Rotation handle point at the tip
        const tipX = x + Math.cos(angle) * (rangePx + 15);
        const tipY = y + Math.sin(angle) * (rangePx + 15);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Label Badge with Template Name, Size, and Obstruction Shield Icon
    ctx.save();
    ctx.shadowBlur = 0;
    const labelText = `${template.name} (${template.radiusFt} фт.)${
      template.blockByWalls ? ' 🛡️' : ''
    }`;
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    const tw = ctx.measureText(labelText).width;

    const labelY = shape === 'cone' || shape === 'line' ? y - 18 : y - rangePx - 10;
    ctx.fillStyle = 'rgba(11, 15, 23, 0.9)';
    ctx.fillRect(x - tw / 2 - 6, labelY - 8, tw + 12, 18);
    ctx.strokeStyle = isSelected ? '#FACC15' : themeColors.stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - tw / 2 - 6, labelY - 8, tw + 12, 18);

    ctx.fillStyle = isSelected ? '#FEF08A' : themeColors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, x, labelY + 1);

    ctx.restore();
  }

  /**
   * Renders a dramatic magical shockwave and particle burst on the canvas
   * when a spell is cast or placed on the map.
   */
  static drawCastEffect(
    ctx: CanvasRenderingContext2D,
    effect: SpellCastEffect,
    now: number
  ): boolean {
    const elapsed = now - effect.startTime;
    if (elapsed > effect.durationMs) {
      return false; // Effect has finished
    }

    const t = Math.min(1, elapsed / effect.durationMs);
    const easeOut = 1 - Math.pow(1 - t, 3);
    const fade = 1 - t;

    const themeColors = SPELL_THEME_COLORS[effect.theme] || SPELL_THEME_COLORS.fire;
    const currentRadius = effect.radiusPx * easeOut;

    ctx.save();

    // 1. Expanding shockwave ring
    ctx.strokeStyle = themeColors.stroke;
    ctx.lineWidth = 3.5 * fade;
    ctx.shadowColor = themeColors.glow;
    ctx.shadowBlur = 20 * fade;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, currentRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Central arcane flash
    const innerRadius = Math.max(0, 16 * (1 - t * 2));
    if (innerRadius > 0) {
      ctx.fillStyle = themeColors.glow;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, innerRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Radiating energy particles
    const particleCount = 14;
    for (let i = 0; i < particleCount; i++) {
      const pAngle = (i / particleCount) * Math.PI * 2 + (effect.startTime % 1000) / 500;
      const pDist = currentRadius * (0.4 + (i % 3) * 0.25);
      const px = effect.x + Math.cos(pAngle) * pDist;
      const py = effect.y + Math.sin(pAngle) * pDist;
      const pSize = (3.5 - (i % 2)) * fade;

      ctx.fillStyle = themeColors.particle;
      ctx.shadowBlur = 8 * fade;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.5, pSize), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return true; // Still active
  }
}

// Direct function exports for backward compatibility and clean ergonomics
export const isPointInCircle = SpellTemplateManager.isPointInCircle.bind(SpellTemplateManager);
export const isPointInCone = SpellTemplateManager.isPointInCone.bind(SpellTemplateManager);
export const isPointInRotatedRect = SpellTemplateManager.isPointInRotatedRect.bind(SpellTemplateManager);
export const isPointInLine = SpellTemplateManager.isPointInLine.bind(SpellTemplateManager);
export const isPointInCube = SpellTemplateManager.isPointInCube.bind(SpellTemplateManager);
export const isLineOfEffectBlocked = SpellTemplateManager.isLineOfEffectBlocked.bind(SpellTemplateManager);
export const detectAffectedTokens = SpellTemplateManager.detectAffectedTokens.bind(SpellTemplateManager);

export function drawSpellTemplate(
  ctx: CanvasRenderingContext2D,
  template: SpellTemplate,
  cellSizePx: number,
  now: number,
  isHoverPreview = false,
  isSelected = false,
  walls: WallSegment[] = [],
  mapWidth = 4000,
  mapHeight = 4000
): void {
  SpellTemplateManager.drawTemplate(
    ctx,
    template,
    cellSizePx,
    now,
    isHoverPreview,
    isSelected,
    walls,
    mapWidth,
    mapHeight
  );
}
