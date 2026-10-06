import React from 'react';
import { Combatant, CombatState, DND_CONDITIONS, Token, UserRole } from '../types/vtt';
import { rollDie } from '../utils/dice';
import { soundFX } from '../utils/sound';
import {
  ChevronRight,
  Flame,
  Play,
  RotateCcw,
  Shield,
  Square,
  Swords,
  UserCheck,
} from 'lucide-react';

interface InitiativeTrackerProps {
  combat: CombatState;
  tokens: Token[];
  role: UserRole;
  onUpdateCombat: (newCombat: CombatState) => void;
  onFocusToken?: (tokenId: string) => void;
}

export const InitiativeTracker: React.FC<InitiativeTrackerProps> = ({
  combat,
  tokens,
  role,
  onUpdateCombat,
  onFocusToken,
}) => {
  const isGM = role === 'GM';

  const handleStartCombat = () => {
    // Generate combatants from current map tokens
    const combatants: Combatant[] = tokens.map((t) => {
      const initRoll = rollDie(20);
      return {
        tokenId: t.id,
        name: t.name,
        initiative: t.initiative !== undefined ? t.initiative : initRoll,
        faction: t.faction,
        color: t.color,
        hp: t.hp,
        maxHp: t.maxHp,
        tempHp: t.tempHp,
        ac: t.ac,
        conditions: t.conditions || [],
      };
    });

    // Sort descending by initiative
    combatants.sort((a, b) => b.initiative - a.initiative);

    soundFX.playDiceRoll();
    onUpdateCombat({
      isActive: true,
      round: 1,
      currentTurnIndex: 0,
      combatants,
    });

    if (combatants[0] && onFocusToken) {
      onFocusToken(combatants[0].tokenId);
    }
  };

  const handleEndCombat = () => {
    onUpdateCombat({
      isActive: false,
      round: 1,
      currentTurnIndex: 0,
      combatants: [],
    });
  };

  const handleNextTurn = () => {
    if (!combat.combatants.length) return;
    soundFX.playStep();

    let nextIndex = combat.currentTurnIndex + 1;
    let nextRound = combat.round;

    if (nextIndex >= combat.combatants.length) {
      nextIndex = 0;
      nextRound += 1;
    }

    onUpdateCombat({
      ...combat,
      round: nextRound,
      currentTurnIndex: nextIndex,
    });

    const activeTokId = combat.combatants[nextIndex]?.tokenId;
    if (activeTokId && onFocusToken) {
      onFocusToken(activeTokId);
    }
  };

  const handleRerollAllInitiative = () => {
    soundFX.playDiceRoll();
    const updated = combat.combatants.map((c) => ({
      ...c,
      initiative: rollDie(20),
    }));
    updated.sort((a, b) => b.initiative - a.initiative);

    onUpdateCombat({
      ...combat,
      currentTurnIndex: 0,
      combatants: updated,
    });
  };

  const handleChangeInitiative = (tokenId: string, val: number) => {
    const updated = combat.combatants.map((c) =>
      c.tokenId === tokenId ? { ...c, initiative: val } : c
    );
    updated.sort((a, b) => b.initiative - a.initiative);
    onUpdateCombat({
      ...combat,
      combatants: updated,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0E131F] text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-sm font-bold text-slate-100">
            Трекер инициативы
          </h2>
        </div>

        {combat.isActive && (
          <div className="flex items-center gap-2 font-mono-tabular text-xs">
            <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
              Раунд {combat.round}
            </span>
          </div>
        )}
      </div>

      {/* Combat Control Actions */}
      <div className="p-3 border-b border-slate-800 bg-[#0B0F17] flex items-center justify-between gap-2 shrink-0">
        {!combat.isActive ? (
          <button
            disabled={!isGM}
            onClick={handleStartCombat}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all shadow-md ${
              isGM
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            Начать бой (Инициатива)
          </button>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={handleNextTurn}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors shadow-md"
            >
              <ChevronRight className="w-4 h-4" />
              Следующий ход
            </button>

            {isGM && (
              <>
                <button
                  onClick={handleRerollAllInitiative}
                  title="Перебросить инициативу всем"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleEndCombat}
                  title="Завершить бой"
                  className="p-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 rounded-xl border border-rose-800/60"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Combatants Turn Queue */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {!combat.isActive || combat.combatants.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs space-y-2">
            <Swords className="w-8 h-8 mx-auto text-slate-700" />
            <p>Бой не начат.</p>
            <p className="text-[11px] text-slate-600">
              Мастер может запустить боевой раунд кнопкой выше.
            </p>
          </div>
        ) : (
          combat.combatants.map((c, index) => {
            const isTurn = combat.currentTurnIndex === index;
            // Sync live token state
            const liveTok = tokens.find((t) => t.id === c.tokenId);
            const currentHp = liveTok ? liveTok.hp : c.hp;
            const maxHp = liveTok ? liveTok.maxHp : c.maxHp;
            const tempHp = liveTok ? liveTok.tempHp : c.tempHp;
            const ac = liveTok ? liveTok.ac : c.ac;
            const conditions = (liveTok ? liveTok.conditions : c.conditions) || [];
            const hpRatio = Math.max(0, Math.min(1, currentHp / Math.max(1, maxHp)));

            return (
              <div
                key={c.tokenId}
                onClick={() => onFocusToken?.(c.tokenId)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isTurn
                    ? 'bg-amber-500/15 border-amber-500 text-slate-100 shadow-[0_0_15px_rgba(245,158,11,0.2)] scale-[1.01]'
                    : 'bg-slate-900/70 border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Initiative badge or input */}
                    {isGM ? (
                      <input
                        type="number"
                        value={c.initiative}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleChangeInitiative(c.tokenId, parseInt(e.target.value, 10) || 0)
                        }
                        className="w-8 text-center py-0.5 font-mono-tabular font-bold text-amber-400 bg-slate-950 border border-slate-800 rounded focus:border-amber-500 text-xs"
                      />
                    ) : (
                      <span className="w-6 text-center font-mono-tabular font-bold text-amber-400 text-xs">
                        {c.initiative}
                      </span>
                    )}

                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>

                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate flex items-center gap-1.5">
                        <span>{c.name}</span>
                        {isTurn && (
                          <span className="text-[9px] bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                            ХОД
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span className="flex items-center gap-0.5">
                          <Shield className="w-3 h-3 text-slate-400" /> AC {ac}
                        </span>
                        <span>·</span>
                        <span className="font-mono-tabular">
                          HP {currentHp}/{maxHp}
                          {tempHp && tempHp > 0 ? ` (+${tempHp})` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Conditions icons */}
                  {conditions.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {conditions.slice(0, 3).map((condId) => {
                        const def = DND_CONDITIONS.find((d) => d.id === condId);
                        return (
                          <span
                            key={condId}
                            title={def?.label}
                            className="text-xs p-0.5 bg-slate-950 rounded border border-slate-800"
                          >
                            {def?.icon}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* HP mini bar */}
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full transition-all ${
                      hpRatio > 0.5 ? 'bg-emerald-500' : hpRatio > 0.25 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${hpRatio * 100}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
