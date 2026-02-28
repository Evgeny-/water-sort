/**
 * Difficulty metric benchmark using random-player simulation.
 *
 * For each level tier, generates several puzzles and simulates many
 * "random players" (pick uniformly from valid moves, avoid revisiting states).
 *
 * Difficulty score = 100 × (1 - solveRate)
 *   0   = trivial (everyone solves it)
 *   100 = impossible (no one solves it randomly)
 *
 * Run: npx tsx scripts/benchmark-difficulty.ts
 */

import { createLevel } from "../src/game/levels";
import { type Tube, TUBE_CAPACITY } from "../src/game/types";
import { isLevelComplete } from "../src/game/engine";

const LEVELS_PER_TIER = 15;
const SIMS_PER_LEVEL = 500;
const MAX_MOVES = 400;

// One sample per tier midpoint
const TEST_LEVELS = [3, 10, 16, 28, 45, 68, 95, 130, 200];

function hashState(tubes: Tube[]): string {
  const h: string[] = [];
  for (const t of tubes) h.push(t.length === 0 ? "_" : t.join(""));
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

function simulateRandom(tubes: Tube[]): { solved: boolean; moves: number } {
  let state = tubes;
  const visited = new Set<string>();
  visited.add(hashState(state));

  for (let step = 0; step < MAX_MOVES; step++) {
    if (isLevelComplete(state)) return { solved: true, moves: step };
    const moves = getValidMoves(state);
    if (moves.length === 0) return { solved: false, moves: step };

    // Shuffle
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moves[i], moves[j]] = [moves[j]!, moves[i]!];
    }

    let moved = false;
    for (const m of moves) {
      const next = applyPour(state, m.from, m.to);
      const hash = hashState(next);
      if (!visited.has(hash)) {
        visited.add(hash);
        state = next;
        moved = true;
        break;
      }
    }
    if (!moved) return { solved: false, moves: step };
  }
  return { solved: false, moves: MAX_MOVES };
}

// ─── Main ───────────────────────────────────────────────────────

console.log("Water Sort Difficulty Benchmark");
console.log(`${LEVELS_PER_TIER} puzzles × ${SIMS_PER_LEVEL} random players per puzzle\n`);

const header = [
  "Level".padStart(6),
  "C".padStart(2),
  "Fill".padStart(5),
  "Emp".padStart(4),
  "Lock%".padStart(6),
  "SolveRate".padStart(10),
  "AvgMoves".padStart(9),
  "StuckAt".padStart(8),
  "SCORE".padStart(7),
  "Bar",
];
console.log(header.join("  "));
console.log("─".repeat(90));

let prevScore = -1;
for (const levelNum of TEST_LEVELS) {
  let totalSolved = 0;
  let totalSims = 0;
  let totalSolveMoves = 0;
  let totalStuckMoves = 0;
  let stuckCount = 0;

  const sampleLevel = createLevel(levelNum);

  for (let p = 0; p < LEVELS_PER_TIER; p++) {
    const level = createLevel(levelNum);
    for (let s = 0; s < SIMS_PER_LEVEL; s++) {
      const result = simulateRandom(level.tubes);
      totalSims++;
      if (result.solved) {
        totalSolved++;
        totalSolveMoves += result.moves;
      } else {
        totalStuckMoves += result.moves;
        stuckCount++;
      }
    }
  }

  const solveRate = totalSolved / totalSims;
  const avgMoves = totalSolved > 0 ? totalSolveMoves / totalSolved : 0;
  const avgStuck = stuckCount > 0 ? totalStuckMoves / stuckCount : 0;
  const score = Math.round((1 - solveRate) * 100);

  // Visual bar
  const barLen = Math.round(score / 2);
  const bar = "█".repeat(barLen) + "░".repeat(50 - barLen);

  // Trend arrow
  const trend = prevScore >= 0
    ? (score > prevScore ? " ↑" : score < prevScore ? " ↓" : " ─")
    : "";
  prevScore = score;

  const filledCount = sampleLevel.tubes.filter(t => t.length > 0).length;
  const emptyCount = sampleLevel.tubes.filter(t => t.length === 0).length;
  // Reconstruct lockedPercentage from level params
  const lockPct = levelNum <= 5 ? 0 : levelNum <= 12 ? 0 : levelNum <= 20 ? 10
    : levelNum <= 35 ? 20 : levelNum <= 55 ? 30 : levelNum <= 80 ? 50
    : levelNum <= 110 ? 55 : 70;

  console.log(
    String(levelNum).padStart(6) + "  " +
    String(sampleLevel.colors).padStart(2) + "  " +
    String(filledCount).padStart(5) + "  " +
    String(emptyCount).padStart(4) + "  " +
    (lockPct + "%").padStart(6) + "  " +
    (solveRate * 100).toFixed(1).padStart(9) + "%  " +
    avgMoves.toFixed(0).padStart(9) + "  " +
    avgStuck.toFixed(0).padStart(8) + "  " +
    String(score).padStart(7) + "  " +
    bar + trend
  );
}

console.log("─".repeat(90));
console.log("\nSCORE = 100 × (1 − random_solve_rate)");
console.log("Higher = harder. Ideal curve: steady increase from ~0 to ~70–80.");
console.log("(Score > 80 likely means many puzzles are unsolvable without undo.)");
