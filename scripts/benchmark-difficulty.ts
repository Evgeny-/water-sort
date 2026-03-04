/**
 * Difficulty benchmark using a heuristic player simulation.
 *
 * The player scores each valid move and picks from the best tier
 * with some randomness (to avoid deterministic loops):
 *   +4  completes a tube (fills to TUBE_CAPACITY, single color)
 *   +2  extends a same-color run on destination
 *   +1  pours entire source top-run (clears a color group)
 *    0  pours into empty tube
 *   -1  everything else
 *
 * Picks best-scored move 70% of the time, random from all 30%.
 *
 * Difficulty score = 100 × (1 - solveRate)
 *   0   = trivial (everyone solves it)
 *   100 = impossible (no one solves it)
 *
 * Run: npx tsx scripts/benchmark-difficulty.ts
 */

import { createLevel } from "../src/game/levels";
import { type Tube, TUBE_CAPACITY } from "../src/game/types";
import { isLevelComplete } from "../src/game/engine";

const LEVELS_PER_TIER = 15;
const SIMS_PER_LEVEL = 500;
const MAX_MOVES = 400;

// One sample per tier midpoint (matching getDifficulty breakpoints)
// Tiers: ≤3, ≤6, ≤14, ≤25, ≤35, ≤55, ≤70, ≤90, 91+
const TEST_LEVELS = [2, 5, 10, 20, 30, 45, 63, 80, 120];

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

/** Count consecutive same-color segments from the top of a tube */
function topRun(tube: Tube): number {
  if (tube.length === 0) return 0;
  let count = 1;
  for (let i = tube.length - 2; i >= 0; i--) {
    if (tube[i] === tube[tube.length - 1]) count++; else break;
  }
  return count;
}

/**
 * Score a move for the heuristic player.
 * Higher = better move. Scores factor in how many segments transfer
 * (bulk moves are more valuable) and destination state.
 */
function scoreMove(state: Tube[], m: Move): number {
  const src = state[m.from]!;
  const dst = state[m.to]!;
  const color = src[src.length - 1]!;
  const srcRun = topRun(src);
  const transferred = Math.min(srcRun, TUBE_CAPACITY - dst.length);

  // Completing a tube: destination becomes full single-color
  if (dst.length + transferred === TUBE_CAPACITY &&
      (dst.length === 0 || dst[dst.length - 1] === color) &&
      (dst.length === 0 ? transferred === TUBE_CAPACITY : dst.every(c => c === color))) {
    return 10 + transferred;
  }

  // Extending a same-color run on a non-empty destination
  if (dst.length > 0 && dst[dst.length - 1] === color) {
    // Bonus for bulk transfers and for how uniform the destination already is
    const dstRun = topRun(dst);
    const dstUniform = dst.every(c => c === color);
    return 4 + transferred + (dstUniform ? 2 : 0) + (dstRun >= 2 ? 1 : 0);
  }

  // Moving entire top run off source (clears a color group, frees space)
  if (srcRun === transferred && src.length > srcRun) {
    return 2 + transferred;
  }

  // Pouring into empty tube — slight penalty to avoid wasting empties
  if (dst.length === 0) return 1;

  return -1;
}

function simulateHeuristic(tubes: Tube[]): { solved: boolean; moves: number } {
  let state = tubes;
  const visited = new Set<string>();
  visited.add(hashState(state));

  for (let step = 0; step < MAX_MOVES; step++) {
    if (isLevelComplete(state)) return { solved: true, moves: step };
    const moves = getValidMoves(state);
    if (moves.length === 0) return { solved: false, moves: step };

    // Score all moves
    const scored = moves.map(m => ({ m, s: scoreMove(state, m) }));
    scored.sort((a, b) => b.s - a.s);

    // 50% pick from best tier, 50% pick random — models a casual human
    let candidates: Move[];
    if (Math.random() < 0.5) {
      const bestScore = scored[0]!.s;
      candidates = scored.filter(x => x.s === bestScore).map(x => x.m);
    } else {
      candidates = scored.map(x => x.m);
    }

    // Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }

    // Try to avoid very recent states but don't block on it
    let picked: Move | null = null;
    for (const m of candidates) {
      const next = applyPour(state, m.from, m.to);
      const hash = hashState(next);
      if (!visited.has(hash)) { picked = m; break; }
    }
    if (!picked) picked = candidates[0]!;

    state = applyPour(state, picked.from, picked.to);
    const hash = hashState(state);
    visited.add(hash);
    // Keep only last 20 states to allow revisiting older states
    if (visited.size > 20) {
      const first = visited.values().next().value;
      visited.delete(first!);
    }
  }
  return { solved: false, moves: MAX_MOVES };
}

// ─── Main ───────────────────────────────────────────────────────

console.log("Water Sort Difficulty Benchmark (heuristic player)");
console.log(`${LEVELS_PER_TIER} puzzles × ${SIMS_PER_LEVEL} heuristic players per puzzle\n`);

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
console.log("─".repeat(97));

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
      const result = simulateHeuristic(level.tubes);
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

  // Composite score: 80% solve difficulty + 20% move complexity
  // Move complexity: avgMoves normalized to 0–100 (cap at 200 moves = 100)
  const solveDifficulty = (1 - solveRate) * 100;
  const moveComplexity = totalSolved > 0 ? Math.min(avgMoves / 2, 100) : 100;
  const score = Math.round(0.8 * solveDifficulty + 0.2 * moveComplexity);

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
  const lockPct = levelNum <= 3 ? 15 : levelNum <= 6 ? 40 : levelNum <= 14 ? 20
    : levelNum <= 25 ? 10 : levelNum <= 35 ? 40 : levelNum <= 55 ? 40
    : levelNum <= 70 ? 70 : levelNum <= 90 ? 80 : 90;

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

console.log("─".repeat(97));
console.log("\nSCORE = 0.8 × (1 − solveRate) × 100 + 0.2 × min(avgMoves/2, 100)");
console.log("Higher = harder. Ideal curve: steady increase from ~0 to ~70–80.");
console.log("Solve rate dominates, but more moves = harder even at same solve rate.");
