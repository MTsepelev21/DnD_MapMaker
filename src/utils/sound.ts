// Real audio file playback for tactile tabletop interactions (no procedural oscillators/noise)

const INTERACTION_SOUND_URLS = {
  step: 'https://actions.google.com/sounds/v1/cartoon/pop.ogg',
  doorOpen: 'https://actions.google.com/sounds/v1/doors/wood_door_open.ogg',
  doorClose: 'https://actions.google.com/sounds/v1/doors/creaking_wooden_door.ogg',
  wallBuild: 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg',
  ping: 'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg',
  diceRoll: 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg',
} as const;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();
  public enabled = true;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    const ctx = this.getContext();
    if (!ctx) return null;

    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!;
    }

    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }

    const promise = (async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        this.bufferCache.set(url, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(url);
      }
    })();

    this.loadingPromises.set(url, promise);
    return promise;
  }

  private async playSoundUrl(url: string, volume = 0.25): Promise<void> {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const buffer = await this.loadBuffer(url);
    if (buffer) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      // Soft fade-in to avoid clicks
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.012);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      return;
    }

    try {
      const audio = new Audio(url);
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch {
      // Ignored
    }
  }

  playStep() {
    void this.playSoundUrl(INTERACTION_SOUND_URLS.step, 0.2);
  }

  playDoorToggle(isOpen: boolean) {
    void this.playSoundUrl(
      isOpen ? INTERACTION_SOUND_URLS.doorOpen : INTERACTION_SOUND_URLS.doorClose,
      0.35
    );
  }

  playWallBuild() {
    void this.playSoundUrl(INTERACTION_SOUND_URLS.wallBuild, 0.25);
  }

  playPing() {
    void this.playSoundUrl(INTERACTION_SOUND_URLS.ping, 0.3);
  }

  playDiceRoll() {
    void this.playSoundUrl(INTERACTION_SOUND_URLS.diceRoll, 0.4);
  }
}

export const soundFX = new SoundEngine();
