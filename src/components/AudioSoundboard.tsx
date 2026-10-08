import React, { useState } from 'react';
import {
  AmbientSoundPreset,
  GlobalMusicState,
  GlobalMusicTrack,
  OneShotSfxType,
  PositionalAudioSource,
  UserRole,
} from '../types/vtt';
import { AMBIENT_PRESET_URLS, spatialAudio } from '../utils/audioManager';
import {
  Compass,
  Flame,
  Link2,
  Music,
  Plus,
  Radio,
  Sliders,
  Sparkles,
  Swords,
  Trash2,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';

interface AudioSoundboardProps {
  role: UserRole;
  audioSources: PositionalAudioSource[];
  globalMusic: GlobalMusicState;
  selectedAudioSourceId: string | null;
  onSelectAudioSource: (id: string | null) => void;
  onCreateAudioSource: (preset?: AmbientSoundPreset) => void;
  onUpdateAudioSource: (source: PositionalAudioSource) => void;
  onDeleteAudioSource: (id: string) => void;
  onUpdateGlobalMusic: (music: GlobalMusicState) => void;
  onBroadcastSfx: (type: OneShotSfxType) => void;
  onFocusPosition?: (x: number, y: number) => void;
  onClose?: () => void;
}

const GLOBAL_TRACKS: { id: GlobalMusicTrack; label: string; icon: string; category: 'ambient' | 'combat' }[] = [
  { id: 'ambient_dungeon', label: 'Крипта Подземелья', icon: '💀', category: 'ambient' },
  { id: 'ambient_tavern', label: 'Шумная Таверна', icon: '🍺', category: 'ambient' },
  { id: 'ambient_forest', label: 'Ночной Лес', icon: '🌲', category: 'ambient' },
  { id: 'ambient_rain', label: 'Гроза и Ливень', icon: '⛈️', category: 'ambient' },
  { id: 'combat_standard', label: 'Бой: Тревога Стали', icon: '⚔️', category: 'combat' },
  { id: 'combat_epic', label: 'Бой: Грозовая Битва с Боссом', icon: '🐉', category: 'combat' },
];

const ONE_SHOT_SFX: { id: OneShotSfxType; label: string; icon: string; desc: string }[] = [
  { id: 'sword_clash', label: 'Удар меча', icon: '⚔️', desc: 'Реальный металлический удар' },
  { id: 'fireball', label: 'Огненный шар', icon: '🔥', desc: 'Взрыв и рокот пламени' },
  { id: 'door_creak', label: 'Скрип двери', icon: '🚪', desc: 'Скрип деревянной двери' },
  { id: 'monster_roar', label: 'Рык чудовища', icon: '👹', desc: 'Звериный рык монстра' },
  { id: 'bow_shot', label: 'Выстрел из лука', icon: '🏹', desc: 'Щелчок тетивы и выстрел' },
  { id: 'heal_spell', label: 'Исцеление', icon: '✨', desc: 'Магический перезвон' },
  { id: 'magic_teleport', label: 'Телепорт', icon: '🌀', desc: 'Пространственный импульс' },
  { id: 'thunderclap', label: 'Удар грома', icon: '⚡', desc: 'Раскат настоящего грома' },
];

const PRESET_OPTIONS: {
  id: AmbientSoundPreset;
  label: string;
  desc: string;
  icon: any;
  defaultUrl?: string;
}[] = [
  {
    id: 'campfire',
    label: 'Костёр / Факел',
    desc: 'Потрескивание огня',
    icon: Flame,
    defaultUrl: AMBIENT_PRESET_URLS.campfire.primary,
  },
  {
    id: 'water_stream',
    label: 'Вода / Фонтан / Река',
    desc: 'Журчание воды',
    icon: Waves,
    defaultUrl: AMBIENT_PRESET_URLS.water_stream.primary,
  },
  {
    id: 'arcane_hum',
    label: 'Портал / Магия',
    desc: 'Низкий гул',
    icon: Zap,
    defaultUrl: AMBIENT_PRESET_URLS.arcane_hum.primary,
  },
  {
    id: 'tavern_crowd',
    label: 'Таверна',
    desc: 'Гул голосов',
    icon: Sparkles,
    defaultUrl: AMBIENT_PRESET_URLS.tavern_crowd.primary,
  },
  {
    id: 'dungeon_drone',
    label: 'Гул крипты',
    desc: 'Эмбиент подземелья',
    icon: Music,
    defaultUrl: AMBIENT_PRESET_URLS.dungeon_drone.primary,
  },
  {
    id: 'wind_whisper',
    label: 'Ветер в проеме',
    desc: 'Завывание сквозняка',
    icon: Wind,
    defaultUrl: AMBIENT_PRESET_URLS.wind_whisper.primary,
  },
  {
    id: 'custom',
    label: 'Свой MP3 / OGG URL',
    desc: 'Прямая ссылка на аудиофайл',
    icon: Link2,
  },
];

export const AudioSoundboard: React.FC<AudioSoundboardProps> = ({
  role,
  audioSources,
  globalMusic,
  selectedAudioSourceId,
  onSelectAudioSource,
  onCreateAudioSource,
  onUpdateAudioSource,
  onDeleteAudioSource,
  onUpdateGlobalMusic,
  onBroadcastSfx,
  onFocusPosition,
}) => {
  const isGM = role === 'GM';
  const [activeTab, setActiveTab] = useState<'soundboard' | 'sources' | 'music'>('sources');
  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const selectedSource = audioSources.find((s) => s.id === selectedAudioSourceId) || null;

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    spatialAudio.setMasterMute(next);
  };

  const handleMasterVolume = (vol: number) => {
    setMasterVolume(vol);
    spatialAudio.setMasterVolume(vol);
  };

  const handlePlaySfx = (type: OneShotSfxType) => {
    void spatialAudio.unlockContext();
    void spatialAudio.playOneShotSfx(type);
    onBroadcastSfx(type);
  };

  const handleSelectTrack = (track: GlobalMusicTrack) => {
    void spatialAudio.unlockContext();
    const isCombat = track.startsWith('combat_');
    const nextState: GlobalMusicState = {
      ...globalMusic,
      currentTrack: track,
      isPlaying: true,
      isCombatMode: isCombat,
    };
    onUpdateGlobalMusic(nextState);
  };

  const handleToggleCombatMusic = () => {
    void spatialAudio.unlockContext();
    const targetTrack: GlobalMusicTrack = globalMusic.isCombatMode
      ? 'ambient_dungeon'
      : 'combat_epic';
    const nextState: GlobalMusicState = {
      ...globalMusic,
      currentTrack: targetTrack,
      isPlaying: true,
      isCombatMode: !globalMusic.isCombatMode,
    };
    onUpdateGlobalMusic(nextState);
  };

  return (
    <div className="flex flex-col h-full bg-[#0E131F] text-slate-100 font-sans">
      {/* Header & Sub-Navigation */}
      <div className="p-4 border-b border-slate-800 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-sm font-bold text-slate-100">
              Пространственное Аудио (Web Audio API)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMute}
              className={`p-1.5 rounded-lg border transition-colors ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isMuted ? 'Включить звук' : 'Заглушить звук'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Master Volume Slider */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] w-14">Мастер:</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={masterVolume}
            onChange={(e) => handleMasterVolume(Number(e.target.value))}
            className="flex-1 accent-amber-500 h-1.5"
          />
          <span className="font-mono-tabular text-[11px] text-amber-400 w-8 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        {/* 3 Sub-Tabs: Источники на карте, SFX, Музыка */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
          <button
            onClick={() => setActiveTab('sources')}
            className={`py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'sources'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Источники ({audioSources.length})
          </button>
          <button
            onClick={() => setActiveTab('soundboard')}
            className={`py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'soundboard'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Саундборд
          </button>
          <button
            onClick={() => setActiveTab('music')}
            className={`py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'music'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Музыка
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* TAB 1: POSITIONAL MAP AUDIO SOURCES */}
        {activeTab === 'sources' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Источники 2D-звука на карте
                </h3>
                <p className="text-[11px] text-slate-400">
                  Реальные аудиофайлы (OGG/MP3) с панорамой, затуханием и LowPass-глушением стенами.
                </p>
              </div>

              {isGM && (
                <button
                  onClick={() => {
                    void spatialAudio.unlockContext();
                    onCreateAudioSource('campfire');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить
                </button>
              )}
            </div>

            {/* List of active spatial audio sources on map */}
            <div className="space-y-2">
              {audioSources.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl p-4">
                  <Radio className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                  <p>На карте еще нет источников звука.</p>
                  {isGM && (
                    <p className="text-[11px] text-slate-600 mt-1">
                      Нажмите «Добавить» или выберите инструмент размещения на левой панели.
                    </p>
                  )}
                </div>
              ) : (
                audioSources.map((source) => {
                  const isSelected = source.id === selectedAudioSourceId;
                  const presetMeta = PRESET_OPTIONS.find((p) => p.id === source.preset);
                  return (
                    <div
                      key={source.id}
                      onClick={() => {
                        void spatialAudio.unlockContext();
                        onSelectAudioSource(source.id);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/90 border-amber-500 shadow-md'
                          : 'bg-slate-900/70 border-slate-800 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: source.color || '#F59E0B' }}
                          />
                          <span className="font-bold text-xs text-slate-100 truncate">
                            {source.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {onFocusPosition && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onFocusPosition(source.x, source.y);
                              }}
                              className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                              title="Центрировать камеру на источнике"
                            >
                              <Compass className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isGM && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteAudioSource(source.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Удалить источник звука"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Controls row */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate max-w-[140px]">
                          Пресет:{' '}
                          <strong className="text-slate-200">
                            {presetMeta?.label || 'Свой URL'}
                          </strong>
                        </span>

                        <span className="font-mono-tabular">
                          {Math.round(source.minDistance)}–{Math.round(source.maxDistance)} px
                        </span>

                        {isGM && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void spatialAudio.unlockContext();
                              onUpdateAudioSource({
                                ...source,
                                isPlaying: !source.isPlaying,
                              });
                            }}
                            className={`px-2 py-0.5 rounded font-semibold text-[10px] transition-colors ${
                              source.isPlaying
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {source.isPlaying ? 'Loop: ВКЛ' : 'Пауза'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inspector for selected audio source */}
            {isGM && selectedSource && (
              <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3.5 mt-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Настройки: {selectedSource.name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono-tabular">
                    X: {Math.round(selectedSource.x)} Y: {Math.round(selectedSource.y)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Название источника:</label>
                  <input
                    type="text"
                    value={selectedSource.name}
                    onChange={(e) =>
                      onUpdateAudioSource({ ...selectedSource, name: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Preset Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 block">
                    Пресет реального звука (Loop = true):
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESET_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          void spatialAudio.unlockContext();
                          onUpdateAudioSource({
                            ...selectedSource,
                            preset: opt.id,
                            // Clear custom URL when switching back to a standard preset unless choosing 'custom'
                            url: opt.id === 'custom' ? selectedSource.url || '' : undefined,
                          });
                        }}
                        className={`flex flex-col items-start p-2 rounded-lg text-[11px] border text-left transition-colors ${
                          selectedSource.preset === opt.id
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold w-full">
                          <opt.icon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{opt.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 truncate w-full">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Audio File URL Input (MP3 / OGG / WAV) */}
                <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                  <label className="text-[11px] text-slate-300 flex items-center gap-1.5 font-medium">
                    <Link2 className="w-3.5 h-3.5 text-amber-400" />
                    Своя ссылка на аудиофайл (MP3 / OGG / WAV):
                  </label>
                  <input
                    type="url"
                    value={selectedSource.url || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdateAudioSource({
                        ...selectedSource,
                        preset: val.trim() ? 'custom' : selectedSource.preset,
                        url: val,
                      });
                    }}
                    placeholder="https://example.com/audio/campfire.ogg"
                    className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Если поле пустое, используется встроенный аудиофайл выбранного пресета (
                    <span className="text-slate-400 font-mono-tabular">
                      {selectedSource.preset !== 'custom'
                        ? AMBIENT_PRESET_URLS[selectedSource.preset]?.label
                        : 'Свой URL'}
                    </span>
                    ).
                  </p>
                </div>

                {/* Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Базовая громкость:</span>
                    <span className="font-mono-tabular text-amber-400">
                      {Math.round(selectedSource.volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedSource.volume}
                    onChange={(e) =>
                      onUpdateAudioSource({
                        ...selectedSource,
                        volume: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>

                {/* Distance Radii */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="space-y-1">
                    <span className="text-slate-400">100% громкость (min):</span>
                    <input
                      type="range"
                      min={40}
                      max={250}
                      step={10}
                      value={selectedSource.minDistance}
                      onChange={(e) =>
                        onUpdateAudioSource({
                          ...selectedSource,
                          minDistance: Number(e.target.value),
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                    <span className="font-mono-tabular text-cyan-300 text-[10px] block text-center">
                      {selectedSource.minDistance} px ({Math.round(selectedSource.minDistance / 10)} фт.)
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400">Затухание в 0% (max):</span>
                    <input
                      type="range"
                      min={selectedSource.minDistance + 30}
                      max={900}
                      step={20}
                      value={selectedSource.maxDistance}
                      onChange={(e) =>
                        onUpdateAudioSource({
                          ...selectedSource,
                          maxDistance: Number(e.target.value),
                        })
                      }
                      className="w-full accent-amber-500"
                    />
                    <span className="font-mono-tabular text-amber-300 text-[10px] block text-center">
                      {selectedSource.maxDistance} px ({Math.round(selectedSource.maxDistance / 10)} фт.)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ONE-SHOT SFX SOUNDBOARD */}
        {activeTab === 'soundboard' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Мгновенные звуковые эффекты (SFX)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Реальные сэмплы, воспроизводимые синхронно у всех подключенных игроков.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {ONE_SHOT_SFX.map((sfx) => (
                <button
                  key={sfx.id}
                  onClick={() => handlePlaySfx(sfx.id)}
                  className="group relative flex flex-col items-start p-3 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{sfx.icon}</span>
                    <span className="font-bold text-xs text-slate-100 group-hover:text-amber-300 transition-colors">
                      {sfx.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 leading-tight">
                    {sfx.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Quick Combat Music Crossfade Button */}
            {isGM && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  onClick={handleToggleCombatMusic}
                  className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all shadow-md ${
                    globalMusic.isCombatMode
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300 hover:bg-rose-500/30'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  <Swords className="w-4 h-4" />
                  {globalMusic.isCombatMode
                    ? 'Завершить бой (Crossfade в эмбиент)'
                    : 'Включить боевую атмосферу (Combat Crossfade)'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GLOBAL AMBIENCE & COMBAT MUSIC */}
        {activeTab === 'music' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-200">
                Глобальный фоновый эмбиент и музыка
              </h3>
              <p className="text-[11px] text-slate-400">
                Фоновый трек без 2D-позиционирования, слышен всей группе.
              </p>
            </div>

            {/* Global Music Volume */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Громкость фона:</span>
                <span className="font-mono-tabular text-amber-400">
                  {Math.round(globalMusic.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!isGM}
                value={globalMusic.volume}
                onChange={(e) =>
                  onUpdateGlobalMusic({
                    ...globalMusic,
                    volume: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-500"
              />
            </div>

            {/* Custom Global Music URL */}
            {isGM && (
              <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                <label className="text-[11px] text-slate-300 flex items-center gap-1.5 font-medium">
                  <Link2 className="w-3.5 h-3.5 text-amber-400" />
                  Свой URL фоновой музыки (MP3 / OGG):
                </label>
                <input
                  type="url"
                  value={globalMusic.customUrl || ''}
                  onChange={(e) =>
                    onUpdateGlobalMusic({
                      ...globalMusic,
                      customUrl: e.target.value,
                      isPlaying: true,
                      currentTrack:
                        globalMusic.currentTrack === 'none'
                          ? 'ambient_dungeon'
                          : globalMusic.currentTrack,
                    })
                  }
                  placeholder="https://example.com/music/dungeon_theme.mp3"
                  className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* Track selector */}
            <div className="space-y-2">
              <span className="text-[11px] text-slate-400 font-semibold block">
                Выберите пресет атмосферы:
              </span>
              <div className="grid grid-cols-1 gap-2">
                {GLOBAL_TRACKS.map((trk) => {
                  const isCurrent = globalMusic.currentTrack === trk.id && globalMusic.isPlaying;
                  return (
                    <button
                      key={trk.id}
                      disabled={!isGM}
                      onClick={() => handleSelectTrack(trk.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isCurrent
                          ? trk.category === 'combat'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-md'
                            : 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{trk.icon}</span>
                        <div>
                          <div className="font-bold text-xs text-slate-100">
                            {trk.label}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {trk.category === 'combat' ? 'Боевой режим' : 'Атмосферный эмбиент'}
                          </div>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-slate-950">
                          Играет
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stop Music Button */}
            {isGM && globalMusic.isPlaying && (
              <button
                onClick={() =>
                  onUpdateGlobalMusic({
                    ...globalMusic,
                    isPlaying: false,
                    currentTrack: 'none',
                  })
                }
                className="w-full py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-colors"
              >
                Остановить фоновое аудио
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
