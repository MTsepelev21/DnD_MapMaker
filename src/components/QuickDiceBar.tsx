import React, { useState } from 'react';
import { DiceAdvantageMode, DiceRollResult, UserRole } from '../types/vtt';
import { executeDiceFormula, QUICK_DICE } from '../utils/dice';
import { soundFX } from '../utils/sound';
import { EyeOff, Sparkles } from 'lucide-react';

interface QuickDiceBarProps {
  playerName: string;
  role: UserRole;
  playerColor: string;
  onRoll: (result: DiceRollResult) => void;
}

export const QuickDiceBar: React.FC<QuickDiceBarProps> = ({
  playerName,
  role,
  playerColor,
  onRoll,
}) => {
  const [customFormula, setCustomFormula] = useState('');
  const [modifier, setModifier] = useState<number>(0);
  const [advantageMode, setAdvantageMode] = useState<DiceAdvantageMode>('normal');
  const [isSecretGm, setIsSecretGm] = useState<boolean>(role === 'GM');

  React.useEffect(() => {
    if (role === 'GM') {
      setIsSecretGm(true);
    }
  }, [role]);

  const handleRollDie = (sides: number) => {
    soundFX.playDiceRoll();
    const formulaStr = modifier !== 0 ? `1d${sides}${modifier > 0 ? `+${modifier}` : modifier}` : `1d${sides}`;
    const result = executeDiceFormula(formulaStr, {
      senderName: playerName,
      senderRole: role,
      senderColor: playerColor,
      advantageMode: sides === 20 ? advantageMode : 'normal',
      isSecretGm: role === 'GM' ? isSecretGm : false,
    });
    onRoll(result);
  };

  const handleCustomRoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFormula.trim()) return;
    soundFX.playDiceRoll();
    const result = executeDiceFormula(customFormula.trim(), {
      senderName: playerName,
      senderRole: role,
      senderColor: playerColor,
      advantageMode,
      isSecretGm: role === 'GM' ? isSecretGm : false,
    });
    onRoll(result);
    setCustomFormula('');
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#0B0F17]/95 backdrop-blur-md border-t border-slate-800/90 text-xs shadow-xl shrink-0 z-10 overflow-x-auto no-scrollbar">
      {/* Quick Dice Clickable Buttons — Single Row with NO scrollbar */}
      <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
        <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1 shrink-0 whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          Кости:
        </span>
        <div className="flex items-center gap-1 shrink-0 flex-nowrap">
          {QUICK_DICE.map((d) => (
            <button
              key={d.label}
              onClick={() => handleRollDie(d.sides)}
              className="group relative flex items-center justify-center px-2 py-1 rounded-md font-mono-tabular font-bold text-xs bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-amber-500/50 transition-all hover:scale-105 active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
              title={`Бросить ${d.label}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full mr-1 shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Advantage / Modifier / Secret Controls & Custom Formula — Compact single line */}
      <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
        {/* Advantage / Disadvantage Mode Toggle for d20 */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setAdvantageMode('normal')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              advantageMode === 'normal'
                ? 'bg-slate-800 text-slate-100 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Обычный бросок (1d20)"
          >
            Норма
          </button>
          <button
            onClick={() => setAdvantageMode('advantage')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              advantageMode === 'advantage'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-300'
            }`}
            title="Преимущество: бросок 2d20, берется наибольшее"
          >
            ADV
          </button>
          <button
            onClick={() => setAdvantageMode('disadvantage')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              advantageMode === 'disadvantage'
                ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                : 'text-slate-400 hover:text-rose-300'
            }`}
            title="Помеха: бросок 2d20, берется наименьшее"
          >
            DIS
          </button>
        </div>

        {/* Quick Modifier */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 shrink-0">
          <span className="text-[11px] text-slate-400">Мод:</span>
          <button
            onClick={() => setModifier((m) => m - 1)}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-100"
          >
            -
          </button>
          <span className="font-mono-tabular text-amber-400 font-bold w-5 text-center">
            {modifier >= 0 ? `+${modifier}` : modifier}
          </span>
          <button
            onClick={() => setModifier((m) => m + 1)}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-100"
          >
            +
          </button>
        </div>

        {/* GM Secret Roll Toggle (Defaults to Secret so players don't see GM rolls) */}
        {role === 'GM' && (
          <button
            onClick={() => setIsSecretGm((s) => !s)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors shrink-0 whitespace-nowrap ${
              isSecretGm
                ? 'bg-purple-950/80 border-purple-600 text-purple-300 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={
              isSecretGm
                ? 'Бросок скрыт: игроки НЕ видят этот бросок'
                : 'Бросок публичен: игроки увидят этот бросок'
            }
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">
              {isSecretGm ? 'Скрыт от игроков' : 'Публичный'}
            </span>
          </button>
        )}

        {/* Custom D&D formula parser input */}
        <form onSubmit={handleCustomRoll} className="flex items-center gap-1.5 shrink-0">
          <input
            type="text"
            value={customFormula}
            onChange={(e) => setCustomFormula(e.target.value)}
            placeholder="2d6+3, 1d20+5..."
            className="w-28 px-2.5 py-1 text-xs font-mono-tabular bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500 placeholder-slate-500"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shadow-sm"
          >
            Бросить
          </button>
        </form>
      </div>
    </div>
  );
};
