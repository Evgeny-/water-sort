import type { Color, Kind, LevelDef, Order, Vessel } from "./types";
import type { Rng } from "./solver";

export function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function vessel(kind: Kind, cap: number, layers: Color[] = [], extra: Partial<Vessel> = {}): Vessel {
  return { kind, cap, layers, hidden: layers.map(() => false), accept: null, lock: null, ...extra };
}

/**
 * A composable level recipe. Mechanics can be mixed freely:
 * hidden layers + jars + flasks + valves + padlocks, in sort or orders mode.
 */
export interface Recipe {
  mode?: "sort" | "orders";
  colors: number;
  /** bottles' worth of liquid per colour (4 units each) */
  tpc: number;
  /** empty regular bottles */
  empty: number;
  /** probability that a filled bottle gets hidden ("?") bottom layers */
  hidden?: number;
  jars?: number;
  /** chameleon jar: colour is chosen by the first pour */
  jarAny?: boolean;
  flasks?: number;
  valves?: number;
  /** "empty" locks an empty reward bottle, "filled" locks a full one */
  locks?: ("empty" | "filled")[];
  /** orders mode */
  slots?: number;
  orderCaps?: number[];
}

/** Deal a shuffled pool into full vessels of `cap`, rejecting already-sorted ones. */
function deal(pool: Color[], cap: number, rng: Rng): Color[][] {
  let out: Color[][] = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    shuffle(pool, rng);
    out = [];
    for (let i = 0; i < pool.length; i += cap) out.push(pool.slice(i, i + cap));
    if (!out.some((b) => b.length === cap && b.every((c) => c === b[0]))) return out;
  }
  return out;
}

function hide(v: Vessel, p: number, rng: Rng) {
  if (v.layers.length < 2 || rng() >= p) return;
  const k = 1 + Math.floor(rng() * (v.layers.length - 1));
  for (let i = 0; i < k; i++) v.hidden[i] = true;
}

export interface Generated {
  mode: LevelDef["mode"];
  vessels: Vessel[];
  slots: number;
  queue: Order[];
}

export function generate(r: Recipe, rng: Rng): Generated {
  // the palette is ordered by distinctness: small boards use the first 6 or 8 colours
  const paletteSize = r.colors <= 6 ? 6 : r.colors <= 8 ? 8 : 12;
  const colors = shuffle(Array.from({ length: paletteSize }, (_, i) => i), rng).slice(0, r.colors);
  const mode = r.mode ?? "sort";
  const vessels: Vessel[] = [];
  const pool: Color[] = [];
  const queue: Order[] = [];
  const jars = mode === "sort" ? (r.jars ?? 0) : 0;

  colors.forEach((c, i) => {
    const units = jars > 0 && (r.jarAny || i < jars) ? 8 : 4 * r.tpc;
    for (let k = 0; k < units; k++) pool.push(c);
    if (mode === "orders") {
      const caps = r.orderCaps ?? [4];
      let left = units;
      while (left > 0) {
        const options = caps.filter((x) => x <= left);
        const cap = options[Math.floor(rng() * options.length)] ?? left;
        queue.push({ color: c, cap });
        left -= cap;
      }
    }
  });
  if (mode === "orders") shuffle(queue, rng);
  for (let j = 0; j < jars; j++) vessels.push(vessel("jar", 8, [], { accept: r.jarAny ? null : colors[j]! }));

  const bottles = deal(pool, 4, rng).map((layers) => vessel("bottle", 4, layers));
  for (const b of bottles) hide(b, r.hidden ?? 0, rng);

  const order = shuffle(bottles.map((_, i) => i), rng);
  for (const i of order.slice(0, r.valves ?? 0)) {
    const b = bottles[i]!;
    b.kind = "valve";
    b.hidden = b.layers.map(() => false);
  }
  let li = r.valves ?? 0;
  for (const l of r.locks ?? []) {
    if (l !== "filled") continue;
    const i = order[li++];
    if (i === undefined) continue;
    const b = bottles[i]!;
    // key must still be collectable outside this bottle
    const inside = new Set(b.layers);
    const keys = colors.filter((c) => !inside.has(c) || r.tpc > 1);
    b.lock = keys[Math.floor(rng() * keys.length)] ?? colors[0]!;
    b.hidden = b.layers.map(() => false);
  }

  vessels.push(...bottles);
  for (let e = 0; e < r.empty; e++) vessels.push(vessel("bottle", 4));
  for (let f = 0; f < (r.flasks ?? 0); f++) vessels.push(vessel("flask", 2));
  for (const l of r.locks ?? []) {
    if (l === "empty") vessels.push(vessel("bottle", 4, [], { lock: colors[Math.floor(rng() * colors.length)]! }));
  }
  return { mode, vessels, slots: r.slots ?? 2, queue };
}

/** Which mechanics a generated level actually uses (for labels and rules). */
export function mechanicsOf(g: { mode: LevelDef["mode"]; vessels: Vessel[] }): string[] {
  const m = new Set<string>();
  if (g.mode === "orders") m.add("orders");
  for (const v of g.vessels) {
    if (v.kind === "jar") m.add("jar");
    if (v.kind === "flask") m.add("flask");
    if (v.kind === "valve") m.add("valve");
    if (v.lock !== null) m.add("locks");
    if (v.hidden.some(Boolean)) m.add("hidden");
  }
  return [...m];
}
