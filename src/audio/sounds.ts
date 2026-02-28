/**
 * Web Audio API sound synthesis functions.
 * Each function creates transient oscillator/noise nodes that auto-disconnect after playing.
 */

/** Minimal UI tick — very short filtered noise click, like a soft finger tap */
export function playTap(ctx: AudioContext, dest: AudioNode) {
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.025), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2500;
  bp.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
  noise.connect(bp).connect(gain).connect(dest);
  noise.start(t);
  noise.stop(t + 0.025);
  noise.onended = () => { noise.disconnect(); bp.disconnect(); gain.disconnect(); };
}

/** Cartoonish "bloop-bloop" pour — bouncy descending blobs */
export function playPour(ctx: AudioContext, dest: AudioNode, durationMs: number) {
  const t = ctx.currentTime;
  const duration = Math.min(durationMs / 1000, 1.0);

  // Rapid sequence of short "bloop" notes descending in pitch
  const bloopCount = Math.max(3, Math.round(duration * 10));
  const interval = duration / bloopCount;

  for (let i = 0; i < bloopCount; i++) {
    const bTime = t + i * interval;
    // Descend from high to low — like liquid filling up
    const freq = 600 - (i / bloopCount) * 300;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Each bloop drops in pitch quickly for a bubbly cartoon feel
    osc.frequency.setValueAtTime(freq, bTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, bTime + interval * 0.7);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, bTime);
    gain.gain.linearRampToValueAtTime(0.1, bTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, bTime + interval * 0.85);

    osc.connect(gain).connect(dest);
    osc.start(bTime);
    osc.stop(bTime + interval + 0.01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}

/** Two quick low-frequency square wave pulses — "buzz-buzz" error */
export function playInvalid(ctx: AudioContext, dest: AudioNode) {
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 150;
    const start = ctx.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0.08, start);
    gain.gain.setValueAtTime(0, start + 0.06);
    osc.connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + 0.06);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}

/** Ascending 3-note arpeggio (C5-E5-G5) — satisfying chime */
export function playTubeComplete(ctx: AudioContext, dest: AudioNode) {
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + 0.25);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  });
}

/** Bright ascending fanfare — level complete celebration */
export function playLevelComplete(ctx: AudioContext, dest: AudioNode) {
  const t = ctx.currentTime;

  // Quick ascending arpeggio: C4 → E4 → G4 → C5 (staggered for excitement)
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
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  });

  // Sustained major chord after arpeggio for warmth
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
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  });

  // Shimmer burst
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
  noise.onended = () => { noise.disconnect(); hp.disconnect(); ng.disconnect(); };
}

/** Single tone at ascending pitch per star index — star chime */
export function playStar(ctx: AudioContext, dest: AudioNode, index: number) {
  const pitches = [523.25, 659.25, 783.99]; // C5, E5, G5
  const freq = pitches[index] ?? 523.25;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Slight detune for warmth
  osc.detune.value = 5;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.connect(gain).connect(dest);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}

/** Descending pitch sweep — "rewind" feel */
export function playUndo(ctx: AudioContext, dest: AudioNode) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain).connect(dest);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}

/** Short noise burst — subtle "tick" */
export function playButtonClick(ctx: AudioContext, dest: AudioNode) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
  noise.connect(hp).connect(gain).connect(dest);
  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 0.04);
  noise.onended = () => { noise.disconnect(); hp.disconnect(); gain.disconnect(); };
}

