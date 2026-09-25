/** How the strategist compares to the casual player on typical configs. */
import { generate, type Recipe } from "../src/engine/generate";
import { initialState } from "../src/engine/rules";
import { casualRate, mulberry32, smartRate } from "../src/engine/solver";
import type { LevelDef } from "../src/engine/types";

const configs: [string, Recipe][] = [
  ["3c×2 2e", { colors: 3, tpc: 2, empty: 2 }],
  ["4c×2 2e", { colors: 4, tpc: 2, empty: 2 }],
  ["5c×2 2e", { colors: 5, tpc: 2, empty: 2 }],
  ["6c×2 2e", { colors: 6, tpc: 2, empty: 2 }],
  ["7c×2 2e", { colors: 7, tpc: 2, empty: 2 }],
  ["4c×2 1e", { colors: 4, tpc: 2, empty: 1 }],
  ["5c×1 1e", { colors: 5, tpc: 1, empty: 1 }],
  ["6c×1 1e", { colors: 6, tpc: 1, empty: 1 }],
  ["6c×2 1e", { colors: 6, tpc: 2, empty: 1 }],
  ["7c×2 1e+flask", { colors: 7, tpc: 2, empty: 1, flasks: 1 }],
  ["orders 6c 0e", { mode: "orders", colors: 6, tpc: 1, empty: 0, slots: 2 }],
  ["orders 7c 0e 1slot", { mode: "orders", colors: 7, tpc: 1, empty: 0, slots: 1 }],
];
const rng = mulberry32(99);
for (const [name, r] of configs) {
  const cas: number[] = [];
  const sm: number[] = [];
  const t0 = Date.now();
  for (let p = 0; p < 12; p++) {
    const g = generate(r, rng);
    const l: LevelDef = { id: "x", pack: "", name, mode: g.mode, vessels: g.vessels, slots: g.slots, queue: g.queue, par: 0, stats: { casual: 0, states: 0, exact: false } };
    cas.push(1 - casualRate(l, initialState(l), 60, rng).rate);
    sm.push(1 - smartRate(l, initialState(l), 40, rng).rate);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  sm.sort((a, b) => a - b);
  console.log(name.padEnd(20), "casual D", (avg(cas) * 100).toFixed(0).padStart(3) + "%", " smart D", (avg(sm) * 100).toFixed(0).padStart(3) + "%", ` (p10 ${(sm[1]! * 100).toFixed(0)}% p90 ${(sm[10]! * 100).toFixed(0)}%)`, `${Date.now() - t0}ms`);
}
