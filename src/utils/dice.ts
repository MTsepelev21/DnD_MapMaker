import { DiceAdvantageMode, DiceRollResult, UserRole } from '../types/vtt';

export interface ParseRollOptions {
  senderName: string;
  senderRole: UserRole;
  senderColor: string;
  isSecretGm?: boolean;
  advantageMode?: DiceAdvantageMode;
  reason?: string;
}

/**
 * Rolls an integer between 1 and sides inclusive.
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Parses and executes a D&D dice formula.
 * Examples supported:
 * - "1d20+5", "2d6+3", "1d8", "d100", "4d6-2", "1d12+1", "1d20"
 * - Advantage / Disadvantage support on d20 rolls
 */
export function executeDiceFormula(
  inputFormula: string,
  options: ParseRollOptions
): DiceRollResult {
  const clean = inputFormula.trim().toLowerCase().replace(/\s+/g, '');
  const rollType = options.advantageMode || 'normal';

  // Standard notation: [count]d[sides][+|-mod]
  const match = clean.match(/^(\d*)d(\d+)([+-]\d+)?$/);

  let count = 1;
  let sides = 20;
  let modifier = 0;

  if (match) {
    count = match[1] ? parseInt(match[1], 10) : 1;
    sides = parseInt(match[2], 10);
    modifier = match[3] ? parseInt(match[3], 10) : 0;
  } else {
    // Fallback: check if it's just a number or simple formula
    const numOnly = parseInt(clean, 10);
    if (!isNaN(numOnly) && numOnly > 0) {
      sides = numOnly;
      count = 1;
    }
  }

  // Safety clamps
  count = Math.max(1, Math.min(50, count));
  sides = Math.max(2, Math.min(1000, sides));

  const diceResults: number[] = [];
  let keptDice: number[] = [];

  if (sides === 20 && count === 1 && rollType !== 'normal') {
    // 1d20 with Advantage or Disadvantage rolls twice!
    const r1 = rollDie(20);
    const r2 = rollDie(20);
    diceResults.push(r1, r2);
    if (rollType === 'advantage') {
      keptDice = [Math.max(r1, r2)];
    } else {
      keptDice = [Math.min(r1, r2)];
    }
  } else {
    for (let i = 0; i < count; i++) {
      diceResults.push(rollDie(sides));
    }
    keptDice = [...diceResults];
  }

  const diceSum = keptDice.reduce((acc, v) => acc + v, 0);
  const total = diceSum + modifier;

  const isNat20 = sides === 20 && keptDice.includes(20);
  const isNat1 = sides === 20 && keptDice.includes(1);

  const formulaStr = `${count}d${sides}${
    modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ''
  }`;

  return {
    id: `roll-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    senderName: options.senderName,
    senderRole: options.senderRole,
    senderColor: options.senderColor,
    formula: formulaStr,
    rollType,
    diceResults,
    keptDice,
    modifier,
    total,
    isNat20,
    isNat1,
    isSecretGm: !!options.isSecretGm,
    timestamp: Date.now(),
    reason: options.reason,
  };
}

/**
 * Standard quick dice for the bottom toolbar
 */
export const QUICK_DICE = [
  { sides: 4, label: 'd4', color: '#38BDF8' },
  { sides: 6, label: 'd6', color: '#10B981' },
  { sides: 8, label: 'd8', color: '#F59E0B' },
  { sides: 10, label: 'd10', color: '#A855F7' },
  { sides: 12, label: 'd12', color: '#EC4899' },
  { sides: 20, label: 'd20', color: '#F43F5E' },
  { sides: 100, label: 'd100', color: '#06B6D4' },
];
