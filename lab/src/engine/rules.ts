import type { Color, LevelDef, Mode, Move, OrderSlot, PourResult, State, Vessel } from "./types";

export function cloneVessel(v: Vessel): Vessel {
  return { ...v, layers: v.layers.slice(), hidden: v.hidden.slice() };
}

/** Index of the layer a vessel pours from: top for normal vessels, bottom for valves. */
export function accessIndex(v: Vessel): number {
  return v.kind === "valve" ? 0 : v.layers.length - 1;
}

/** The accessible end of a vessel is always visible. Returns revealed layer indices. */
function revealAccessible(v: Vessel): number[] {
  if (v.layers.length === 0) return [];
  const i = accessIndex(v);
  if (v.hidden[i]) {
    v.hidden[i] = false;
    return [i];
  }
  return [];
}

export function initialState(level: LevelDef): State {
  const vessels = level.vessels.map(cloneVessel);
  for (const v of vessels) revealAccessible(v);
  const slots: (OrderSlot | null)[] = [];
  let qi = 0;
  if (level.mode === "orders") {
    for (let s = 0; s < level.slots; s++) {
      const o = level.queue[qi];
      slots.push(o ? { ...o, fill: 0 } : null);
      if (o) qi++;
    }
  }
  return { vessels, slots, qi };
}

/** Colour and length of the run that would be poured out (stops at hidden layers). */
export function sourceRun(v: Vessel): { color: Color; count: number } | null {
  const n = v.layers.length;
  if (n === 0) return null;
  if (v.kind === "valve") {
    const c = v.layers[0]!;
    let k = 1;
    while (k < n && v.layers[k] === c && !v.hidden[k]) k++;
    return { color: c, count: k };
  }
  const c = v.layers[n - 1]!;
  let k = 1;
  while (k < n && v.layers[n - 1 - k] === c && !v.hidden[n - 1 - k]) k++;
  return { color: c, count: k };
}

export function isComplete(v: Vessel): boolean {
  if (v.kind === "flask") return false;
  if (v.layers.length !== v.cap) return false;
  const c = v.layers[0];
  for (let i = 0; i < v.layers.length; i++) {
    if (v.hidden[i] || v.layers[i] !== c) return false;
  }
  return true;
}

export function isMonochrome(v: Vessel): boolean {
  const c = v.layers[0];
  for (let i = 0; i < v.layers.length; i++) if (v.hidden[i] || v.layers[i] !== c) return false;
  return true;
}

/** Why a vessel cannot be the source of a pour (null = it can). */
export function sourceBlock(state: State, mode: Mode, from: number): string | null {
  const src = state.vessels[from];
  if (!src) return "none";
  if (src.lock !== null) return "locked";
  if (src.kind === "jar") return "jar";
  if (src.layers.length === 0) return "empty";
  if (mode === "sort" && isComplete(src)) return "complete";
  return null;
}

export function canPour(state: State, mode: Mode, from: number, to: number): boolean {
  const n = state.vessels.length;
  if (from === to) return false;
  if (sourceBlock(state, mode, from) !== null) return false;
  const run = sourceRun(state.vessels[from]!)!;
  if (to >= n) {
    const slot = state.slots[to - n];
    return !!slot && slot.color === run.color && slot.fill < slot.cap;
  }
  const dst = state.vessels[to];
  if (!dst || dst.lock !== null) return false;
  if (dst.layers.length >= dst.cap) return false;
  if (dst.kind === "jar") return dst.accept === null || dst.accept === run.color;
  if (dst.layers.length === 0) return true;
  return dst.layers[dst.layers.length - 1] === run.color;
}

export function applyPour(state: State, level: LevelDef, from: number, to: number): PourResult {
  const n = state.vessels.length;
  const vessels = state.vessels.slice();
  const src = cloneVessel(vessels[from]!);
  vessels[from] = src;
  const run = sourceRun(src)!;
  let slots = state.slots;
  let qi = state.qi;
  let amount: number;
  let orderDone = -1;
  const completed: number[] = [];
  const unlocked: number[] = [];

  if (to >= n) {
    slots = state.slots.slice();
    const s = { ...slots[to - n]! };
    amount = Math.min(run.count, s.cap - s.fill);
    s.fill += amount;
    if (s.fill >= s.cap) {
      orderDone = to - n;
      const next = level.queue[qi];
      slots[to - n] = next ? { ...next, fill: 0 } : null;
      if (next) qi++;
    } else {
      slots[to - n] = s;
    }
  } else {
    const dst = cloneVessel(vessels[to]!);
    vessels[to] = dst;
    amount = Math.min(run.count, dst.cap - dst.layers.length);
    for (let i = 0; i < amount; i++) {
      dst.layers.push(run.color);
      dst.hidden.push(false);
    }
    if (dst.kind === "jar" && dst.accept === null) dst.accept = run.color;
    // in orders mode bottles are just storage: nothing "completes"
    if (level.mode === "sort" && isComplete(dst)) completed.push(to);
  }

  if (src.kind === "valve") {
    src.layers.splice(0, amount);
    src.hidden.splice(0, amount);
  } else {
    src.layers.length -= amount;
    src.hidden.length -= amount;
  }
  const revealed = revealAccessible(src);

  const keys: Color[] = completed.map((i) => vessels[i]!.layers[0]!);
  if (orderDone >= 0) keys.push(run.color);
  for (const key of keys) {
    for (let i = 0; i < vessels.length; i++) {
      if (vessels[i]!.lock === key) {
        vessels[i] = { ...cloneVessel(vessels[i]!), lock: null };
        unlocked.push(i);
      }
    }
  }

  return {
    state: { vessels, slots, qi },
    color: run.color,
    amount,
    completed,
    unlocked,
    revealed,
    orderDone,
  };
}

export function isWin(state: State, mode: Mode): boolean {
  if (mode === "orders") {
    return state.slots.every((s) => s === null) && state.vessels.every((v) => v.layers.length === 0);
  }
  return state.vessels.every((v) => v.layers.length === 0 || isComplete(v));
}

export function validMoves(state: State, mode: Mode): Move[] {
  const out: Move[] = [];
  const total = state.vessels.length + state.slots.length;
  for (let from = 0; from < state.vessels.length; from++) {
    if (sourceBlock(state, mode, from) !== null) continue;
    for (let to = 0; to < total; to++) {
      if (canPour(state, mode, from, to)) out.push({ from, to });
    }
  }
  return out;
}

function vesselKey(v: Vessel): string {
  let s = v.kind[0]! + v.cap + (v.accept ?? "x") + (v.lock ?? "x") + ":";
  for (let i = 0; i < v.layers.length; i++) {
    s += String.fromCharCode(97 + v.layers[i]! + (v.hidden[i] ? 26 : 0));
  }
  return s;
}

/** Canonical hash: interchangeable vessels are sorted, order slots too. */
export function hashState(state: State): string {
  const keys = state.vessels.map(vesselKey).sort();
  let h = keys.join("|");
  if (state.slots.length) {
    const sl = state.slots.map((s) => (s ? `${s.color}.${s.fill}.${s.cap}` : "-")).sort();
    h += "#" + state.qi + ":" + sl.join(",");
  }
  return h;
}

/** Count of units per colour across vessels (+ pending orders), used for sanity checks. */
export function colorCounts(level: LevelDef): Map<Color, number> {
  const m = new Map<Color, number>();
  for (const v of level.vessels) for (const c of v.layers) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}
