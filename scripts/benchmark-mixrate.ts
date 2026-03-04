/**
 * Quick A/B test: same config, mixRate 0.3 vs 1.0
 * Uses the improved heuristic player with bulk-transfer scoring.
 */
import { TUBE_CAPACITY, COLOR_KEYS } from "../src/game/types";
import { isLevelComplete } from "../src/game/engine";
import type { Tube } from "../src/game/types";

const SIMS = 500;
const LEVELS = 30;
const MAX_MOVES = 400;

function generateTubes(numColors: number, tubesPerColor: number, emptyTubes: number, mixRate: number): Tube[] {
  const colors = COLOR_KEYS.slice(0, numColors);
  const filledTubeCount = numColors * tubesPerColor;
  const tubes: Tube[] = [];
  for (const color of colors) {
    for (let t = 0; t < tubesPerColor; t++) {
      tubes.push(Array(TUBE_CAPACITY).fill(color));
    }
  }
  const totalSegments = filledTubeCount * TUBE_CAPACITY;
  const numSwaps = Math.floor(mixRate * totalSegments);
  for (let s = 0; s < numSwaps; s++) {
    const a = Math.floor(Math.random() * filledTubeCount);
    let b = Math.floor(Math.random() * (filledTubeCount - 1));
    if (b >= a) b++;
    const posA = Math.floor(Math.random() * TUBE_CAPACITY);
    const posB = Math.floor(Math.random() * TUBE_CAPACITY);
    const tmp = tubes[a]![posA]!;
    tubes[a]![posA] = tubes[b]![posB]!;
    tubes[b]![posB] = tmp;
  }
  // Break same-color tubes
  for (let i = 0; i < filledTubeCount; i++) {
    const tube = tubes[i]!;
    if (tube.every(c => c === tube[0])) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const j = Math.floor(Math.random() * filledTubeCount);
        if (j === i) continue;
        const other = tubes[j]!;
        const diffIdx = other.findIndex(c => c !== tube[0]);
        if (diffIdx === -1) continue;
        const posI = Math.floor(Math.random() * TUBE_CAPACITY);
        const tmp = tube[posI]!;
        tube[posI] = other[diffIdx]!;
        other[diffIdx] = tmp;
        break;
      }
    }
  }
  for (let i = 0; i < emptyTubes; i++) tubes.push([]);
  return tubes;
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
    let usedEmpty = false;
    for (let to = 0; to < state.length; to++) {
      if (from === to) continue;
      const dst = state[to]!;
      if (dst.length >= TUBE_CAPACITY) continue;
      if (dst.length > 0 && dst[dst.length - 1] !== srcTop) continue;
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
    const dstUniform = dst.every(c => c === color);
    const dstRun = topRun(dst);
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
    const hash = hashState(state);
    visited.add(hash);
    if (visited.size > 20) {
      const first = visited.values().next().value;
      visited.delete(first!);
    }
  }
  return { solved: false, moves: MAX_MOVES };
}

// ─── Test ────────────────────────────────────────────────────────

const configs = [
  { label: "4c 2emp", colors: 4, tpc: 2, empty: 2 },
  { label: "4c 1emp", colors: 4, tpc: 2, empty: 1 },
];

const mixRates = [0.2, 0.3, 0.5, 0.7, 1.0, 2.0, 3.0];

console.log("mixRate A/B (improved heuristic) — " + LEVELS + " puzzles x " + SIMS + " sims\n");

for (const cfg of configs) {
  console.log("-- " + cfg.label + " (" + cfg.colors + "x" + cfg.tpc + "=" + (cfg.colors * cfg.tpc) + " filled, " + cfg.empty + " empty) --");
  console.log("  Mix   Solve%   AvgMoves   Score  Bar");
  for (const mr of mixRates) {
    let solved = 0, total = 0, totalMoves = 0;
    for (let p = 0; p < LEVELS; p++) {
      const tubes = generateTubes(cfg.colors, cfg.tpc, cfg.empty, mr);
      for (let s = 0; s < SIMS; s++) {
        const r = simulate(tubes);
        total++;
        if (r.solved) { solved++; totalMoves += r.moves; }
      }
    }
    const rate = solved / total;
    const avgMoves = solved > 0 ? (totalMoves / solved).toFixed(0) : "  -";
    // Composite: 80% solve difficulty + 20% move complexity
    const solveDifficulty = (1 - rate) * 100;
    const moveComplexity = solved > 0 ? Math.min(totalMoves / solved / 2, 100) : 100;
    const score = Math.round(0.8 * solveDifficulty + 0.2 * moveComplexity);
    const barLen = Math.round(score / 2);
    const bar = "█".repeat(barLen) + "░".repeat(50 - barLen);
    console.log(
      "  " + mr.toFixed(1).padStart(4) +
      "   " + (rate * 100).toFixed(1).padStart(5) + "%" +
      "   " + String(avgMoves).padStart(8) +
      "   " + String(score).padStart(5) + "  " + bar
    );
  }
  console.log();
}
