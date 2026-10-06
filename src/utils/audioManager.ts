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

interface ActiveSpatialNode {
  sourceId: string;
  bufferSource?: AudioBufferSourceNode;
  elementSource?: MediaElementAudioSourceNode;
  audioElement?: HTMLAudioElement;
  filterNode: BiquadFilterNode;
  pannerNode: StereoPannerNode;
  gainNode: GainNode;
  isPlaying: boolean;
  currentPreset: AmbientSoundPreset;
  currentUrl?: string;
}

export class PositionalAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private combatGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Active spatial sources map
  private spatialNodes: Map<string, ActiveSpatialNode> = new Map();

  // Cached procedural audio buffers for loops
  private proceduralBuffers: Map<string, AudioBuffer> = new Map();

  // Global music players
  private activeAmbienceSource: AudioBufferSourceNode | null = null;
  private activeCombatSource: AudioBufferSourceNode | null = null;
  private activeCustomMusicEl: HTMLAudioElement | null = null;
  private customMusicSource: MediaElementAudioSourceNode | null = null;

  private currentMusicState: GlobalMusicState = {
    currentTrack: 'none',
    isPlaying: false,
    volume: 0.5,
    isCombatMode: false,
  };

  public isMuted = false;
  private isUnlocked = false;

  constructor() {
    // Setup lazy unlock on first user interaction
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlockContext();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
  }

  public getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // Ambience sub-bus
        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        this.ambienceGain.connect(this.masterGain);

        // Combat sub-bus
        this.combatGain = this.ctx.createGain();
        this.combatGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.combatGain.connect(this.masterGain);

        // SFX sub-bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);
      }
    }
    return this.ctx;
  }

  public async unlockContext(): Promise<void> {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
        this.isUnlocked = true;
      } catch {
        // Ignored
      }
    }
  }

  public setMasterMute(muted: boolean): void {
    this.isMuted = muted;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.05);
  }

  public setMasterVolume(vol: number): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : clamped, ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------------------
  // PROCEDURAL AUDIO SYNTHESIS FOR SEAMLESS 100% OFFLINE LOOPS
  // ---------------------------------------------------------------------------

  private getProceduralBuffer(preset: AmbientSoundPreset | GlobalMusicTrack): AudioBuffer | null {
    const ctx = this.getContext();
    if (!ctx) return null;

    if (this.proceduralBuffers.has(preset)) {
      return this.proceduralBuffers.get(preset)!;
    }

    const duration = 4.0; // 4 seconds loop
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    switch (preset) {
      case 'campfire': {
        // Crackling fire + warm low-frequency rumble
        let lastLeft = 0;
        let lastRight = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          // Brownian low rumble
          const whiteL = Math.random() * 2 - 1;
          const whiteR = Math.random() * 2 - 1;
          lastLeft = (lastLeft + 0.02 * whiteL) / 1.02;
          lastRight = (lastRight + 0.02 * whiteR) / 1.02;

          // Random crackle sparks
          let spark = 0;
          if (Math.random() < 0.0035) {
            spark = (Math.random() * 2 - 1) * 0.9;
          }

          const baseHum = Math.sin(2 * Math.PI * 65 * t) * 0.05;
          left[i] = lastLeft * 0.6 + spark + baseHum;
          right[i] = lastRight * 0.6 + spark * 0.8 + baseHum;
        }
        break;
      }

      case 'water_stream': {
        // Rushing water / fountain (band-filtered white noise)
        let fL = 0;
        let fR = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const lfo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t);
          const noiseL = Math.random() * 2 - 1;
          const noiseR = Math.random() * 2 - 1;
          fL = fL * 0.92 + noiseL * 0.08;
          fR = fR * 0.92 + noiseR * 0.08;
          left[i] = fL * lfo * 0.7;
          right[i] = fR * lfo * 0.7;
        }
        break;
      }

      case 'dungeon_drone':
      case 'ambient_dungeon': {
        // Ominous sub-drone with resonant detuned harmonics
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const f0 = 55.0; // A1
          const drone1 = Math.sin(2 * Math.PI * f0 * t);
          const drone2 = Math.sin(2 * Math.PI * (f0 * 1.006) * t);
          const sub = Math.sin(2 * Math.PI * (f0 * 0.5) * t) * 0.5;
          const fifth = Math.sin(2 * Math.PI * (f0 * 1.5) * t + 0.3) * 0.2;
          const lfo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.15 * t);
          left[i] = (drone1 * 0.4 + sub + fifth) * lfo * 0.35;
          right[i] = (drone2 * 0.4 + sub + fifth) * lfo * 0.35;
        }
        break;
      }

      case 'tavern_crowd':
      case 'ambient_tavern': {
        // Warm tavern background murmur + occasional rhythmic clink
        let murmL = 0;
        let murmR = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const nL = Math.random() * 2 - 1;
          const nR = Math.random() * 2 - 1;
          murmL = murmL * 0.95 + nL * 0.05;
          murmR = murmR * 0.95 + nR * 0.05;

          const lfoVoice = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.2 * t);
          // Periodic clinking glass/mug
          let clink = 0;
          if (i % Math.floor(sampleRate * 1.3) < 40) {
            const clinkT = (i % Math.floor(sampleRate * 1.3)) / sampleRate;
            clink = Math.sin(2 * Math.PI * 2200 * clinkT) * Math.exp(-clinkT * 80) * 0.4;
          }

          left[i] = (murmL * lfoVoice * 0.5 + clink) * 0.6;
          right[i] = (murmR * lfoVoice * 0.5 + clink * 0.7) * 0.6;
        }
        break;
      }

      case 'wind_whisper':
      case 'ambient_forest': {
        // Whistling wind gusts & nocturnal whispering ambiance
        let windL = 0;
        let windR = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const nL = Math.random() * 2 - 1;
          const nR = Math.random() * 2 - 1;
          const lfoGust = 0.4 + 0.6 * Math.sin(2 * Math.PI * 0.25 * t);
          windL = windL * 0.96 + nL * 0.04;
          windR = windR * 0.96 + nR * 0.04;
          left[i] = windL * lfoGust * 0.7;
          right[i] = windR * lfoGust * 0.7;
        }
        break;
      }

      case 'arcane_hum': {
        // Magical shimmering resonance (phased sine chords)
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const chime1 = Math.sin(2 * Math.PI * 216 * t);
          const chime2 = Math.sin(2 * Math.PI * 324 * t);
          const chime3 = Math.sin(2 * Math.PI * 432 * t);
          const shimmer = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t);
          left[i] = (chime1 * 0.3 + chime2 * 0.2 + chime3 * 0.15) * shimmer * 0.45;
          right[i] = (chime1 * 0.2 + chime2 * 0.3 + chime3 * 0.15) * (1 - shimmer * 0.5) * 0.45;
        }
        break;
      }

      case 'ambient_rain': {
        // Steady rain patter
        let rainL = 0;
        let rainR = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const nL = Math.random() * 2 - 1;
          const nR = Math.random() * 2 - 1;
          rainL = rainL * 0.88 + nL * 0.12;
          rainR = rainR * 0.88 + nR * 0.12;
          const thunderT = (t % 3.0);
          const thunder = Math.sin(2 * Math.PI * 45 * thunderT) * Math.exp(-thunderT * 2) * 0.15;
          left[i] = rainL * 0.5 + thunder;
          right[i] = rainR * 0.5 + thunder;
        }
        break;
      }

      case 'combat_standard':
      case 'combat_epic': {
        // Driving rhythmic battle drums & pulse
        const bpm = preset === 'combat_epic' ? 140 : 120;
        const beatInterval = 60 / bpm;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const beatTime = t % beatInterval;
          // Heavy kick drum transient
          const drumPitch = 120 * Math.exp(-beatTime * 35);
          const drum = Math.sin(2 * Math.PI * drumPitch * beatTime) * Math.exp(-beatTime * 12);
          // Rhythmic metallic snare/shaker
          const isSnare = (Math.floor(t / beatInterval) % 2) === 1;
          const snare = isSnare ? (Math.random() * 2 - 1) * Math.exp(-beatTime * 20) * 0.4 : 0;
          // Sub-bass tension drone
          const sub = Math.sin(2 * Math.PI * 48 * t) * 0.2;
          left[i] = (drum * 0.6 + snare + sub) * 0.55;
          right[i] = (drum * 0.6 + snare * 0.8 + sub) * 0.55;
        }
        break;
      }

      default:
        // Soft generic ambient noise fallback
        for (let i = 0; i < length; i++) {
          left[i] = (Math.random() * 2 - 1) * 0.05;
          right[i] = (Math.random() * 2 - 1) * 0.05;
        }
        break;
    }

    this.proceduralBuffers.set(preset, buffer);
    return buffer;
  }

  // ---------------------------------------------------------------------------
  // POSITIONAL / 2D SPATIAL AUDIO NODE PIPELINE
  // ---------------------------------------------------------------------------

  /**
   * Updates or creates Web Audio nodes for spatial map audio sources:
   * [Source Node] -> [LowPass Filter] -> [Stereo Panner] -> [Gain Node] -> [Master Gain]
   */
  public updateSpatialSources(
    listener: Point,
    sources: PositionalAudioSource[],
    walls: WallSegment[]
  ): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    const activeSourceIds = new Set(sources.map((s) => s.id));

    // 1. Clean up removed sources
    for (const [id, node] of this.spatialNodes.entries()) {
      if (!activeSourceIds.has(id)) {
        try {
          if (node.bufferSource) {
            node.bufferSource.stop();
            node.bufferSource.disconnect();
          }
          if (node.audioElement) {
            node.audioElement.pause();
          }
          node.gainNode.disconnect();
          node.pannerNode.disconnect();
          node.filterNode.disconnect();
        } catch {
          // Ignored
        }
        this.spatialNodes.delete(id);
      }
    }

    // 2. Update or create active sources
    for (const source of sources) {
      if (!source.isPlaying) {
        // Mute or pause if isPlaying is false
        const existing = this.spatialNodes.get(source.id);
        if (existing) {
          existing.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        }
        continue;
      }

      let node = this.spatialNodes.get(source.id);

      // Recreate node if preset or custom url changed
      if (node && (node.currentPreset !== source.preset || node.currentUrl !== source.url)) {
        try {
          if (node.bufferSource) node.bufferSource.stop();
          if (node.audioElement) node.audioElement.pause();
          node.gainNode.disconnect();
        } catch {
          // Ignored
        }
        this.spatialNodes.delete(source.id);
        node = undefined;
      }

      if (!node) {
        // Setup new spatial node chain
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(22000, ctx.currentTime);
        filterNode.Q.setValueAtTime(1.0, ctx.currentTime);

        const pannerNode = ctx.createStereoPanner();
        pannerNode.pan.setValueAtTime(0, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, ctx.currentTime);

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
          currentPreset: source.preset,
          currentUrl: source.url,
        };

        if (source.preset === 'custom' && source.url) {
          // Use HTMLAudioElement for custom audio URL
          try {
            const audioEl = new Audio(source.url);
            audioEl.crossOrigin = 'anonymous';
            audioEl.loop = true;
            const elSource = ctx.createMediaElementSource(audioEl);
            elSource.connect(filterNode);
            audioEl.play().catch(() => {});
            node.audioElement = audioEl;
            node.elementSource = elSource;
          } catch {
            // Fallback to procedural
            const buf = this.getProceduralBuffer('campfire');
            if (buf) {
              const bufSource = ctx.createBufferSource();
              bufSource.buffer = buf;
              bufSource.loop = true;
              bufSource.connect(filterNode);
              bufSource.start();
              node.bufferSource = bufSource;
            }
          }
        } else {
          // Use procedural buffer source
          const buf = this.getProceduralBuffer(source.preset);
          if (buf) {
            const bufSource = ctx.createBufferSource();
            bufSource.buffer = buf;
            bufSource.loop = true;
            bufSource.connect(filterNode);
            bufSource.start();
            node.bufferSource = bufSource;
          }
        }

        this.spatialNodes.set(source.id, node);
      }

      // 3. Real-time Acoustic Raycast Calculation (Stereo Pan, Distance Attenuation, Wall Occlusion)
      const acoustics = calculateSpatialAudio(listener, source, walls);

      const now = ctx.currentTime;
      const smoothTime = 0.08; // 80ms gentle linear/exponential ramp to prevent clicks

      // Smooth cutoff frequency: 22000Hz (open) -> 1000Hz (1 wall) -> 450Hz (2 walls) -> 280Hz (3+ walls)
      node.filterNode.frequency.setTargetAtTime(acoustics.cutoffFrequency, now, smoothTime);

      // Smooth stereo panning: -1 (left) to +1 (right)
      node.pannerNode.pan.setTargetAtTime(acoustics.pan, now, smoothTime);

      // Smooth gain: distance attenuation * wall occlusion factor * source volume
      const targetGain = this.isMuted ? 0 : acoustics.finalGain;
      node.gainNode.gain.setTargetAtTime(targetGain, now, smoothTime);
    }
  }

  // ---------------------------------------------------------------------------
  // GLOBAL BACKGROUND AMBIENCE & COMBAT MUSIC WITH SMOOTH CROSSFADE
  // ---------------------------------------------------------------------------

  public updateGlobalMusic(state: GlobalMusicState): void {
    const ctx = this.getContext();
    if (!ctx || !this.ambienceGain || !this.combatGain) return;

    this.currentMusicState = state;
    const now = ctx.currentTime;
    const crossfadeTime = 1.2; // 1.2s crossfade between ambient & combat

    if (!state.isPlaying || state.currentTrack === 'none') {
      this.ambienceGain.gain.setTargetAtTime(0, now, 0.3);
      this.combatGain.gain.setTargetAtTime(0, now, 0.3);
      return;
    }

    const isCombat = state.isCombatMode || state.currentTrack.startsWith('combat_');
    const targetVolume = this.isMuted ? 0 : Math.max(0, Math.min(1, state.volume));

    if (isCombat) {
      // Fade out ambience, fade in combat music
      this.ambienceGain.gain.setTargetAtTime(0, now, crossfadeTime);
      this.combatGain.gain.setTargetAtTime(targetVolume, now, crossfadeTime);

      if (!this.activeCombatSource) {
        const buf = this.getProceduralBuffer(state.currentTrack);
        if (buf) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(this.combatGain);
          src.start();
          this.activeCombatSource = src;
        }
      }
    } else {
      // Fade out combat, fade in ambient music
      this.combatGain.gain.setTargetAtTime(0, now, crossfadeTime);
      this.ambienceGain.gain.setTargetAtTime(targetVolume, now, crossfadeTime);

      if (!this.activeAmbienceSource) {
        const buf = this.getProceduralBuffer(state.currentTrack);
        if (buf) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(this.ambienceGain);
          src.start();
          this.activeAmbienceSource = src;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GM ONE-SHOT SFX SOUNDBOARD (PROCEDURAL WEB AUDIO SYNTHESIS)
  // ---------------------------------------------------------------------------

  public playOneShotSfx(type: OneShotSfxType, volume = 1.0): void {
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain || this.isMuted) return;

    const now = ctx.currentTime;
    const sfxOut = ctx.createGain();
    sfxOut.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), now);
    sfxOut.connect(this.sfxGain);

    switch (type) {
      case 'sword_clash': {
        // Metallic ringing clash + noise scraping transient
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);

        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc.connect(oscGain);
        oscGain.connect(sfxOut);
        osc.start(now);
        osc.stop(now + 0.4);

        // Clang impact
        const clang = ctx.createOscillator();
        clang.type = 'sine';
        clang.frequency.setValueAtTime(3200, now);
        clang.frequency.exponentialRampToValueAtTime(1400, now + 0.15);
        const clangGain = ctx.createGain();
        clangGain.gain.setValueAtTime(0.5, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        clang.connect(clangGain);
        clangGain.connect(sfxOut);
        clang.start(now);
        clang.stop(now + 0.22);
        break;
      }

      case 'fireball': {
        // Roaring white-noise whoosh + low-frequency explosive blast
        const len = Math.floor(ctx.sampleRate * 0.85);
        const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(120, now + 0.8);

        const boomGain = ctx.createGain();
        boomGain.gain.setValueAtTime(0.9, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        noise.connect(filter);
        filter.connect(boomGain);
        boomGain.connect(sfxOut);
        noise.start(now);
        noise.stop(now + 0.85);

        // Low sub-bass thud
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, now);
        sub.frequency.exponentialRampToValueAtTime(35, now + 0.6);
        const subG = ctx.createGain();
        subG.gain.setValueAtTime(0.8, now);
        subG.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        sub.connect(subG);
        subG.connect(sfxOut);
        sub.start(now);
        sub.stop(now + 0.65);
        break;
      }

      case 'door_creak': {
        // Slow creaking wooden friction pitch sweep
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.25);
        osc.frequency.linearRampToValueAtTime(190, now + 0.55);

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, now);
        filter.Q.setValueAtTime(4.0, now);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(filter);
        filter.connect(g);
        g.connect(sfxOut);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }

      case 'monster_roar': {
        // Guttural pitch-dropped roar
        const roar = ctx.createOscillator();
        roar.type = 'sawtooth';
        roar.frequency.setValueAtTime(140, now);
        roar.frequency.exponentialRampToValueAtTime(50, now + 0.7);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(180, now + 0.7);

        const roarG = ctx.createGain();
        roarG.gain.setValueAtTime(0.8, now);
        roarG.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

        roar.connect(filter);
        filter.connect(roarG);
        roarG.connect(sfxOut);
        roar.start(now);
        roar.stop(now + 0.75);
        break;
      }

      case 'bow_shot': {
        // Bowstring twang + arrow release whoosh
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
        const oscG = ctx.createGain();
        oscG.gain.setValueAtTime(0.6, now);
        oscG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(oscG);
        oscG.connect(sfxOut);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }

      case 'heal_spell': {
        // Harmonic ascending healing chime
        const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + idx * 0.06);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, now + idx * 0.06);
          g.gain.linearRampToValueAtTime(0.4, now + idx * 0.06 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.45);
          osc.connect(g);
          g.connect(sfxOut);
          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.48);
        });
        break;
      }

      case 'magic_teleport': {
        // Sweeping dimensional whoosh
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.25);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.55);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(g);
        g.connect(sfxOut);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }

      case 'thunderclap': {
        // Electric crack followed by decaying thunder rumble
        const crack = ctx.createOscillator();
        crack.type = 'square';
        crack.frequency.setValueAtTime(800, now);
        crack.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        const crackG = ctx.createGain();
        crackG.gain.setValueAtTime(0.8, now);
        crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        crack.connect(crackG);
        crackG.connect(sfxOut);
        crack.start(now);
        crack.stop(now + 0.12);

        // Low rolling rumble
        const sub = ctx.createOscillator();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(70, now + 0.05);
        sub.frequency.exponentialRampToValueAtTime(30, now + 0.9);
        const subG = ctx.createGain();
        subG.gain.setValueAtTime(0.7, now + 0.05);
        subG.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
        sub.connect(subG);
        subG.connect(sfxOut);
        sub.start(now + 0.05);
        sub.stop(now + 1.0);
        break;
      }
    }
  }
}

export const spatialAudio = new PositionalAudioManager();
