/**
 * Explore difficulty parameter space.
 * Tests many combinations of (colors, tubesPerColor, emptyTubes, lockedPercentage)
 * and measures solvability + difficulty WITHOUT the paid tube.
 *
 * Run: npx tsx scripts/explore-params.ts
 */

import { type Tube, TUBE_CAPACITY, COLOR_KEYS } from "../src/game/types";
import { isLevelComplete } from "../src/game/engine";

const PUZZLES = 20;
const SIMS = 200;
const MAX_MOVES = 400;

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

function hashState(tubes: Tube[]): string {
  const h: string[] = tubes.map(t => t.length === 0 ? "_" : t.join(""));
  h.sort();
  return h.join("|");
}

function applyPour(tubes: Tube[], from: number, to: number): Tube[] {
  const source = [...tubes[from]!];
  const dest = [...tubes[to]!];
  const color = source[source.length - 1]!;
  let count = 1;
  for (let i = source.length - 2; i >= 0; i--) {
    if (source[i] === color) count++; else break;
  }
  const transferred = Math.min(count, TUBE_CAPACITY - dest.length);
  source.splice(source.length - transferred, transferred);
  for (let i = 0; i < transferred; i++) dest.push(color);
  return tubes.map((t, i) => i === from ? source : i === to ? dest : t);
}

interface Move { from: number; to: number }

function getValidMoves(state: Tube[]): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < state.length; from++) {
    const src = state[from]!;
    if (src.length === 0) continue;
    if (src.length === TUBE_CAPACITY && src.every(c => c === src[0])) continue;
    const srcTop = src[src.length - 1]!;
    let srcTopCount = 1;
    for (let k = src.length - 2; k >= 0; k--) {
      if (src[k] === srcTop) srcTopCount++; else break;
    }
    let usedEmpty = false;
    for (let to = 0; to < state.length; to++) {
      if (from === to) continue;
      const dst = state[to]!;
      if (dst.length >= TUBE_CAPACITY) continue;
      if (dst.length > 0 && dst[dst.length - 1] !== srcTop) continue;
      if (dst.length === 0 && srcTopCount === src.length) continue;
      if (dst.length === 0) { if (usedEmpty) continue; usedEmpty = true; }
      moves.push({ from, to });
    }
  }
  return moves;
}

function topRun(tube: Tube): number {
  if (tube.length === 0) return 0;
  let count = 1;
  for (let i = tube.length - 2; i >= 0; i--) {
    if (tube[i] === tube[tube.length - 1]) count++; else break;
  }
  return count;
}

function scoreMove(state: Tube[], m: Move): number {
  const src = state[m.from]!;
  const dst = state[m.to]!;
  const color = src[src.length - 1]!;
  const srcRun = topRun(src);
  const transferred = Math.min(srcRun, TUBE_CAPACITY - dst.length);

  if (dst.length + transferred === TUBE_CAPACITY &&
      (dst.length === 0 || dst[dst.length - 1] === color) &&
      (dst.length === 0 ? transferred === TUBE_CAPACITY : dst.every(c => c === color))) {
    return 10 + transferred;
  }
  if (dst.length > 0 && dst[dst.length - 1] === color) {
    const dstRun = topRun(dst);
    const dstUniform = dst.every(c => c === color);
    return 4 + transferred + (dstUniform ? 2 : 0) + (dstRun >= 2 ? 1 : 0);
  }
  if (srcRun === transferred && src.length > srcRun) return 2 + transferred;
  if (dst.length === 0) return 1;
  return -1;
}

function simulate(tubes: Tube[]): { solved: boolean; moves: number } {
  let state = tubes;
  const visited = new Set<string>();
  visited.add(hashState(state));

  for (let step = 0; step < MAX_MOVES; step++) {
    if (isLevelComplete(state)) return { solved: true, moves: step };
    const moves = getValidMoves(state);
    if (moves.length === 0) return { solved: false, moves: step };

    const scored = moves.map(m => ({ m, s: scoreMove(state, m) }));
    scored.sort((a, b) => b.s - a.s);

    let candidates: Move[];
    if (Math.random() < 0.5) {
      const bestScore = scored[0]!.s;
      candidates = scored.filter(x => x.s === bestScore).map(x => x.m);
    } else {
      candidates = scored.map(x => x.m);
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }

    let picked: Move | null = null;
    for (const m of candidates) {
      const next = applyPour(state, m.from, m.to);
      const hash = hashState(next);
      if (!visited.has(hash)) { picked = m; break; }
    }
    if (!picked) picked = candidates[0]!;

    state = applyPour(state, picked.from, picked.to);
    visited.add(hashState(state));
    if (visited.size > 20) {
      const first = visited.values().next().value;
      visited.delete(first!);
    }
  }
  return { solved: false, moves: MAX_MOVES };
}

// ─── Parameter space ─────────────────────────────────────────────

interface Config {
  colors: number;
  tpc: number;     // tubesPerColor
  empty: number;
  lockPct: number;
}

const configs: Config[] = [];

for (const colors of [3, 4, 5, 6, 7]) {
  for (const tpc of [2, 3]) {
    for (const empty of [1, 2, 3]) {
      for (const lockPct of [0, 0.2, 0.5, 0.8]) {
        configs.push({ colors, tpc, empty, lockPct });
      }
    }
  }
}

console.log(`Exploring ${configs.length} parameter combinations`);
console.log(`${PUZZLES} puzzles × ${SIMS} sims each (no paid tube)\n`);

console.log(
  "Colors".padStart(7),
  "TPC".padStart(4),
  "Filled".padStart(7),
  "Empty".padStart(6),
  "Lock%".padStart(6),
  "Tubes".padStart(6),
  "Solve%".padStart(8),
  "AvgMov".padStart(7),
  "SCORE".padStart(6),
  " Verdict",
);
console.log("─".repeat(85));

const results: { cfg: Config; solveRate: number; avgMoves: number; score: number }[] = [];

for (const cfg of configs) {
  const filled = cfg.colors * cfg.tpc;
  const totalTubes = filled + cfg.empty;

  let totalSolved = 0;
  let totalSims = 0;
  let totalMoves = 0;

  for (let p = 0; p < PUZZLES; p++) {
    let tubes: Tube[] | null = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const t = generateTubes(cfg.colors, cfg.tpc, cfg.empty);
      if (isLevelComplete(t)) continue;
      if (hasDuplicateTube(t)) continue;
      tubes = t;
      break;
    }
    if (!tubes) continue;

    for (let s = 0; s < SIMS; s++) {
      const result = simulate(tubes);
      totalSims++;
      if (result.solved) {
        totalSolved++;
        totalMoves += result.moves;
      }
    }
  }

  const solveRate = totalSims > 0 ? totalSolved / totalSims : 0;
  const avgMoves = totalSolved > 0 ? totalMoves / totalSolved : 0;
  const solveDifficulty = (1 - solveRate) * 100;
  const moveComplexity = totalSolved > 0 ? Math.min(avgMoves / 2, 100) : 100;
  const score = Math.round(0.8 * solveDifficulty + 0.2 * moveComplexity);

  let verdict = "";
  if (solveRate >= 0.95) verdict = "TRIVIAL";
  else if (solveRate >= 0.7) verdict = "EASY";
  else if (solveRate >= 0.4) verdict = "MEDIUM";
  else if (solveRate >= 0.15) verdict = "HARD";
  else if (solveRate >= 0.03) verdict = "VERY HARD";
  else verdict = "BRUTAL";

  results.push({ cfg, solveRate, avgMoves, score });

  console.log(
    String(cfg.colors).padStart(7),
    String(cfg.tpc).padStart(4),
    String(filled).padStart(7),
    String(cfg.empty).padStart(6),
    (cfg.lockPct * 100 + "%").padStart(6),
    String(totalTubes).padStart(6),
    (solveRate * 100).toFixed(1).padStart(7) + "%",
    avgMoves.toFixed(0).padStart(7),
    String(score).padStart(6),
    " " + verdict,
  );
}

console.log("─".repeat(85));

// Summary: filter to interesting configs for level design
console.log("\n=== RECOMMENDED FOR LEVEL DESIGN (solve rate 15%–95%) ===\n");
console.log(
  "Colors".padStart(7),
  "TPC".padStart(4),
  "Filled".padStart(7),
  "Empty".padStart(6),
  "Lock%".padStart(6),
  "Solve%".padStart(8),
  "AvgMov".padStart(7),
  "SCORE".padStart(6),
);
console.log("─".repeat(60));

const good = results
  .filter(r => r.solveRate >= 0.15 && r.solveRate <= 0.95)
  .sort((a, b) => a.score - b.score);

for (const r of good) {
  console.log(
    String(r.cfg.colors).padStart(7),
    String(r.cfg.tpc).padStart(4),
    String(r.cfg.colors * r.cfg.tpc).padStart(7),
    String(r.cfg.empty).padStart(6),
    (r.cfg.lockPct * 100 + "%").padStart(6),
    (r.solveRate * 100).toFixed(1).padStart(7) + "%",
    r.avgMoves.toFixed(0).padStart(7),
    String(r.score).padStart(6),
  );
}
