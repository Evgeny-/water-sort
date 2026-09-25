/**
 * Synthesised SFX built around how water sounds: liquid noise is mostly
 * bubbles, and every bubble rings as a short decaying sine whose pitch slides
 * up as it rises (Minnaert / van den Doel). A pour is a run of low "glugs" —
 * air entering the bottle we pour from — drifting lower as that bottle
 * empties. Picking a bottle is a single bubble "plip". The level-complete
 * fanfare and star chimes are ported as-is from the game.
 */

/** overall effects volume: gentle by default */
const MASTER = 0.7;

class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem("wsl-muted") === "1";
    } catch {
      /* storage unavailable */
    }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : MASTER;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.out.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.out) this.out.gain.value = m ? 0 : MASTER;
    try {
      localStorage.setItem("wsl-muted", m ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  private ready() {
    return this.ctx && this.out && !this.muted ? this.ctx : null;
  }

  private noise(t: number, dur: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.start(t, Math.random() * 1.2, dur + 0.05);
    return src;
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, attack = 0.004) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private bell(f: number, t: number, vol: number, len = 0.9) {
    this.tone("sine", f, f, t, len, vol, 0.003);
    this.tone("sine", f * 2.42, f * 2.42, t, len * 0.55, vol * 0.3, 0.002);
  }

  private click(t: number, freq: number, vol: number, dur = 0.018) {
    const ctx = this.ctx!;
    const n = this.noise(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    n.connect(bp).connect(g).connect(this.out!);
  }

  /** A single bubble "plip" when a bottle is picked; fuller bottles sound higher. */
  tap(fill = 0.5) {
    const ctx = this.ready();
    if (!ctx) return;
    const k = Math.min(1, Math.max(0, fill));
    const f = (820 + 420 * k) * (0.97 + Math.random() * 0.06);
    this.tone("sine", f, f * 1.7, ctx.currentTime, 0.07, 0.07, 0.003);
  }

  ui() {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone("sine", 480, 720, ctx.currentTime, 0.06, 0.05, 0.003);
  }

  /**
   * Tonal "glugs": air entering the bottle we pour from. Each glug is a short
   * bubble chirp; the pitch drifts down as the source bottle empties (more air
   * inside, lower Helmholtz resonance).
   */
  private glugs(t: number, dur: number, f0: number, f1: number, vol: number, rate: number, dest: AudioNode) {
    const ctx = this.ctx!;
    let tt = t + 0.02;
    let i = 0;
    while (tt < t + dur) {
      const k = (tt - t) / dur;
      const f = (f0 + (f1 - f0) * k) * (0.94 + Math.random() * 0.12);
      const v = vol * (i === 0 ? 1.15 : 0.8 + Math.random() * 0.35);
      for (const [mul, gainMul, len] of [
        [1, 1, 0.085],
        [2.03, 0.22, 0.05],
      ] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(f * mul, tt);
        o.frequency.exponentialRampToValueAtTime(f * mul * 1.38, tt + len);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(v * gainMul, tt + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0005, tt + len);
        o.connect(g).connect(dest);
        o.start(tt);
        o.stop(tt + len + 0.02);
      }
      tt += (1 / rate) * (0.8 + Math.random() * 0.4);
      i++;
    }
  }

  /**
   * Low, soft glugs for a pour of `dur` seconds that starts on screen in
   * `delay` seconds. The device's output latency (tens of ms on speakers, often
   * 0.15–0.3 s on Bluetooth headphones) is taken off, so it lands in sync.
   */
  pour(dur: number, delay = 0.2) {
    const ctx = this.ready();
    if (!ctx) return;
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const t = ctx.currentTime + Math.max(0, delay - latency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    lp.frequency.value = 900;
    lp.connect(this.out!);
    this.glugs(t, dur, 290, 220, 0.09, 7, lp);
  }

  invalid() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone("sine", 240, 150, t, 0.09, 0.1, 0.003);
    this.tone("sine", 200, 130, t + 0.1, 0.1, 0.08, 0.003);
  }

  /** Cork pop + glass bell. */
  complete() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone("sine", 620, 170, t, 0.08, 0.15, 0.002);
    this.click(t, 2400, 0.07, 0.025);
    this.bell(1046.5, t + 0.07, 0.06, 1.0);
    this.bell(1568, t + 0.16, 0.04, 0.8);
  }

  unlock2() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.click(t, 3200, 0.09, 0.02);
    this.click(t + 0.07, 2600, 0.08, 0.025);
    this.bell(1318.5, t + 0.12, 0.045, 0.6);
    this.bell(1760, t + 0.2, 0.04, 0.7);
  }

  order() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bell(1318.5, t, 0.055, 0.8);
    this.bell(1760, t + 0.09, 0.05, 1.0);
  }

  undo() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noise(t, 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.2);
    n.connect(bp).connect(g).connect(this.out!);
  }

  /** Level-complete fanfare — ported from the game (src/audio/sounds.ts: playLevelComplete). */
  win() {
    const ctx = this.ready();
    if (!ctx) return;
    const dest = this.out!;
    const t = ctx.currentTime;
    const arp = [261.63, 329.63, 392.0, 523.25];
    arp.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const start = t + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(dest);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    const chord = [261.63, 329.63, 392.0, 523.25];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1.5) * 4;
      const gain = ctx.createGain();
      const start = t + 0.32;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.15);
      gain.gain.setValueAtTime(0.1, start + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.5);
      osc.connect(gain).connect(dest);
      osc.start(start);
      osc.stop(start + 1.5);
    });
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.05, t + 0.05);
    ng.gain.setValueAtTime(0.05, t + 0.15);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(hp).connect(ng).connect(dest);
    noise.start(t);
    noise.stop(t + 0.6);
  }

  /** Star chime — ported from the game (playStar). */
  star(index: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const pitches = [523.25, 659.25, 783.99];
    const freq = pitches[index] ?? 523.25;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = 5;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(this.out!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }
}

export const sfx = new Sfx();

export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
