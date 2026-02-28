/**
 * Compute average par (optimal moves) for each difficulty tier.
 * Only works for tiers where the BFS solver can finish (filled ≤ 8).
 * For larger tiers, uses the estimatePar heuristic.
 *
 * Run: npx tsx scripts/compute-pars.ts
 */

import { type Tube, TUBE_CAPACITY, COLOR_KEYS } from "../src/game/types";
import { isLevelComplete } from "../src/game/engine";
import { solve } from "../src/game/solver";

const SAMPLES = 50;

// Recreate the generation logic (without solver) to get raw puzzles
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function generateTubes(numColors: number, tubesPerColor: number, emptyTubes: number): Tube[] {
  const colors = COLOR_KEYS.slice(0, numColors);
  const filledTubeCount = numColors * tubesPerColor;
  const pool: string[] = [];
  for (const color of colors) {
    for (let i = 0; i < TUBE_CAPACITY * tubesPerColor; i++) pool.push(color);
  }
  shuffleArray(pool);
  const tubes: Tube[] = [];
  for (let i = 0; i < filledTubeCount; i++) {
    tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
  }
  for (let i = 0; i < emptyTubes; i++) tubes.push([]);
  return tubes;
}

function hasDuplicateTube(tubes: Tube[]): boolean {
  return tubes.some(t => t.length === TUBE_CAPACITY && t.every(c => c === t[0]));
}

function estimatePar(filledTubeCount: number): number {
  return Math.floor(filledTubeCount * (TUBE_CAPACITY - 1.5));
}

// Tiers from getDifficulty
const TIERS = [
  { name: "1–5",    colors: 3, tpc: 2, empty: 2, paid: 1 },
  { name: "6–12",   colors: 4, tpc: 2, empty: 2, paid: 1 },
  { name: "13–20",  colors: 4, tpc: 2, empty: 1, paid: 1 },
  { name: "21–35",  colors: 5, tpc: 2, empty: 1, paid: 1 },
  { name: "36–55",  colors: 6, tpc: 2, empty: 1, paid: 1 },
  { name: "56–80",  colors: 6, tpc: 2, empty: 1, paid: 1 },
  { name: "81–110", colors: 7, tpc: 2, empty: 1, paid: 1 },
  { name: "111+",   colors: 7, tpc: 2, empty: 1, paid: 1 },
];

console.log("Par computation per tier");
console.log("=".repeat(90));
console.log(
  "Tier".padEnd(10),
  "Colors".padStart(7),
  "Filled".padStart(7),
  "Empty".padStart(6),
  "CanSolve".padStart(9),
  "AvgPar".padStart(8),
  "MinPar".padStart(8),
  "MaxPar".padStart(8),
  "Estimate".padStart(9),
);
console.log("-".repeat(90));

for (const tier of TIERS) {
  const filled = tier.colors * tier.tpc;
  const totalEmpty = tier.empty + tier.paid;
  const canSolve = filled <= 8;

  const pars: number[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const tubes = generateTubes(tier.colors, tier.tpc, totalEmpty);
      if (isLevelComplete(tubes)) continue;
      if (hasDuplicateTube(tubes)) continue;

      if (canSolve) {
        const result = solve(tubes);
        if (result === null) {
          // Too complex, use estimate
          pars.push(estimatePar(filled));
          break;
        }
        if (!result.solvable) continue;
        if (result.par < 3) continue;
        pars.push(result.par);
        break;
      } else {
        pars.push(estimatePar(filled));
        break;
      }
    }
  }

  const avg = pars.reduce((a, b) => a + b, 0) / pars.length;
  const min = Math.min(...pars);
  const max = Math.max(...pars);
  const est = estimatePar(filled);

  console.log(
    tier.name.padEnd(10),
    String(tier.colors).padStart(7),
    String(filled).padStart(7),
    String(totalEmpty).padStart(6),
    (canSolve ? "YES" : "no").padStart(9),
    avg.toFixed(1).padStart(8),
    String(min).padStart(8),
    String(max).padStart(8),
    String(est).padStart(9),
  );
}

console.log("=".repeat(90));
console.log("\nRecommended par values to hardcode (use Math.round of AvgPar, or Estimate for large tiers):");
