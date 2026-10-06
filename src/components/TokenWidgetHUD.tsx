import React, { useState } from 'react';
import { ConditionType, DND_CONDITIONS, Token, UserRole } from '../types/vtt';
import { soundFX } from '../utils/sound';
import {
  Activity,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Plus,
  Shield,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';

interface TokenWidgetHUDProps {
  token: Token;
  role: UserRole;
  isOwnerOrGM: boolean;
  onUpdateToken: (updated: Token) => void;
  onClose: () => void;
  onRollDice?: (formula: string, reason?: string) => void;
}

export const TokenWidgetHUD: React.FC<TokenWidgetHUDProps> = ({
  token,
  role,
  isOwnerOrGM,
  onUpdateToken,
  onClose,
  onRollDice,
}) => {
  const [hpDeltaInput, setHpDeltaInput] = useState('');
  const [showConditionsPicker, setShowConditionsPicker] = useState(false);

  const applyHpDelta = (delta: number) => {
    soundFX.playStep();
    let newTemp = token.tempHp || 0;
    let newHp = token.hp;

    if (delta < 0) {
      // Damage: absorbed by Temp HP first
      const damage = Math.abs(delta);
      if (newTemp > 0) {
        if (newTemp >= damage) {
          newTemp -= damage;
        } else {
          const remainingDamage = damage - newTemp;
          newTemp = 0;
          newHp = Math.max(0, newHp - remainingDamage);
        }
      } else {
        newHp = Math.max(0, newHp - damage);
      }
    } else {
      // Healing
      newHp = Math.min(token.maxHp, newHp + delta);
    }

    onUpdateToken({
      ...token,
      hp: newHp,
      tempHp: newTemp,
    });
  };

  const handleCustomHpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(hpDeltaInput.trim(), 10);
    if (!isNaN(val) && val !== 0) {
      applyHpDelta(val);
      setHpDeltaInput('');
    }
  };

  const toggleCondition = (condId: ConditionType) => {
    soundFX.playStep();
    const current = token.conditions || [];
    const next = current.includes(condId)
      ? current.filter((c) => c !== condId)
      : [...current, condId];
    onUpdateToken({
      ...token,
      conditions: next,
    });
  };

  const hpRatio = Math.max(0, Math.min(1, token.hp / Math.max(1, token.maxHp)));

  return (
    <div className="w-80 bg-[#0E131F]/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-4 text-xs font-sans text-slate-100 space-y-3.5 z-30">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm"
            style={{ backgroundColor: token.color }}
          >
            {token.initials}
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-100 truncate flex items-center gap-1.5">
              <span>{token.name}</span>
              {token.isHiddenByGM && (
                <span className="text-[10px] text-purple-400 font-mono-tabular bg-purple-950 px-1.5 py-0.2 rounded border border-purple-800/60">
                  СКРЫТ
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              {token.faction === 'player' ? 'Персонаж игрока' : 'Монстр / Противник'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* HP Bar and Numerical Stats */}
      <div className="space-y-2 p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
            <span>Здоровье (HP)</span>
          </div>
          <div className="font-mono-tabular text-sm font-bold">
            <span
              className={
                hpRatio > 0.5
                  ? 'text-emerald-400'
                  : hpRatio > 0.25
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }
            >
              {token.hp}
            </span>
            <span className="text-slate-500"> / {token.maxHp}</span>
            {token.tempHp && token.tempHp > 0 ? (
              <span className="ml-1 text-sky-400 text-xs">(+{token.tempHp})</span>
            ) : null}
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              hpRatio > 0.5 ? 'bg-emerald-500' : hpRatio > 0.25 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${hpRatio * 100}%` }}
          />
        </div>

        {/* Quick Damage & Healing Buttons */}
        {isOwnerOrGM && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-6 gap-1 text-[11px] font-mono-tabular">
              <button
                onClick={() => applyHpDelta(-10)}
                className="py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded font-semibold transition-colors"
                title="Получить 10 урона"
              >
                -10
              </button>
              <button
                onClick={() => applyHpDelta(-5)}
                className="py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded font-semibold transition-colors"
                title="Получить 5 урона"
              >
                -5
              </button>
              <button
                onClick={() => applyHpDelta(-1)}
                className="py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded font-semibold transition-colors"
                title="Получить 1 урон"
              >
                -1
              </button>

              <button
                onClick={() => applyHpDelta(1)}
                className="py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 rounded font-semibold transition-colors"
                title="Исцелить 1 HP"
              >
                +1
              </button>
              <button
                onClick={() => applyHpDelta(5)}
                className="py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 rounded font-semibold transition-colors"
                title="Исцелить 5 HP"
              >
                +5
              </button>
              <button
                onClick={() => applyHpDelta(10)}
                className="py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 rounded font-semibold transition-colors"
                title="Исцелить 10 HP"
              >
                +10
              </button>
            </div>

            {/* Custom Input: e.g. -12 or +5 */}
            <form onSubmit={handleCustomHpSubmit} className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={hpDeltaInput}
                onChange={(e) => setHpDeltaInput(e.target.value)}
                placeholder="+5 лечение или -14 урон"
                className="flex-1 px-2.5 py-1 text-xs font-mono-tabular bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg whitespace-nowrap"
              >
                Применить
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Combat Attributes (AC & Initiative) */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Класс брони</span>
          </div>
          <span className="font-mono-tabular text-sm font-bold text-slate-100">
            {token.ac}
          </span>
        </div>

        <button
          onClick={() => onRollDice?.('1d20', `Инициатива: ${token.name}`)}
          className="flex items-center justify-between p-2.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all"
        >
          <div className="flex items-center gap-1.5 text-slate-400">
            <Swords className="w-4 h-4 text-emerald-400" />
            <span>Инициатива</span>
          </div>
          <span className="font-mono-tabular text-xs font-bold text-emerald-400">
            1d20 🎲
          </span>
        </button>
      </div>

      {/* Conditions / Status Effects Tracker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            Состояния D&D 5e:
          </span>
          {isOwnerOrGM && (
            <button
              onClick={() => setShowConditionsPicker((p) => !p)}
              className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              {showConditionsPicker ? 'Скрыть список' : 'Добавить'}
            </button>
          )}
        </div>

        {/* Current Active Conditions */}
        {(!token.conditions || token.conditions.length === 0) && !showConditionsPicker ? (
          <p className="text-[11px] text-slate-500 italic">Нет активных состояний</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(token.conditions || []).map((condId) => {
              const def = DND_CONDITIONS.find((d) => d.id === condId);
              if (!def) return null;
              return (
                <button
                  key={condId}
                  onClick={() => isOwnerOrGM && toggleCondition(condId)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-rose-500 transition-colors shadow-sm"
                  title={`${def.label}: ${def.description} (клик для снятия)`}
                >
                  <span>{def.icon}</span>
                  <span>{def.label}</span>
                  {isOwnerOrGM && <X className="w-2.5 h-2.5 ml-0.5 text-slate-400" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Conditions Picker Dropdown */}
        {showConditionsPicker && isOwnerOrGM && (
          <div className="grid grid-cols-2 gap-1 p-2 bg-slate-950 border border-slate-800 rounded-xl">
            {DND_CONDITIONS.map((cond) => {
              const isApplied = (token.conditions || []).includes(cond.id);
              return (
                <button
                  key={cond.id}
                  onClick={() => toggleCondition(cond.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-left transition-colors ${
                    isApplied
                      ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <span>{cond.icon}</span>
                  <span className="truncate">{cond.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* GM Controls: Stealth & Torch */}
      {role === 'GM' && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
          <button
            onClick={() =>
              onUpdateToken({
                ...token,
                isHiddenByGM: !token.isHiddenByGM,
              })
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
              token.isHiddenByGM
                ? 'bg-purple-950/80 border-purple-600 text-purple-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {token.isHiddenByGM ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{token.isHiddenByGM ? 'Скрыт от игроков' : 'Виден игрокам'}</span>
          </button>

          <button
            onClick={() =>
              onUpdateToken({
                ...token,
                emitsLight: !token.emitsLight,
                brightLightRadius: token.brightLightRadius || 4,
                dimLightRadius: token.dimLightRadius || 8,
              })
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
              token.emitsLight
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Факел {token.emitsLight ? 'Вкл' : 'Выкл'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
