import { Point, WallSegment } from './vtt';

export type SpellShapeType = 'circle' | 'cone' | 'line' | 'cube';

export type SpellColorTheme = 'fire' | 'cold' | 'lightning' | 'acid' | 'radiant' | 'necrotic' | 'arcane';

export interface SpellPresetConfig {
  name: string;
  shape: SpellShapeType;
  rangeFt: number; // e.g. 20ft radius, 15ft cone, 60ft line, 15ft cube
  widthFt?: number; // for line, e.g. 5ft
  coneAngleDeg?: number; // 53.13 (D&D 5e standard), 60, or 90
  theme: SpellColorTheme;
  saveType: 'DEX' | 'CON' | 'WIS' | 'STR' | 'CHA' | 'INT';
  defaultDamage?: string;
  description: string;
}

export interface SpellTemplate {
  id: string;
  name: string;
  shape: SpellShapeType;
  x: number; // World X in pixels (center for circle/cube, apex for cone/line)
  y: number; // World Y in pixels
  radiusFt: number; // For circle / cone length / line length / cube side in feet
  widthFt?: number; // Width for line (default 5ft)
  coneAngleDeg?: number; // 53.13, 60, 90
  angle: number; // Direction in radians (for cone and line)
  theme: SpellColorTheme;
  color: string;
  fillColor?: string;
  borderColor?: string;
  blockByWalls: boolean; // Cover / Line of Effect check
  casterTokenId?: string;
  casterName?: string;
  saveType?: 'DEX' | 'CON' | 'WIS' | 'STR' | 'CHA' | 'INT';
  affectedTokenIds?: string[];
  createdAt: number;
}

export interface SpellCastEffect {
  id: string;
  spellName: string;
  x: number;
  y: number;
  shape: SpellShapeType;
  radiusPx: number;
  angle: number;
  coneHalfAngle?: number;
  widthPx?: number;
  theme: SpellColorTheme;
  startTime: number;
  durationMs: number;
}

export interface SpellCardData {
  spellName: string;
  shape: SpellShapeType;
  sizeFt: number;
  saveType: 'DEX' | 'CON' | 'WIS' | 'STR' | 'CHA' | 'INT';
  casterName?: string;
  affectedTargets: {
    id: string;
    name: string;
    faction: 'player' | 'monster';
    color: string;
    dexMod: number;
    saveResult?: {
      roll: number;
      total: number;
      isSuccess?: boolean;
    };
  }[];
  dc?: number; // Spell save DC (e.g. 15)
  timestamp: number;
}

