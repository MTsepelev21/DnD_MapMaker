import React, { useState } from 'react';
import {
  AmbientSoundPreset,
  GlobalMusicState,
  GlobalMusicTrack,
  OneShotSfxType,
  PositionalAudioSource,
  UserRole,
} from '../types/vtt';
import { spatialAudio } from '../utils/audioManager';
import {
  Compass,
  Flame,
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
  { id: 'combat_standard', label: 'Бой: Звон Стали', icon: '⚔️', category: 'combat' },
  { id: 'combat_epic', label: 'Бой: Битва с Боссом', icon: '🐉', category: 'combat' },
];

const ONE_SHOT_SFX: { id: OneShotSfxType; label: string; icon: string; desc: string }[] = [
  { id: 'sword_clash', label: 'Удар меча', icon: '⚔️', desc: 'Звонкий металлический клэш' },
  { id: 'fireball', label: 'Огненный шар', icon: '🔥', desc: 'Взрыв и рев пламени' },
  { id: 'door_creak', label: 'Скрип двери', icon: '🚪', desc: 'Медленный скрип петель' },
  { id: 'monster_roar', label: 'Рык чудовища', icon: '👹', desc: 'Утробный утробный рев' },
  { id: 'bow_shot', label: 'Выстрел из лука', icon: '🏹', desc: 'Тетива и свист стрелы' },
  { id: 'heal_spell', label: 'Исцеление', icon: '✨', desc: 'Восходящий перезвон' },
  { id: 'magic_teleport', label: 'Телепорт', icon: '🌀', desc: 'Магическое искривление' },
  { id: 'thunderclap', label: 'Удар грома', icon: '⚡', desc: 'Раскатистый грозовой удар' },
];

const PRESET_OPTIONS: { id: AmbientSoundPreset; label: string; icon: any }[] = [
  { id: 'campfire', label: 'Костер / Факел', icon: Flame },
  { id: 'water_stream', label: 'Водопад / Вода', icon: Waves },
  { id: 'dungeon_drone', label: 'Гул крипты', icon: Music },
  { id: 'tavern_crowd', label: 'Шум таверны', icon: Sparkles },
  { id: 'wind_whisper', label: 'Ветер в проеме', icon: Wind },
  { id: 'arcane_hum', label: 'Магический алтарь', icon: Zap },
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
  const [activeTab, setActiveTab] = useState<'soundboard' | 'sources' | 'music'>('soundboard');
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
    spatialAudio.unlockContext();
    spatialAudio.playOneShotSfx(type);
    onBroadcastSfx(type);
  };

  const handleSelectTrack = (track: GlobalMusicTrack) => {
    spatialAudio.unlockContext();
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
    spatialAudio.unlockContext();
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
              Аудио и Саундборд VTT
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

        {/* 3 Sub-Tabs: SFX, Источники на карте, Музыка */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
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
        {/* TAB 1: ONE-SHOT SFX SOUNDBOARD */}
        {activeTab === 'soundboard' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Мгновенные звуковые эффекты (SFX)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Воспроизводится синхронно у всех подключенных игроков.
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
                    : 'Включить боевую музыку (Combat Crossfade)'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: POSITIONAL MAP AUDIO SOURCES */}
        {activeTab === 'sources' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Пространственный 2D-звук
                </h3>
                <p className="text-[11px] text-slate-400">
                  Звук позиционируется в наушниках и глушится стенами.
                </p>
              </div>

              {isGM && (
                <button
                  onClick={() => onCreateAudioSource('campfire')}
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
                      Нажмите «Добавить» или выберите инструмент на панели.
                    </p>
                  )}
                </div>
              ) : (
                audioSources.map((source) => {
                  const isSelected = source.id === selectedAudioSourceId;
                  return (
                    <div
                      key={source.id}
                      onClick={() => onSelectAudioSource(source.id)}
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
                        <span>
                          Тип:{' '}
                          <strong className="text-slate-300">
                            {PRESET_OPTIONS.find((p) => p.id === source.preset)?.label || 'Свой'}
                          </strong>
                        </span>

                        <span className="font-mono-tabular">
                          Зона: {Math.round(source.minDistance)} – {Math.round(source.maxDistance)} px
                        </span>

                        {isGM && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
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
                            {source.isPlaying ? 'Играет' : 'Пауза'}
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
                  <label className="text-[11px] text-slate-400">Название:</label>
                  <input
                    type="text"
                    value={selectedSource.name}
                    onChange={(e) =>
                      onUpdateAudioSource({ ...selectedSource, name: e.target.value })
                    }
                    className="w-full px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Пресет звука:</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESET_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() =>
                          onUpdateAudioSource({ ...selectedSource, preset: opt.id })
                        }
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] border text-left transition-colors ${
                          selectedSource.preset === opt.id
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <opt.icon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Громкость источника:</span>
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
                    <span className="text-slate-400">100% громкость:</span>
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
                    <span className="text-slate-400">Радиус затухания:</span>
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

        {/* TAB 3: GLOBAL AMBIENCE & COMBAT MUSIC */}
        {activeTab === 'music' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-200">
                Глобальный фоновый эмбиент и музыка
              </h3>
              <p className="text-[11px] text-slate-400">
                Фоновый трек без позиционирования, слышен всей группе.
              </p>
            </div>

            {/* Global Music Volume */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Громкость музыки:</span>
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

            {/* Track selector */}
            <div className="space-y-2">
              <span className="text-[11px] text-slate-400 font-semibold block">
                Выберите трек:
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
                            {trk.category === 'combat' ? 'Боевой саундтрек' : 'Атмосферный эмбиент'}
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
                Остановить музыку
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
