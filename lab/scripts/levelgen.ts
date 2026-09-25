/**
 * Shared level-search helpers for the campaign and free-mode builders.
 *
 * Difficulty = planning effort: a depth-first search that tries natural moves
 * first and backtracks out of dead ends (a player with undo). D = log2(positions
 * explored / solution length) / 6, so 1× = 0, 8× = 0.5, 64× = 1.
 * Random layouts are almost always easy by this measure, so for harder targets
 * we "harden" a layout: swap single portions between bottles and keep swaps
 * that raise the effort while the level stays solvable.
 */
import { generate, mechanicsOf, shuffle, type Recipe } from "../src/engine/generate";
import { initialState } from "../src/engine/rules";
import { casualRate, effortDifficulty, mulberry32, solveBeam, solveBfs, type Rng } from "../src/engine/solver";
import type { LevelDef } from "../src/engine/types";

export const TIER_NAMES = ["лёгкий", "средний", "сложный", "очень сложный"];

export type Mech = "hidden" | "flask" | "jar" | "locks" | "valve" | "orders";

/** Recipe for a mechanic mix at a given size. p = 0..1 intensity. */
export function recipeFor(mech: Mech[], colors: number, tpc: number, empty: number, p: number): Recipe {
  const r: Recipe = { colors, tpc, empty };
  if (mech.includes("hidden")) r.hidden = 0.35 + 0.35 * p;
  if (mech.includes("flask")) {
    r.flasks = empty >= 2 ? 1 : 2;
    r.empty = Math.max(0, empty - 1);
  }
  if (mech.includes("jar")) {
    r.jars = 1;
    r.jarAny = p > 0.3;
    r.empty = Math.max(0, (r.empty ?? empty) - 1);
  }
  if (mech.includes("locks")) r.locks = p < 0.3 ? ["empty"] : p < 0.8 ? ["filled", "empty"] : ["filled", "filled", "empty"];
  if (mech.includes("valve")) r.valves = 1 + Math.round(p * 2);
  if (mech.includes("orders")) {
    r.mode = "orders";
    r.tpc = 1;
    r.slots = p > 0.6 ? 1 : 2;
    r.orderCaps = p > 0.25 ? [2, 4] : [4];
    r.empty = Math.max(0, empty - 1);
    delete r.jars;
    delete r.flasks;
  }
  return r;
}

export interface Candidate {
  level: LevelDef;
  d: number;
}

function toLevel(id: string, g: ReturnType<typeof generate>): LevelDef {
  return {
    id,
    pack: "",
    name: id,
    mode: g.mode,
    vessels: g.vessels,
    slots: g.slots,
    queue: g.queue,
    par: 0,
    stats: { casual: 0, states: 0, exact: false },
    mechanics: mechanicsOf(g),
  };
}

const clone = (l: LevelDef): LevelDef => JSON.parse(JSON.stringify(l)) as LevelDef;

/** Effort difficulty; -1 when the level turns out unsolvable (or can't be proven solvable). */
function evaluate(l: LevelDef, rng: Rng, runs: number, cap = 6000): number {
  const s0 = initialState(l);
  const e = effortDifficulty(l, s0, runs, rng, cap);
  if (e.ratio >= 64) {
    const bfs = solveBfs(l, s0, 60_000);
    if (!bfs.solvable) return -1;
  }
  return e.d;
}

/** Tier label from measured difficulty (honest labels, whatever the plan was). */
export function tierOf(d: number): number {
  return d < 0.14 ? 0 : d < 0.27 ? 1 : d < 0.4 ? 2 : 3;
}

/** One small change: swap two portions between bottles (or two orders in the queue). */
function mutate(src: LevelDef, rng: Rng): LevelDef | null {
  const l = clone(src);
  if (l.mode === "orders" && l.queue.length > 2 && rng() < 0.3) {
    const i = Math.floor(rng() * l.queue.length);
    const j = Math.floor(rng() * l.queue.length);
    if (i === j || l.queue[i]!.color === l.queue[j]!.color) return null;
    [l.queue[i], l.queue[j]] = [l.queue[j]!, l.queue[i]!];
    return l;
  }
  const filled = l.vessels.map((v, i) => (v.layers.length && v.kind !== "jar" ? i : -1)).filter((i) => i >= 0);
  if (filled.length < 2) return null;
  const a = l.vessels[filled[Math.floor(rng() * filled.length)]!]!;
  const b = l.vessels[filled[Math.floor(rng() * filled.length)]!]!;
  if (a === b) return null;
  const pa = Math.floor(rng() * a.layers.length);
  const pb = Math.floor(rng() * b.layers.length);
  if (a.layers[pa] === b.layers[pb]) return null;
  [a.layers[pa], b.layers[pb]] = [b.layers[pb]!, a.layers[pa]!];
  for (const v of [a, b]) {
    if (v.layers.length === v.cap && v.layers.every((c) => c === v.layers[0])) return null;
    if (v.lock !== null && v.layers.includes(v.lock) && v.layers.filter((c) => c === v.lock).length >= 4) return null;
  }
  return l;
}

/** Anneal the effort towards the target (occasionally accepting a step back), keeping the level solvable. */
function harden(start: Candidate, target: number, rng: Rng, iters: number): Candidate {
  let cur = start;
  let best = start;
  let temp = 0.06;
  for (let i = 0; i < iters && best.d < target - 0.03; i++) {
    const m = mutate(cur.level, rng);
    temp *= 0.985;
    if (!m) continue;
    const d = evaluate(m, rng, 2);
    if (d < 0 || d > target + 0.12) continue;
    const gain = d - cur.d;
    if (gain > 0 || rng() < Math.exp(gain / temp)) {
      cur = { level: m, d };
      if (d > best.d) best = cur;
    }
  }
  return best;
}

/** Find a level close to the target difficulty among recipe variants, hardening if needed. */
export function searchLevel(
  id: string,
  variants: Recipe[],
  target: number,
  seed: number,
  opts: { perVariant?: number; hardenIters?: number; maxVessels?: number } = {},
): Candidate | null {
  const perVariant = opts.perVariant ?? 3;
  const rng: Rng = mulberry32(seed);
  const pool: Candidate[] = [];
  for (const v of variants) {
    for (let k = 0; k < perVariant; k++) {
      const g = generate(v, rng);
      // boards that don't fit a phone screen comfortably
      if (opts.maxVessels && g.vessels.length > opts.maxVessels) continue;
      const level = toLevel(id, g);
      const d = evaluate(level, rng, 2);
      if (d < 0) continue;
      pool.push({ level, d });
    }
  }
  if (!pool.length) return null;
  const close = (a: Candidate, b: Candidate) => Math.abs(a.d - target) - Math.abs(b.d - target);
  pool.sort(close);
  if (pool[0]!.d < target - 0.05) {
    // random layouts are mostly easy: harden the most promising few
    const seeds = [...pool].sort((a, b) => b.d - a.d).slice(0, 4);
    for (const s of seeds) {
      const h = harden(s, target, rng, opts.hardenIters ?? 70);
      pool.push(h);
      if (Math.abs(h.d - target) < 0.04) break;
    }
    pool.sort(close);
  }
  // screening is noisy: re-measure the three closest precisely and keep the closest
  const finals = pool
    .slice(0, 3)
    .map((c) => ({ level: c.level, d: evaluate(c.level, rng, 7, 12_000) }))
    .filter((c) => c.d >= 0)
    .sort(close);
  return finals[0] ?? null;
}

/**
 * searchLevel with a few steered retries: when an attempt lands far off, the next
 * one gets a smaller board if it came out too hard (or too big to prove solvable),
 * or stronger mechanics and a bigger board if it came out too easy.
 * `variants(shift, boost)`: `shift` moves the board size by whole colours, `boost` adds to mechanic intensity.
 */
export function searchSteered(
  id: string,
  variants: (shift: number, boost: number) => Recipe[],
  target: number,
  seed: number,
  opts: { perVariant?: number; hardenIters?: number; attempts?: number; maxVessels?: number } = {},
): Candidate | null {
  let best: Candidate | null = null;
  let shift = 0;
  let boost = 0;
  for (let attempt = 0; attempt < (opts.attempts ?? 4); attempt++) {
    const c = searchLevel(id, variants(shift, boost), target, seed + attempt * 99_991, opts);
    if (c && (!best || Math.abs(c.d - target) < Math.abs(best.d - target))) best = c;
    if (best && Math.abs(best.d - target) <= 0.05) break;
    if (!c || c.d > target) shift -= 1;
    else {
      boost += 0.1;
      shift += 1;
    }
  }
  return best;
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Colours are only labels, so a level can be recoloured without changing its
 * difficulty: levels with ≤ 6 colours get the six most distinct ones (red, blue,
 * green, yellow, purple, orange), ≤ 8 the first eight, in an order fixed by the id.
 * Applied when builds are merged, to the raw levels (it is not idempotent).
 */
export function recolor(l: LevelDef): LevelDef {
  const used = new Set<number>();
  for (const v of l.vessels) {
    v.layers.forEach((c) => used.add(c));
    if (v.accept !== null) used.add(v.accept);
    if (v.lock !== null) used.add(v.lock);
  }
  for (const o of l.queue) used.add(o.color);
  const n = used.size;
  const size = n <= 6 ? 6 : n <= 8 ? 8 : 12;
  const target = shuffle(Array.from({ length: size }, (_, i) => i), mulberry32(hash(l.id))).slice(0, n);
  const map = new Map([...used].sort((a, b) => a - b).map((c, i) => [c, target[i]!]));
  const m = (c: number) => map.get(c)!;
  for (const v of l.vessels) {
    v.layers = v.layers.map(m);
    if (v.accept !== null) v.accept = m(v.accept);
    if (v.lock !== null) v.lock = m(v.lock);
  }
  l.queue = l.queue.map((o) => ({ ...o, color: m(o.color) }));
  return l;
}

/** Fill par/stats: BFS optimum when it fits, else the best beam-search path. */
export function finalize(c: Candidate, seed: number): LevelDef {
  const l = c.level;
  l.mechanics = mechanicsOf(l);
  const rng = mulberry32(seed);
  const s0 = initialState(l);
  const bfs = solveBfs(l, s0, 250_000);
  let par = Infinity;
  let exact = false;
  if (bfs.solvable && bfs.path) {
    par = bfs.path.length;
    exact = true;
  } else {
    for (const w of [600, 2500]) {
      const path = solveBeam(l, s0, w);
      if (path && path.length < par) par = path.length;
    }
    const e = effortDifficulty(l, s0, 3, rng);
    if (e.par < par) par = e.par;
  }
  const casual = casualRate(l, s0, 120, rng).rate;
  l.par = par;
  l.stats = { casual: Math.round(casual * 1000) / 1000, states: bfs.states, exact, effort: Math.round(c.d * 1000) / 1000 };
  return l;
}
