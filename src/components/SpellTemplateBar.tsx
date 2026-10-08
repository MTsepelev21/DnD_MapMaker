import React, { useState } from 'react';
import {
  SpellColorTheme,
  SpellPresetConfig,
  SpellShapeType,
  SpellTemplate,
} from '../types/spells';
import { POPULAR_DND_SPELLS, SPELL_THEME_COLORS } from '../engine/spellTemplates';
import {
  Minus,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';

interface SpellTemplateBarProps {
  activePreset: SpellPresetConfig;
  customShape: SpellShapeType;
  customRangeFt: number;
  customTheme: SpellColorTheme;
  coneAngleDeg?: number;
  blockByWalls: boolean;
  placedTemplates: SpellTemplate[];
  selectedTemplateId: string | null;
  onSelectPreset: (preset: SpellPresetConfig) => void;
  onChangeShape: (shape: SpellShapeType) => void;
  onChangeRangeFt: (range: number) => void;
  onChangeTheme: (theme: SpellColorTheme) => void;
  onChangeConeAngleDeg?: (angle: number) => void;
  onToggleBlockByWalls: (val: boolean) => void;
  onDeleteTemplate: (id: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onClose: () => void;
}

const SHAPE_ICONS: { shape: SpellShapeType; label: string; icon: string }[] = [
  { shape: 'circle', label: 'Круг / Сфера', icon: '⭕' },
  { shape: 'cone', label: 'Конус', icon: '📐' },
  { shape: 'line', label: 'Линия / Луч', icon: '⚡' },
  { shape: 'cube', label: 'Куб / Квадрат', icon: '⬛' },
];

const THEME_OPTIONS: { theme: SpellColorTheme; label: string; dotColor: string }[] = [
  { theme: 'fire', label: 'Огонь', dotColor: '#EF4444' },
  { theme: 'cold', label: 'Холод', dotColor: '#38BDF8' },
  { theme: 'lightning', label: 'Молния', dotColor: '#FACC15' },
  { theme: 'acid', label: 'Кислота', dotColor: '#10B981' },
  { theme: 'radiant', label: 'Излучение', dotColor: '#F59E0B' },
  { theme: 'necrotic', label: 'Некроз', dotColor: '#A855F7' },
  { theme: 'arcane', label: 'Чары', dotColor: '#8B5CF6' },
];

const STANDARD_SIZES: Record<SpellShapeType, number[]> = {
  circle: [10, 15, 20, 30, 40],
  cone: [15, 30, 60],
  line: [30, 60, 100],
  cube: [10, 15, 20],
};

const CONE_ANGLES = [
  { deg: 53.13, label: '53° (D&D 5e)' },
  { deg: 60, label: '60°' },
  { deg: 90, label: '90°' },
];

export const SpellTemplateBar: React.FC<SpellTemplateBarProps> = ({
  activePreset,
  customShape,
  customRangeFt,
  customTheme,
  coneAngleDeg = 53.13,
  blockByWalls,
  placedTemplates,
  selectedTemplateId,
  onSelectPreset,
  onChangeShape,
  onChangeRangeFt,
  onChangeTheme,
  onChangeConeAngleDeg,
  onToggleBlockByWalls,
  onDeleteTemplate,
  onSelectTemplate,
  onClose,
}) => {
  const [showPresetsDropdown, setShowPresetsDropdown] = useState(false);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-auto">
      {/* Main Floating Tool Strip */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#0B0F17]/95 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-2xl text-xs text-slate-100 max-w-[96vw]">
        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-800">
          <Wand2 className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-300 text-[11px] whitespace-nowrap">
            AoE Заклинания:
          </span>
        </div>

        {/* Preset Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPresetsDropdown((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-medium transition-colors text-xs whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="max-w-[130px] truncate">{activePreset.name}</span>
            <span className="text-[10px] text-slate-400">▾</span>
          </button>

          {showPresetsDropdown && (
            <div className="absolute left-0 top-full mt-1.5 w-64 bg-[#0E131F] border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 max-h-72 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Популярные заклинания D&D 5e
              </div>
              {POPULAR_DND_SPELLS.map((sp) => (
                <button
                  key={sp.name}
                  type="button"
                  onClick={() => {
                    onSelectPreset(sp);
                    setShowPresetsDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                    activePreset.name === sp.name
                      ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="truncate">
                    <div>{sp.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {sp.rangeFt} фт. ({sp.shape})
                    </div>
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: SPELL_THEME_COLORS[sp.theme]?.stroke }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Shape Toggle Buttons */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          {SHAPE_ICONS.map((sh) => (
            <button
              key={sh.shape}
              type="button"
              onClick={() => onChangeShape(sh.shape)}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                customShape === sh.shape
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={sh.label}
            >
              <span>{sh.icon}</span>
              <span className="hidden sm:inline text-[11px]">{sh.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Standard Size Quick-Pills */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-lg px-1.5 py-0.5">
          {STANDARD_SIZES[customShape].map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => onChangeRangeFt(sz)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular transition-colors ${
                customRangeFt === sz
                  ? 'bg-amber-500/30 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sz}
            </button>
          ))}
          <span className="text-[9px] text-slate-500">фт</span>
        </div>

        {/* Size / Range Stepper in feet */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
          <span className="text-[10px] text-slate-400">Радиус:</span>
          <button
            type="button"
            onClick={() => onChangeRangeFt(Math.max(5, customRangeFt - 5))}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-mono-tabular font-bold text-amber-400 text-xs w-9 text-center">
            {customRangeFt} фт.
          </span>
          <button
            type="button"
            onClick={() => onChangeRangeFt(Math.min(120, customRangeFt + 5))}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Cone Aperture Angle (Only when Cone is selected) */}
        {customShape === 'cone' && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-0.5">
            <span className="text-[10px] text-slate-400">Угол:</span>
            {CONE_ANGLES.map((ca) => (
              <button
                key={ca.deg}
                type="button"
                onClick={() => onChangeConeAngleDeg?.(ca.deg)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  Math.abs(coneAngleDeg - ca.deg) < 1
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ca.label}
              </button>
            ))}
          </div>
        )}

        {/* Element Theme Selector (All 7 D&D 5e Themes) */}
        <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
          {THEME_OPTIONS.map((th) => (
            <button
              key={th.theme}
              type="button"
              onClick={() => onChangeTheme(th.theme)}
              className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                customTheme === th.theme
                  ? 'scale-110 border-white shadow-md'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              style={{ backgroundColor: th.dotColor }}
              title={th.label}
            />
          ))}
        </div>

        {/* Wall Obstruction Checkbox (Cover / Line of Effect) */}
        <button
          type="button"
          onClick={() => onToggleBlockByWalls(!blockByWalls)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
            blockByWalls
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Если включено, стены и закрытые двери блокируют область поражения заклинания (Cover)"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Учет стен</span>
        </button>

        {/* Active Placed Templates Count & Clear */}
        {placedTemplates.length > 0 && (
          <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
            <span className="text-[10px] text-amber-400 font-mono-tabular">
              {placedTemplates.length} на поле
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectedTemplateId) {
                  onDeleteTemplate(selectedTemplateId);
                  onSelectTemplate(null);
                } else {
                  placedTemplates.forEach((t) => onDeleteTemplate(t.id));
                }
              }}
              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
              title="Удалить активные шаблоны заклинаний"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Close Bar Button */}
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-100 transition-colors"
          title="Закрыть режим размещения заклинаний"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Helpful Hint Pill */}
      <div className="px-3 py-1 bg-slate-950/80 backdrop-blur-sm border border-slate-800 rounded-full text-[10px] text-slate-400 shadow-lg flex items-center gap-2">
        <span>✨ <strong>ЛКМ</strong> — закрепить шаблон на поле</span>
        <span aria-hidden="true">·</span>
        <span>Мышь управляет направлением конуса и луча</span>
        <span aria-hidden="true">·</span>
        <span><strong>ПКМ</strong> — удалить шаблон</span>
      </div>
    </div>
  );
};
