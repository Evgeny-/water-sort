/** Planning-effort difficulty on typical configs (solvable ones only). */
import { generate, type Recipe } from "../src/engine/generate";
import { initialState } from "../src/engine/rules";
import { casualRate, effortDifficulty, mulberry32 } from "../src/engine/solver";
import type { LevelDef } from "../src/engine/types";

const configs: [string, Recipe][] = [
  ["3c×2 2e", { colors: 3, tpc: 2, empty: 2 }],
  ["4c×2 2e", { colors: 4, tpc: 2, empty: 2 }],
  ["5c×2 2e", { colors: 5, tpc: 2, empty: 2 }],
  ["6c×2 2e", { colors: 6, tpc: 2, empty: 2 }],
  ["7c×2 2e", { colors: 7, tpc: 2, empty: 2 }],
  ["8c×2 2e", { colors: 8, tpc: 2, empty: 2 }],
  ["4c×2 1e", { colors: 4, tpc: 2, empty: 1 }],
  ["5c×1 1e", { colors: 5, tpc: 1, empty: 1 }],
  ["6c×2 1e+flask", { colors: 6, tpc: 2, empty: 1, flasks: 1 }],
  ["7c×2 1e+flask", { colors: 7, tpc: 2, empty: 1, flasks: 1 }],
  ["6c×2 jar any 1e", { colors: 6, tpc: 2, empty: 1, jars: 1, jarAny: true }],
  ["orders 6c 0e", { mode: "orders", colors: 6, tpc: 1, empty: 0, slots: 2 }],
  ["orders 7c 1e 1slot", { mode: "orders", colors: 7, tpc: 1, empty: 1, slots: 1 }],
  ["valve 6c×2 2e 3v", { colors: 6, tpc: 2, empty: 2, valves: 3 }],
  ["locks 6c×2 1e", { colors: 6, tpc: 2, empty: 1, locks: ["filled", "empty"] }],
];
const rng = mulberry32(5);
const rows: unknown[] = [];
for (const [name, r] of configs) {
  const ds: number[] = [];
  const ratios: number[] = [];
  const cas: number[] = [];
  const t0 = Date.now();
  let tries = 0;
  while (ds.length < 12 && tries < 60) {
    tries++;
    const g = generate(r, rng);
    const l: LevelDef = { id: "x", pack: "", name, mode: g.mode, vessels: g.vessels, slots: g.slots, queue: g.queue, par: 0, stats: { casual: 0, states: 0, exact: false } };
    const c = casualRate(l, initialState(l), 40, rng).rate;
    if (c <= 0.02) continue; // skip (probably) unsolvable
    const e = effortDifficulty(l, initialState(l), 5, rng);
    ds.push(e.d);
    ratios.push(e.ratio);
    cas.push(1 - c);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = [...ds].sort((a, b) => a - b);
  rows.push({ name, effort: avg(ds), casual: avg(cas) });
  console.error(
    name.padEnd(20),
    "effort D", (avg(ds) * 100).toFixed(0).padStart(3) + "%",
    `(p10 ${(sd[1]! * 100).toFixed(0)}% p90 ${(sd[sd.length - 2]! * 100).toFixed(0)}%)`,
    "ratio med", [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]!.toFixed(1),
    " casual D", (avg(cas) * 100).toFixed(0) + "%",
    `${Date.now() - t0}ms`,
  );
}
console.log(JSON.stringify(rows));
