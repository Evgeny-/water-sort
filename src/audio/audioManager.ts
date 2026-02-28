import * as sounds from "./sounds";

type Listener = () => void;

class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private listeners = new Set<Listener>();

  private _sfxMuted: boolean;

  // Pre-decoded audio buffer for button click
  private clickBuffer: AudioBuffer | null = null;
  private buffersLoaded = false;
  private contextReady = false;

  constructor() {
    // Default: off. Users opt in.
    this._sfxMuted = true;
    try {
      const sfx = localStorage.getItem("water-sort-sfx-muted");
      if (sfx !== null) this._sfxMuted = sfx === "true";
    } catch {
      // localStorage unavailable
    }
  }

  /**
   * Initialize or resume AudioContext.
   * Only creates the context when called — this must happen inside a user
   * gesture (click / touchstart) to satisfy Chrome & iOS autoplay policy.
   */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._sfxMuted ? 0 : 1;
      this.sfxGain.connect(this.ctx.destination);

      this.loadBuffers();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.contextReady = true;
    return this.ctx;
  }

  /** Load audio files and decode into AudioBuffers */
  private async loadBuffers() {
    if (this.buffersLoaded || !this.ctx) return;
    this.buffersLoaded = true;
    const ctx = this.ctx;

    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}audio/click.wav`);
      const arrayBuf = await res.arrayBuffer();
      this.clickBuffer = await ctx.decodeAudioData(arrayBuf);
    } catch {
      // click.wav unavailable — will fall back to synthesized
    }
  }

  /** Play a pre-decoded buffer through a destination node */
  private playBuffer(
    buffer: AudioBuffer | null,
    dest: AudioNode,
    options?: { volume?: number },
  ): AudioBufferSourceNode | null {
    if (!buffer || !this.ctx) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = options?.volume ?? 1;
    source.connect(gain).connect(dest);
    source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    return source;
  }

  // --- Mute state (useSyncExternalStore compatible) ---

  getSfxMuted = (): boolean => this._sfxMuted;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  setSfxMuted(m: boolean) {
    this._sfxMuted = m;
    if (this.sfxGain) {
      this.sfxGain.gain.value = m ? 0 : 1;
    }
    try {
      localStorage.setItem("water-sort-sfx-muted", String(m));
    } catch {
      // localStorage unavailable
    }
    this.notify();
  }

  toggleSfxMute(): boolean {
    const next = !this._sfxMuted;
    this.setSfxMuted(next);
    return next;
  }

  // --- SFX ---
  // All play methods guard on contextReady so they're silent before first gesture.

  playTap() {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playTap(ctx, this.sfxGain);
  }

  playPour(durationMs: number) {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playPour(ctx, this.sfxGain, durationMs);
  }

  playInvalid() {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playInvalid(ctx, this.sfxGain);
  }

  playTubeComplete() {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playTubeComplete(ctx, this.sfxGain);
  }

  playLevelComplete() {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playLevelComplete(ctx, this.sfxGain);
  }

  playStar(index: number) {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playStar(ctx, this.sfxGain, index);
  }

  playUndo() {
    if (!this.contextReady) return;
    const ctx = this.ensureContext();
    if (this.sfxGain) sounds.playUndo(ctx, this.sfxGain);
  }

  playButtonClick() {
    if (!this.contextReady) return;
    this.ensureContext();
    if (this.clickBuffer && this.sfxGain) {
      this.playBuffer(this.clickBuffer, this.sfxGain, { volume: 0.4 });
    } else if (this.sfxGain && this.ctx) {
      sounds.playButtonClick(this.ctx, this.sfxGain);
    }
  }
}

export const audioManager = new AudioManager();
