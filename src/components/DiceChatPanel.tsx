import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, DiceRollResult, UserRole } from '../types/vtt';
import { executeDiceFormula } from '../utils/dice';
import { soundFX } from '../utils/sound';
import { EyeOff, Send, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';

interface DiceChatPanelProps {
  messages: ChatMessage[];
  playerName: string;
  playerColor: string;
  role: UserRole;
  onSendMessage: (msg: ChatMessage) => void;
  onClearMessages?: () => void;
}

export const DiceChatPanel: React.FC<DiceChatPanelProps> = ({
  messages,
  playerName,
  playerColor,
  role,
  onSendMessage,
  onClearMessages,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSecretGm, setIsSecretGm] = useState(role === 'GM');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role === 'GM') {
      setIsSecretGm(true);
    }
  }, [role]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Check if input is a dice roll command, e.g. "/r 1d20+5" or "1d20+5"
    let rollFormula: string | null = null;
    let reason = '';
    if (trimmed.startsWith('/r ') || trimmed.startsWith('/roll ')) {
      const parts = trimmed.replace(/^\/(r|roll)\s+/, '').split(/\s+(.+)/);
      rollFormula = parts[0];
      reason = parts[1] || '';
    } else if (/^(\d*)d(\d+)([+-]\d+)?$/i.test(trimmed)) {
      rollFormula = trimmed;
    }

    if (rollFormula) {
      soundFX.playDiceRoll();
      const roll = executeDiceFormula(rollFormula, {
        senderName: playerName,
        senderRole: role,
        senderColor: playerColor,
        isSecretGm: role === 'GM' && isSecretGm,
        reason: reason || undefined,
      });
      onSendMessage({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderName: playerName,
        senderRole: role,
        senderColor: playerColor,
        roll,
        isSecretGm: role === 'GM' && isSecretGm,
        timestamp: Date.now(),
      });
    } else {
      onSendMessage({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderName: playerName,
        senderRole: role,
        senderColor: playerColor,
        text: trimmed,
        isSecretGm: role === 'GM' && isSecretGm,
        timestamp: Date.now(),
      });
    }

    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#0E131F] text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-sm font-bold text-slate-100">Лог игры и Чат</h2>
        </div>
        {role === 'GM' && onClearMessages && (
          <button
            onClick={onClearMessages}
            title="Очистить лог"
            className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Message History List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-xs">
        {(() => {
          const visibleMessages = messages.filter(
            (m) => role === 'GM' || (!m.isSecretGm && !(m.senderRole === 'GM' && m.roll))
          );
          if (visibleMessages.length === 0) {
            return (
              <div className="text-center py-10 text-slate-500 text-xs leading-relaxed space-y-2">
                <Sparkles className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                <p>Лог бросков пуст.</p>
                <p className="text-[11px] text-slate-600">
                  Нажмите на кубики внизу экрана или введите команду вида{' '}
                  <code className="text-amber-400 font-mono-tabular">1d20+5</code>.
                </p>
              </div>
            );
          }

          return visibleMessages.map((msg) => {
            const isGmSecret = msg.isSecretGm;
            const roll = msg.roll;

            return (
              <div
                key={msg.id}
                className={`p-3 rounded-xl border transition-all ${
                  isGmSecret
                    ? 'bg-purple-950/30 border-purple-800/60'
                    : roll?.isNat20
                    ? 'bg-emerald-950/30 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                    : roll?.isNat1
                    ? 'bg-rose-950/30 border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: msg.senderColor || '#F59E0B' }}
                    />
                    <span className="font-semibold text-slate-200 truncate">
                      {msg.senderName}
                    </span>
                    <span
                      className={`text-[9px] font-mono-tabular px-1 py-0.2 rounded ${
                        msg.senderRole === 'GM'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {msg.senderRole}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isGmSecret && (
                      <span className="text-[10px] text-purple-400 flex items-center gap-0.5 bg-purple-900/60 px-1.5 py-0.5 rounded border border-purple-700/50">
                        <EyeOff className="w-2.5 h-2.5" /> Скрытно
                      </span>
                    )}
                    <span className="text-[10px] font-mono-tabular text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Dice Roll Card */}
                {roll && (
                  <div className="space-y-1.5 pt-1">
                    {roll.reason && (
                      <div className="text-[11px] font-medium text-slate-300 italic">
                        {roll.reason}
                      </div>
                    )}

                    <div className="flex items-baseline justify-between">
                      <div className="text-[11px] font-mono-tabular text-slate-400">
                        Формула: <span className="text-amber-400 font-semibold">{roll.formula}</span>
                        {roll.rollType === 'advantage' && (
                          <span className="ml-1 text-emerald-400 font-bold">(ADV)</span>
                        )}
                        {roll.rollType === 'disadvantage' && (
                          <span className="ml-1 text-rose-400 font-bold">(DIS)</span>
                        )}
                      </div>

                      {/* Total Result Badge */}
                      <div className="flex items-center gap-1.5">
                        {roll.isNat20 && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/60 uppercase tracking-wider">
                            Крит! (20)
                          </span>
                        )}
                        {roll.isNat1 && (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-500/60 uppercase tracking-wider">
                            Провал! (1)
                          </span>
                        )}
                        <span
                          className={`font-mono-tabular text-lg font-extrabold ${
                            roll.isNat20
                              ? 'text-emerald-400'
                              : roll.isNat1
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {roll.total}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div className="text-[11px] font-mono-tabular text-slate-400 bg-slate-950/70 px-2 py-1 rounded border border-slate-800/80 flex items-center justify-between">
                      <span>
                        Кубики: [
                        {roll.diceResults.map((d, i) => {
                          const isKept = roll.keptDice.includes(d);
                          return (
                            <span
                              key={i}
                              className={`mr-1 ${
                                isKept ? 'text-slate-100 font-bold' : 'text-slate-600 line-through'
                              }`}
                            >
                              {d}
                            </span>
                          );
                        })}
                        ]
                      </span>
                      {roll.modifier !== 0 && (
                        <span>
                          Мод: {roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Spell Card Box */}
                {msg.spellCard && (
                  <div className="space-y-2 p-2.5 bg-slate-950/80 border border-amber-500/40 rounded-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                        <span>✨</span>
                        <span>{msg.spellCard.spellName}</span>
                      </div>
                      <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {msg.spellCard.sizeFt} фт. ({msg.spellCard.shape})
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300">
                      <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">
                        Задетые цели ({msg.spellCard.affectedTargets.length}):
                      </div>
                      {msg.spellCard.affectedTargets.length === 0 ? (
                        <div className="text-slate-500 italic text-[11px]">
                          Ни одно существо не попало в зону поражения.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {msg.spellCard.affectedTargets.map((target) => (
                            <div
                              key={target.id}
                              className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-900 border border-slate-800"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: target.color }}
                                />
                                <span className="font-medium truncate text-slate-200">
                                  {target.name}
                                </span>
                                <span
                                  className={`text-[9px] px-1 py-0.2 rounded ${
                                    target.faction === 'player'
                                      ? 'bg-emerald-950 text-emerald-300'
                                      : 'bg-rose-950 text-rose-300'
                                  }`}
                                >
                                  {target.faction === 'player' ? 'Союзник' : 'Враг'}
                                </span>
                              </div>

                              {target.saveResult ? (
                                <div className="text-[11px] font-mono-tabular flex items-center gap-1">
                                  <span className="text-slate-400">Спасбросок:</span>
                                  <span
                                    className={`font-bold ${
                                      target.saveResult.isSuccess
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                    }`}
                                  >
                                    d20({target.saveResult.roll})
                                    {target.dexMod >= 0 ? `+${target.dexMod}` : target.dexMod} ={' '}
                                    {target.saveResult.total}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono-tabular">
                                  {msg.spellCard?.saveType || 'DEX'}:{' '}
                                  {target.dexMod >= 0 ? `+${target.dexMod}` : target.dexMod}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* GM Action: Roll saving throws for all targets */}
                    {role === 'GM' &&
                      msg.spellCard.affectedTargets.length > 0 &&
                      !msg.spellCard.affectedTargets.some((t) => t.saveResult) && (
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playDiceRoll();
                            const dc = 14; // Default standard spell save DC
                            const updatedTargets = msg.spellCard!.affectedTargets.map((t) => {
                              const roll = Math.floor(Math.random() * 20) + 1;
                              const total = roll + t.dexMod;
                              return {
                                ...t,
                                saveResult: {
                                  roll,
                                  total,
                                  isSuccess: total >= dc,
                                },
                              };
                            });

                            const saveSummary = updatedTargets
                              .map(
                                (t) =>
                                  `${t.name}: ${t.saveResult?.total} (${
                                    t.saveResult?.isSuccess ? 'Успех' : 'Провал'
                                  })`
                              )
                              .join(', ');

                            const statNames: Record<string, string> = {
                              DEX: 'Ловкости',
                              CON: 'Телосложения',
                              WIS: 'Мудрости',
                              STR: 'Силы',
                              INT: 'Интеллекта',
                              CHA: 'Харизмы',
                            };
                            const statRu = statNames[msg.spellCard!.saveType] || msg.spellCard!.saveType;

                            onSendMessage({
                              id: `save-${Date.now()}`,
                              senderName: 'Мастер (D&D Спасброски)',
                              senderRole: 'GM',
                              senderColor: '#A855F7',
                              text: `🎲 Спасброски ${statRu} против ${
                                msg.spellCard!.spellName
                              } (DC ${dc}): ${saveSummary}`,
                              timestamp: Date.now(),
                            });
                          }}
                          className="w-full mt-2 py-1.5 px-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Бросить спасброски {
                            msg.spellCard.saveType === 'DEX' ? 'Ловкости' :
                            msg.spellCard.saveType === 'CON' ? 'Телосложения' :
                            msg.spellCard.saveType === 'WIS' ? 'Мудрости' :
                            msg.spellCard.saveType === 'STR' ? 'Силы' :
                            msg.spellCard.saveType === 'INT' ? 'Интеллекта' :
                            msg.spellCard.saveType === 'CHA' ? 'Харизмы' :
                            msg.spellCard.saveType
                          } для всех целей
                        </button>
                      )}
                  </div>
                )}

                {/* Plain Text Message */}
                {msg.text && (
                  <p className="text-slate-200 leading-relaxed text-xs break-words">{msg.text}</p>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 bg-[#0B0F17] border-t border-slate-800 space-y-2 shrink-0">
        {role === 'GM' && (
          <label className="flex items-center gap-1.5 text-[11px] text-purple-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSecretGm}
              onChange={(e) => setIsSecretGm(e.target.checked)}
              className="accent-purple-500 rounded"
            />
            <EyeOff className="w-3 h-3 text-purple-400" />
            <span>Секретный бросок / Шепот Мастера (скрыт от игроков)</span>
          </label>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Сообщение или /r 1d20+5..."
            className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
