/**
 * How do new mechanics change difficulty? For each config: many random puzzles,
 * each played by the casual player. Shows that mechanics give intermediate steps
 * between "2 empty bottles" (trivial) and "1 empty bottle" (cliff).
 * Run: npx tsx scripts/knobs.ts > analysis/knobs.json
 */
import { generate, type Recipe } from "../src/engine/generate";
import { initialState } from "../src/engine/rules";
import { casualRate, mulberry32 } from "../src/engine/solver";
import type { LevelDef } from "../src/engine/types";

const PUZZLES = Number(process.env.PUZZLES ?? 40);
const SIMS = Number(process.env.SIMS ?? 100);

const configs: [string, string, Recipe][] = [
  ["4c×2", "2 пустые", { colors: 4, tpc: 2, empty: 2 }],
  ["4c×2", "1 пустая + мини-колба", { colors: 4, tpc: 2, empty: 1, flasks: 1 }],
  ["4c×2", "1 пустая + бак", { colors: 4, tpc: 2, empty: 1, jars: 1, jarAny: true }],
  ["4c×2", "1 пустая + замок-награда", { colors: 4, tpc: 2, empty: 1, locks: ["empty"] }],
  ["4c×2", "1 пустая", { colors: 4, tpc: 2, empty: 1 }],
  ["6c×2", "2 пустые", { colors: 6, tpc: 2, empty: 2 }],
  ["6c×2", "2 пустые + 2 крана", { colors: 6, tpc: 2, empty: 2, valves: 2 }],
  ["6c×2", "1 пустая + мини-колба", { colors: 6, tpc: 2, empty: 1, flasks: 1 }],
  ["6c×2", "1 пустая + бак", { colors: 6, tpc: 2, empty: 1, jars: 1, jarAny: true }],
  ["6c×2", "1 пустая + 2 мини-колбы", { colors: 6, tpc: 2, empty: 1, flasks: 2 }],
  ["6c×2", "1 пустая", { colors: 6, tpc: 2, empty: 1 }],
  ["5c×1", "заказы, 2 слота, 1 пустая", { mode: "orders", colors: 5, tpc: 1, empty: 1, slots: 2 }],
  ["6c×1", "заказы, 2 слота, 0 пустых", { mode: "orders", colors: 6, tpc: 1, empty: 0, slots: 2 }],
  ["6c×1", "заказы, 1 слот, 0 пустых", { mode: "orders", colors: 6, tpc: 1, empty: 0, slots: 1 }],
];

const out: unknown[] = [];
const rng = mulberry32(7);
for (const [group, label, r] of configs) {
  const rates: number[] = [];
  for (let p = 0; p < PUZZLES; p++) {
    const g = generate(r, rng);
    const level: LevelDef = { id: "k", pack: "k", name: label, mode: g.mode, vessels: g.vessels, slots: g.slots, queue: g.queue, par: 0, stats: { casual: 0, states: 0, exact: false } };
    rates.push(casualRate(level, initialState(level), SIMS, rng).rate);
  }
  rates.sort((a, b) => a - b);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const q = (p: number) => rates[Math.round(p * (rates.length - 1))]!;
  out.push({ group, label, mean, p10: q(0.1), p50: q(0.5), p90: q(0.9) });
  process.stderr.write(`${group.padEnd(6)} ${label.padEnd(30)} mean ${(mean * 100).toFixed(0).padStart(3)}%  p10 ${(q(0.1) * 100).toFixed(0).padStart(3)}%  p90 ${(q(0.9) * 100).toFixed(0).padStart(3)}%\n`);
}
console.log(JSON.stringify(out));
