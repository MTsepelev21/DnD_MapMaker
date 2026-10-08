import {
  AmbientSoundPreset,
  GlobalMusicState,
  GlobalMusicTrack,
  OneShotSfxType,
  Point,
  PositionalAudioSource,
  WallSegment,
} from '../types/vtt';
import { calculateSpatialAudio } from '../engine/audioOcclusion';

/**
 * High-quality real audio preset library (OGG/MP3/WAV) with fallback URLs.
 * Uses real recorded audio files from Google Sound Library & Wikimedia Commons (CC0 / CC-BY).
 */
export const AMBIENT_PRESET_URLS: Record<
  Exclude<AmbientSoundPreset, 'custom'>,
  { primary: string; fallback: string; label: string; description: string }
> = {
  campfire: {
    primary: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Campfire_sound_ambience.ogg',
    label: 'Костёр / Факел',
    description: 'Живое потрескивание дров и теплого пламени',
  },
  water_stream: {
    primary: 'https://actions.google.com/sounds/v1/water/small_stream_flowing.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Brook_sound.ogg',
    label: 'Вода / Фонтан / Река',
    description: 'Журчание ручья, фонтана или подземного потока',
  },
  arcane_hum: {
    primary: 'https://actions.google.com/sounds/v1/science_fiction/sci_fi_vortex.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Deep_humming_noise.wav',
    label: 'Портал / Магия',
    description: 'Глубокий низкий гул магического разлома или алтаря',
  },
  tavern_crowd: {
    primary: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Restaurant_ambience.ogg',
    label: 'Таверна',
    description: 'Гул голосов, звон посуды и оживленная атмосфера',
  },
  dungeon_drone: {
    primary: 'https://actions.google.com/sounds/v1/horror/ambient_hum_pitched.ogg',
    fallback: 'https://actions.google.com/sounds/v1/science_fiction/sci_fi_vortex.ogg',
    label: 'Гул крипты',
    description: 'Мрачный низкочастотный эмбиент подземелья',
  },
  wind_whisper: {
    primary: 'https://actions.google.com/sounds/v1/weather/strong_wind.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/Wind_in_Swedish_pine_forest_at_25_mps.ogg',
    label: 'Ветер в проеме',
    description: 'Завывание сквозняка и холодного ветра',
  },
};

export const GLOBAL_MUSIC_URLS: Record<
  Exclude<GlobalMusicTrack, 'none'>,
  { primary: string; fallback: string }
> = {
  ambient_dungeon: {
    primary: 'https://actions.google.com/sounds/v1/horror/ambient_hum_pitched.ogg',
    fallback: 'https://actions.google.com/sounds/v1/science_fiction/sci_fi_vortex.ogg',
  },
  ambient_tavern: {
    primary: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Restaurant_ambience.ogg',
  },
  ambient_forest: {
    primary: 'https://actions.google.com/sounds/v1/ambiences/crickets_with_distant_traffic.ogg',
    fallback: 'https://actions.google.com/sounds/v1/weather/strong_wind.ogg',
  },
  ambient_rain: {
    primary: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Rhumphries_-_rbh-thunder-storm.ogg',
  },
  combat_standard: {
    primary: 'https://actions.google.com/sounds/v1/alarms/spaceship_alarm.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Exotic_Battle_%28ISRC_USUAN1100451%29.mp3',
  },
  combat_epic: {
    primary: 'https://actions.google.com/sounds/v1/weather/thunder_crack.ogg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Final_Battle_of_the_Dark_Wizards_%28ISRC_USUAN1500085%29.mp3',
  },
};

export const ONE_SHOT_SFX_URLS: Record<OneShotSfxType, string> = {
  sword_clash: 'https://actions.google.com/sounds/v1/impacts/crash.ogg',
  fireball: 'https://actions.google.com/sounds/v1/weapons/big_explosion_cut_off.ogg',
  door_creak: 'https://actions.google.com/sounds/v1/doors/creaking_wooden_door.ogg',
  monster_roar: 'https://actions.google.com/sounds/v1/horror/monster_alien_grunt_hiss.ogg',
  bow_shot: 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg',
  heal_spell: 'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg',
  magic_teleport: 'https://actions.google.com/sounds/v1/science_fiction/alien_beam.ogg',
  thunderclap: 'https://actions.google.com/sounds/v1/weather/thunder_crack.ogg',
};

interface ActiveSpatialNode {
  sourceId: string;
  bufferSource?: AudioBufferSourceNode;
  elementSource?: MediaElementAudioSourceNode;
  audioElement?: HTMLAudioElement;
  filterNode: BiquadFilterNode;
  pannerNode: StereoPannerNode;
  gainNode: GainNode;
  isPlaying: boolean;
  isLoading: boolean;
  currentPreset: AmbientSoundPreset;
  currentUrl: string;
}

export class PositionalAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private combatGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Active spatial sources map
  private spatialNodes: Map<string, ActiveSpatialNode> = new Map();

  // Decoded AudioBuffer cache by URL for seamless click-free loops
  private decodedBuffers: Map<string, AudioBuffer> = new Map();
  private inFlightFetches: Map<string, Promise<AudioBuffer | null>> = new Map();

  // Global background players
  private activeAmbienceEl: HTMLAudioElement | null = null;
  private activeAmbienceSource: MediaElementAudioSourceNode | null = null;
  private activeAmbienceTrack: string = '';

  private activeCombatEl: HTMLAudioElement | null = null;
  private activeCombatSource: MediaElementAudioSourceNode | null = null;
  private activeCombatTrack: string = '';

  private currentMusicState: GlobalMusicState = {
    currentTrack: 'none',
    isPlaying: false,
    volume: 0.5,
    isCombatMode: false,
  };

  public isMuted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlockContext();
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // Ambience sub-bus
        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.ambienceGain.connect(this.masterGain);

        // Combat sub-bus
        this.combatGain = this.ctx.createGain();
        this.combatGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.combatGain.connect(this.masterGain);

        // SFX sub-bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);
      }
    }
    return this.ctx;
  }

  public async unlockContext(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignored
      }
    }
    // Resume any paused HTMLAudioElements that should be playing
    for (const node of this.spatialNodes.values()) {
      if (node.isPlaying && node.audioElement && node.audioElement.paused) {
        node.audioElement.play().catch(() => {});
      }
    }
    if (this.currentMusicState.isPlaying) {
      if (this.activeAmbienceEl && this.activeAmbienceEl.paused) {
        this.activeAmbienceEl.play().catch(() => {});
      }
      if (this.activeCombatEl && this.activeCombatEl.paused) {
        this.activeCombatEl.play().catch(() => {});
      }
    }
  }

  public setMasterMute(muted: boolean): void {
    this.isMuted = muted;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.08);
  }

  public setMasterVolume(vol: number): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : clamped, ctx.currentTime, 0.08);
  }

  /**
   * Resolves the effective audio URL for a positional audio source.
   * Priority: custom URL if provided -> preset primary URL.
   */
  public resolveSourceUrl(source: PositionalAudioSource): { primary: string; fallback?: string } {
    const customTrimmed = source.url?.trim();
    if (customTrimmed && (source.preset === 'custom' || customTrimmed.length > 0)) {
      return {
        primary: customTrimmed,
        fallback:
          source.preset !== 'custom'
            ? AMBIENT_PRESET_URLS[source.preset]?.primary
            : AMBIENT_PRESET_URLS.campfire.primary,
      };
    }

    const presetKey = source.preset === 'custom' ? 'campfire' : source.preset;
    const presetConfig = AMBIENT_PRESET_URLS[presetKey] || AMBIENT_PRESET_URLS.campfire;
    return {
      primary: presetConfig.primary,
      fallback: presetConfig.fallback,
    };
  }

  /**
   * Loads and decodes a real audio file into an AudioBuffer via fetch() for gapless looping.
   */
  private async fetchAndDecodeAudioBuffer(
    url: string,
    fallbackUrl?: string
  ): Promise<AudioBuffer | null> {
    const ctx = this.getContext();
    if (!ctx) return null;

    if (this.decodedBuffers.has(url)) {
      return this.decodedBuffers.get(url)!;
    }

    if (this.inFlightFetches.has(url)) {
      return this.inFlightFetches.get(url)!;
    }

    const promise = (async (): Promise<AudioBuffer | null> => {
      const tryLoad = async (targetUrl: string): Promise<AudioBuffer | null> => {
        try {
          const response = await fetch(targetUrl, { mode: 'cors' });
          if (!response.ok) return null;
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          this.decodedBuffers.set(targetUrl, audioBuffer);
          return audioBuffer;
        } catch {
          return null;
        }
      };

      let buffer = await tryLoad(url);
      if (!buffer && fallbackUrl && fallbackUrl !== url) {
        buffer = await tryLoad(fallbackUrl);
        if (buffer) {
          this.decodedBuffers.set(url, buffer);
        }
      }
      this.inFlightFetches.delete(url);
      return buffer;
    })();

    this.inFlightFetches.set(url, promise);
    return promise;
  }

  /**
   * Attaches real audio playback to a spatial node chain.
   * Uses decoded AudioBufferSourceNode (loop = true) first for 100% seamless loop,
   * or falls back to HTMLAudioElement + createMediaElementSource if CORS blocks raw fetch.
   */
  private async attachAudioStreamToSpatialNode(
    node: ActiveSpatialNode,
    primaryUrl: string,
    fallbackUrl?: string
  ): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;

    node.isLoading = true;

    // 1. Try fetch + decodeAudioData for gapless AudioBuffer looping
    const buffer = await this.fetchAndDecodeAudioBuffer(primaryUrl, fallbackUrl);

    // Check if node was removed or replaced while loading
    if (this.spatialNodes.get(node.sourceId) !== node) {
      return;
    }

    if (buffer) {
      try {
        const bufSource = ctx.createBufferSource();
        bufSource.buffer = buffer;
        bufSource.loop = true;
        bufSource.connect(node.filterNode);
        bufSource.start(0);
        node.bufferSource = bufSource;
        node.isLoading = false;
        return;
      } catch {
        // Fall through to HTMLAudioElement
      }
    }

    // 2. Fallback to HTMLAudioElement + createMediaElementSource
    try {
      const audioEl = new Audio();
      audioEl.crossOrigin = 'anonymous';
      audioEl.src = primaryUrl;
      audioEl.loop = true;
      audioEl.preload = 'auto';

      if (fallbackUrl) {
        audioEl.onerror = () => {
          if (audioEl.src !== fallbackUrl) {
            audioEl.src = fallbackUrl;
            if (node.isPlaying) {
              audioEl.play().catch(() => {});
            }
          }
        };
      }

      const elSource = ctx.createMediaElementSource(audioEl);
      elSource.connect(node.filterNode);
      node.audioElement = audioEl;
      node.elementSource = elSource;
      node.isLoading = false;

      if (node.isPlaying) {
        audioEl.play().catch(() => {});
      }
    } catch {
      node.isLoading = false;
    }
  }

  private destroySpatialNode(node: ActiveSpatialNode): void {
    try {
      if (node.bufferSource) {
        node.bufferSource.stop();
        node.bufferSource.disconnect();
      }
    } catch {
      // Ignored
    }
    try {
      if (node.audioElement) {
        node.audioElement.pause();
        node.audioElement.src = '';
      }
      if (node.elementSource) {
        node.elementSource.disconnect();
      }
    } catch {
      // Ignored
    }
    try {
      node.filterNode.disconnect();
      node.pannerNode.disconnect();
      node.gainNode.disconnect();
    } catch {
      // Ignored
    }
  }

  // ---------------------------------------------------------------------------
  // POSITIONAL / 2D SPATIAL AUDIO NODE PIPELINE
  // ---------------------------------------------------------------------------

  /**
   * Updates or creates Web Audio nodes for spatial map audio sources:
   * [AudioBufferSourceNode / MediaElementAudioSourceNode]
   *   -> [BiquadFilterNode (LowPass Wall Occlusion)]
   *   -> [StereoPannerNode (2D Left/Right Panning)]
   *   -> [GainNode (Distance Attenuation + Smooth Ramp)]
   *   -> [MasterGain]
   */
  public updateSpatialSources(
    listener: Point,
    sources: PositionalAudioSource[],
    walls: WallSegment[]
  ): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    const activeSourceIds = new Set(sources.map((s) => s.id));

    // 1. Clean up removed sources with gentle fade-out
    for (const [id, node] of this.spatialNodes.entries()) {
      if (!activeSourceIds.has(id)) {
        this.destroySpatialNode(node);
        this.spatialNodes.delete(id);
      }
    }

    // 2. Update or create active sources
    for (const source of sources) {
      const resolved = this.resolveSourceUrl(source);
      let node = this.spatialNodes.get(source.id);

      // Recreate node if preset or custom URL changed
      if (
        node &&
        (node.currentPreset !== source.preset || node.currentUrl !== resolved.primary)
      ) {
        this.destroySpatialNode(node);
        this.spatialNodes.delete(source.id);
        node = undefined;
      }

      if (!source.isPlaying) {
        if (node) {
          node.isPlaying = false;
          // Smoothly ramp gain to 0 to avoid clicks when pausing
          node.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
          if (node.audioElement && !node.audioElement.paused) {
            setTimeout(() => {
              if (node && !node.isPlaying && node.audioElement) {
                node.audioElement.pause();
              }
            }, 220);
          }
        }
        continue;
      }

      if (!node) {
        // Create Web Audio processing chain starting at gain = 0 (soft start without click!)
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(22000, ctx.currentTime);
        filterNode.Q.setValueAtTime(0.707, ctx.currentTime);

        const pannerNode = ctx.createStereoPanner();
        pannerNode.pan.setValueAtTime(0, ctx.currentTime);

        const gainNode = ctx.createGain();
        // Start at 0 gain so audio fades in smoothly without any pop/click
        gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);

        // Connect chain: Filter -> Panner -> Gain -> MasterGain
        filterNode.connect(pannerNode);
        pannerNode.connect(gainNode);
        gainNode.connect(this.masterGain);

        node = {
          sourceId: source.id,
          filterNode,
          pannerNode,
          gainNode,
          isPlaying: true,
          isLoading: true,
          currentPreset: source.preset,
          currentUrl: resolved.primary,
        };

        this.spatialNodes.set(source.id, node);
        void this.attachAudioStreamToSpatialNode(node, resolved.primary, resolved.fallback);
      } else if (!node.isPlaying) {
        node.isPlaying = true;
        if (node.audioElement && node.audioElement.paused) {
          node.audioElement.play().catch(() => {});
        }
      }

      // 3. Real-time Acoustic Raycast Calculation (Stereo Pan, Distance Attenuation, Wall Occlusion)
      const acoustics = calculateSpatialAudio(listener, source, walls);

      const now = ctx.currentTime;
      const smoothTime = 0.12; // 120ms gentle time constant prevents any clicks or zipper noise

      // LowPass filter cutoff based on walls between player token and audio source
      node.filterNode.frequency.setTargetAtTime(acoustics.cutoffFrequency, now, smoothTime);

      // Stereo panning (-1 left to +1 right)
      node.pannerNode.pan.setTargetAtTime(acoustics.pan, now, smoothTime);

      // Distance attenuation * wall occlusion factor * source volume
      const targetGain = this.isMuted ? 0 : acoustics.finalGain;
      node.gainNode.gain.setTargetAtTime(targetGain, now, smoothTime);
    }
  }

  // ---------------------------------------------------------------------------
  // GLOBAL BACKGROUND AMBIENCE & COMBAT MUSIC (REAL AUDIO STREAMS + CROSSFADE)
  // ---------------------------------------------------------------------------

  public updateGlobalMusic(state: GlobalMusicState): void {
    const ctx = this.getContext();
    if (!ctx || !this.ambienceGain || !this.combatGain) return;

    this.currentMusicState = state;
    const now = ctx.currentTime;
    const crossfadeTime = 0.8;

    if (!state.isPlaying || state.currentTrack === 'none') {
      this.ambienceGain.gain.setTargetAtTime(0, now, 0.3);
      this.combatGain.gain.setTargetAtTime(0, now, 0.3);
      return;
    }

    const trackConfig = GLOBAL_MUSIC_URLS[state.currentTrack];
    const targetUrl = state.customUrl?.trim() || trackConfig?.primary;
    const fallbackUrl = trackConfig?.fallback;
    if (!targetUrl) return;

    const isCombat = state.isCombatMode || state.currentTrack.startsWith('combat_');
    const targetVolume = this.isMuted ? 0 : Math.max(0, Math.min(1, state.volume));

    if (isCombat) {
      this.ambienceGain.gain.setTargetAtTime(0, now, crossfadeTime);
      this.combatGain.gain.setTargetAtTime(targetVolume, now, crossfadeTime);

      if (this.activeCombatTrack !== targetUrl || !this.activeCombatEl) {
        if (this.activeCombatEl) {
          this.activeCombatEl.pause();
          this.activeCombatSource?.disconnect();
        }
        try {
          const audioEl = new Audio();
          audioEl.crossOrigin = 'anonymous';
          audioEl.src = targetUrl;
          audioEl.loop = true;
          if (fallbackUrl) {
            audioEl.onerror = () => {
              if (audioEl.src !== fallbackUrl) {
                audioEl.src = fallbackUrl;
                audioEl.play().catch(() => {});
              }
            };
          }
          const srcNode = ctx.createMediaElementSource(audioEl);
          srcNode.connect(this.combatGain);
          audioEl.play().catch(() => {});
          this.activeCombatEl = audioEl;
          this.activeCombatSource = srcNode;
          this.activeCombatTrack = targetUrl;
        } catch {
          // Ignored
        }
      } else if (this.activeCombatEl.paused) {
        this.activeCombatEl.play().catch(() => {});
      }
    } else {
      this.combatGain.gain.setTargetAtTime(0, now, crossfadeTime);
      this.ambienceGain.gain.setTargetAtTime(targetVolume, now, crossfadeTime);

      if (this.activeAmbienceTrack !== targetUrl || !this.activeAmbienceEl) {
        if (this.activeAmbienceEl) {
          this.activeAmbienceEl.pause();
          this.activeAmbienceSource?.disconnect();
        }
        try {
          const audioEl = new Audio();
          audioEl.crossOrigin = 'anonymous';
          audioEl.src = targetUrl;
          audioEl.loop = true;
          if (fallbackUrl) {
            audioEl.onerror = () => {
              if (audioEl.src !== fallbackUrl) {
                audioEl.src = fallbackUrl;
                audioEl.play().catch(() => {});
              }
            };
          }
          const srcNode = ctx.createMediaElementSource(audioEl);
          srcNode.connect(this.ambienceGain);
          audioEl.play().catch(() => {});
          this.activeAmbienceEl = audioEl;
          this.activeAmbienceSource = srcNode;
          this.activeAmbienceTrack = targetUrl;
        } catch {
          // Ignored
        }
      } else if (this.activeAmbienceEl.paused) {
        this.activeAmbienceEl.play().catch(() => {});
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GM ONE-SHOT SFX SOUNDBOARD (REAL AUDIO FILES)
  // ---------------------------------------------------------------------------

  public async playOneShotSfx(type: OneShotSfxType, volume = 1.0): Promise<void> {
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain || this.isMuted) return;

    const url = ONE_SHOT_SFX_URLS[type];
    if (!url) return;

    const clampedVol = Math.max(0, Math.min(1, volume));
    const buffer = await this.fetchAndDecodeAudioBuffer(url);

    if (buffer) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const sfxOut = ctx.createGain();
      // Soft 15ms envelope on start to prevent click
      sfxOut.gain.setValueAtTime(0.001, now);
      sfxOut.gain.linearRampToValueAtTime(clampedVol, now + 0.015);

      source.connect(sfxOut);
      sfxOut.connect(this.sfxGain);
      source.start(now);
      return;
    }

    // Fallback to HTMLAudioElement if decode fails
    try {
      const audio = new Audio(url);
      audio.volume = clampedVol;
      audio.play().catch(() => {});
    } catch {
      // Ignored
    }
  }
}

export const spatialAudio = new PositionalAudioManager();
