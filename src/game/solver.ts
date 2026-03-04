import { type Tube, type Move, TUBE_CAPACITY } from "./types";
import {
  isLevelComplete,
  getValidMoves,
  topCount,
  topColor,
  pour,
} from "./engine";

/** Maximum number of states to explore before giving up */
const MAX_STATES = 100_000;

/**
 * Canonical hash of a game state.
 * Tubes are interchangeable, so sort them to deduplicate equivalent states.
 * Uses a compact numeric encoding instead of string concatenation.
 */
function hashState(tubes: Tube[]): string {
  // Encode each tube as a short string: length + color indices
  const tubeHashes: string[] = new Array(tubes.length);
  for (let i = 0; i < tubes.length; i++) {
    const t = tubes[i]!;
    if (t.length === 0) {
      tubeHashes[i] = "_";
    } else {
      tubeHashes[i] = t.join("");
    }
  }
  // Sort for canonical form (tubes are interchangeable)
  tubeHashes.sort();
  return tubeHashes.join("|");
}

/**
 * Execute a pour for the solver — lightweight version that only copies
 * the source and destination tubes, reusing everything else by reference.
 */
function solverPour(tubes: Tube[], from: number, to: number): Tube[] {
  const source = [...tubes[from]!];
  const dest = [...tubes[to]!];

  const color = source[source.length - 1]!;
  let count = 1;
  for (let i = source.length - 2; i >= 0; i--) {
    if (source[i] === color) count++;
    else break;
  }
  const space = TUBE_CAPACITY - dest.length;
  const transferred = Math.min(count, space);

  source.splice(source.length - transferred, transferred);
  for (let i = 0; i < transferred; i++) {
    dest.push(color);
  }

  const result = new Array<Tube>(tubes.length);
  for (let i = 0; i < tubes.length; i++) {
    if (i === from) result[i] = source;
    else if (i === to) result[i] = dest;
    else result[i] = tubes[i]!;
  }
  return result;
}

export interface SolveResult {
  solvable: boolean;
  par: number;
}

export interface SolvePathResult {
  solvable: boolean;
  moves: Move[];
}

/**
 * BFS solver that returns the full optimal move path.
 * Supports excluding tube indices (e.g. paid locked tubes).
 * Returns null if state space is too large.
 */
export function solvePath(
  tubes: Tube[],
  excludeIndices?: Set<number>,
): SolvePathResult | null {
  if (isLevelComplete(tubes)) {
    return { solvable: true, moves: [] };
  }

  const visited = new Set<string>();
  visited.add(hashState(tubes));

  // Each entry: [state, move-path]
  let queue: [Tube[], Move[]][] = [[tubes, []]];
  let depth = 0;

  while (queue.length > 0) {
    depth++;
    const nextQueue: [Tube[], Move[]][] = [];

    for (const [state, path] of queue) {
      for (let from = 0; from < state.length; from++) {
        if (excludeIndices?.has(from)) continue;
        const src = state[from]!;
        if (src.length === 0) continue;
        if (
          src.length === TUBE_CAPACITY &&
          src.every((c) => c === src[0])
        ) continue;

        const srcTop = src[src.length - 1]!;
        let srcTopCount = 1;
        for (let k = src.length - 2; k >= 0; k--) {
          if (src[k] === srcTop) srcTopCount++;
          else break;
        }

        for (let to = 0; to < state.length; to++) {
          if (from === to) continue;
          if (excludeIndices?.has(to)) continue;
          const dst = state[to]!;
          if (dst.length >= TUBE_CAPACITY) continue;
          if (dst.length > 0 && dst[dst.length - 1] !== srcTop) continue;
          if (dst.length === 0 && srcTopCount === src.length) continue;
          if (dst.length === 0) {
            let firstEmpty = -1;
            for (let e = 0; e < state.length; e++) {
              if (excludeIndices?.has(e)) continue;
              if (state[e]!.length === 0) { firstEmpty = e; break; }
            }
            if (to !== firstEmpty) continue;
          }

          const next = solverPour(state, from, to);
          const move: Move = { from, to };
          const newPath = [...path, move];

          if (isLevelComplete(next)) {
            return { solvable: true, moves: newPath };
          }

          const hash = hashState(next);
          if (!visited.has(hash)) {
            visited.add(hash);
            nextQueue.push([next, newPath]);
          }
        }

        if (visited.size > MAX_STATES) {
          return null;
        }
      }
    }

    queue = nextQueue;
  }

  return { solvable: false, moves: [] };
}

/** Extended metrics for difficulty analysis */
export interface SolveMetrics {
  solvable: boolean;
  par: number;
  /** Total unique states explored by BFS */
  statesExplored: number;
  /** Total valid moves generated across all states (before dedup) */
  totalMoves: number;
  /** Average branching factor (totalMoves / statesExplored) */
  avgBranching: number;
  /** Number of states that are dead ends (no valid moves, not solved) */
  deadEnds: number;
  /** dead ends / states explored */
  deadEndRatio: number;
  /** Whether solver hit the state limit */
  hitLimit: boolean;
}

/**
 * BFS solver: finds the minimum number of moves to solve a level.
 * Returns null if the state space is too large to search exhaustively.
 */
export function solve(tubes: Tube[]): SolveResult | null {
  if (isLevelComplete(tubes)) {
    return { solvable: true, par: 0 };
  }

  const visited = new Set<string>();
  visited.add(hashState(tubes));

  let queue: Tube[][] = [tubes];
  let depth = 0;

  while (queue.length > 0) {
    depth++;
    const nextQueue: Tube[][] = [];

    for (const state of queue) {
      // Inline getValidMoves + pruning for solver performance
      for (let from = 0; from < state.length; from++) {
        const src = state[from]!;
        if (src.length === 0) continue;
        // Skip complete tubes as source
        if (
          src.length === TUBE_CAPACITY &&
          src.every((c) => c === src[0])
        ) continue;

        const srcTop = src[src.length - 1]!;
        // Count consecutive same-color at top
        let srcTopCount = 1;
        for (let k = src.length - 2; k >= 0; k--) {
          if (src[k] === srcTop) srcTopCount++;
          else break;
        }

        for (let to = 0; to < state.length; to++) {
          if (from === to) continue;
          const dst = state[to]!;
          if (dst.length >= TUBE_CAPACITY) continue;
          if (dst.length > 0 && dst[dst.length - 1] !== srcTop) continue;

          // Prune: don't pour a uniform tube into an empty tube (pointless move)
          if (dst.length === 0 && srcTopCount === src.length) continue;

          // Prune: don't pour into empty if another empty exists earlier
          // (all empties are equivalent, so only use the first one)
          if (dst.length === 0) {
            let firstEmpty = -1;
            for (let e = 0; e < state.length; e++) {
              if (state[e]!.length === 0) { firstEmpty = e; break; }
            }
            if (to !== firstEmpty) continue;
          }

          const next = solverPour(state, from, to);

          if (isLevelComplete(next)) {
            return { solvable: true, par: depth };
          }

          const hash = hashState(next);
          if (!visited.has(hash)) {
            visited.add(hash);
            nextQueue.push(next);
          }
        }

        if (visited.size > MAX_STATES) {
          return null;
        }
      }
    }

    queue = nextQueue;
  }

  return { solvable: false, par: 0 };
}

/**
 * BFS solver that also collects difficulty metrics.
 * Explores the full reachable state space (up to MAX_STATES) to measure
 * how constrained/trappy a puzzle is.
 */
export function solveWithMetrics(tubes: Tube[]): SolveMetrics {
  if (isLevelComplete(tubes)) {
    return {
      solvable: true, par: 0, statesExplored: 1, totalMoves: 0,
      avgBranching: 0, deadEnds: 0, deadEndRatio: 0, hitLimit: false,
    };
  }

  const visited = new Set<string>();
  visited.add(hashState(tubes));

  let queue: Tube[][] = [tubes];
  let depth = 0;
  let par = -1;
  let totalMoves = 0;
  let deadEnds = 0;
  let hitLimit = false;

  while (queue.length > 0) {
    depth++;
    const nextQueue: Tube[][] = [];

    for (const state of queue) {
      let movesFromState = 0;

      for (let from = 0; from < state.length; from++) {
        const src = state[from]!;
        if (src.length === 0) continue;
        if (
          src.length === TUBE_CAPACITY &&
          src.every((c) => c === src[0])
        ) continue;

        const srcTop = src[src.length - 1]!;
        let srcTopCount = 1;
        for (let k = src.length - 2; k >= 0; k--) {
          if (src[k] === srcTop) srcTopCount++;
          else break;
        }

        for (let to = 0; to < state.length; to++) {
          if (from === to) continue;
          const dst = state[to]!;
          if (dst.length >= TUBE_CAPACITY) continue;
          if (dst.length > 0 && dst[dst.length - 1] !== srcTop) continue;
          if (dst.length === 0 && srcTopCount === src.length) continue;
          if (dst.length === 0) {
            let firstEmpty = -1;
            for (let e = 0; e < state.length; e++) {
              if (state[e]!.length === 0) { firstEmpty = e; break; }
            }
            if (to !== firstEmpty) continue;
          }

          movesFromState++;
          const next = solverPour(state, from, to);

          if (par < 0 && isLevelComplete(next)) {
            par = depth;
          }

          const hash = hashState(next);
          if (!visited.has(hash)) {
            visited.add(hash);
            nextQueue.push(next);
          }
        }

        if (visited.size > MAX_STATES) {
          hitLimit = true;
          break;
        }
      }

      totalMoves += movesFromState;
      if (movesFromState === 0) deadEnds++;

      if (hitLimit) break;
    }

    if (hitLimit) break;
    queue = nextQueue;
  }

  const statesExplored = visited.size;
  return {
    solvable: par >= 0,
    par: par >= 0 ? par : 0,
    statesExplored,
    totalMoves,
    avgBranching: statesExplored > 0 ? totalMoves / statesExplored : 0,
    deadEnds,
    deadEndRatio: statesExplored > 0 ? deadEnds / statesExplored : 0,
    hitLimit,
  };
}

// ─── Fast heuristic solvability check (for level generation) ─────

const HEURISTIC_MAX_MOVES = 200;
const HEURISTIC_ATTEMPTS = 10;

/**
 * Fast solvability check using heuristic simulation.
 * Runs the heuristic player multiple times — if any attempt solves it,
 * returns true. Much faster than BFS for large puzzles.
 */
export function isSolvableHeuristic(
  tubes: Tube[],
  excludeIndices?: Set<number>,
): boolean {
  for (let attempt = 0; attempt < HEURISTIC_ATTEMPTS; attempt++) {
    if (simulateHeuristic(tubes, excludeIndices)) return true;
  }
  return false;
}

function simulateHeuristic(tubes: Tube[], excludeIndices?: Set<number>): boolean {
  let state = tubes;
  const visited = new Set<string>();
  visited.add(hashState(state));

  for (let step = 0; step < HEURISTIC_MAX_MOVES; step++) {
    if (isLevelComplete(state)) return true;

    let moves = getValidMoves(state);
    if (excludeIndices && excludeIndices.size > 0) {
      moves = moves.filter((m) => !excludeIndices.has(m.from) && !excludeIndices.has(m.to));
    }
    if (moves.length === 0) return false;

    // Score and sort
    const scored = moves.map((m) => ({ m, s: scoreMoveSimple(state, m) }));
    scored.sort((a, b) => b.s - a.s);

    // 50% pick from best tier, 50% pick random
    let candidates: Move[];
    if (Math.random() < 0.5) {
      const bestScore = scored[0]!.s;
      candidates = scored.filter((x) => x.s === bestScore).map((x) => x.m);
    } else {
      candidates = scored.map((x) => x.m);
    }

    // Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }

    // Prefer unvisited states
    let picked: Move | null = null;
    for (const m of candidates) {
      const next = solverPour(state, m.from, m.to);
      const hash = hashState(next);
      if (!visited.has(hash)) { picked = m; break; }
    }
    if (!picked) picked = candidates[0]!;

    state = solverPour(state, picked.from, picked.to);
    visited.add(hashState(state));
    if (visited.size > 20) {
      const first = visited.values().next().value;
      visited.delete(first!);
    }
  }
  return false;
}

/** Simplified move scoring (no lockedMask — used for level generation check) */
function scoreMoveSimple(state: Tube[], m: Move): number {
  const src = state[m.from]!;
  const dst = state[m.to]!;
  const color = src[src.length - 1]!;
  let srcRun = 1;
  for (let i = src.length - 2; i >= 0; i--) {
    if (src[i] === color) srcRun++;
    else break;
  }
  const transferred = Math.min(srcRun, TUBE_CAPACITY - dst.length);

  if (
    dst.length + transferred === TUBE_CAPACITY &&
    (dst.length === 0 || dst[dst.length - 1] === color) &&
    (dst.length === 0 ? transferred === TUBE_CAPACITY : dst.every((c) => c === color))
  ) {
    return 10 + transferred;
  }
  if (dst.length > 0 && dst[dst.length - 1] === color) {
    let dstRun = 1;
    for (let i = dst.length - 2; i >= 0; i--) {
      if (dst[i] === color) dstRun++;
      else break;
    }
    const dstUniform = dst.every((c) => c === color);
    return 4 + transferred + (dstUniform ? 2 : 0) + (dstRun >= 2 ? 1 : 0);
  }
  if (srcRun === transferred && src.length > srcRun) return 2 + transferred;
  if (dst.length === 0) return 1;
  return -1;
}

// ─── Heuristic stepper (for dev auto-solver) ─────────────────────

function scoreMove(state: Tube[], m: Move, lockedMask?: boolean[][]): number {
  const src = state[m.from]!;
  const dst = state[m.to]!;
  const color = topColor(src)!;
  const srcRun = topCount(src, lockedMask?.[m.from]);
  const transferred = Math.min(srcRun, TUBE_CAPACITY - dst.length);

  // Completing a tube
  if (
    dst.length + transferred === TUBE_CAPACITY &&
    (dst.length === 0 || topColor(dst) === color) &&
    (dst.length === 0
      ? transferred === TUBE_CAPACITY
      : dst.every((c) => c === color))
  ) {
    return 10 + transferred;
  }

  // Extending a same-color run on non-empty destination
  if (dst.length > 0 && topColor(dst) === color) {
    // Count consecutive same-color from top (raw, ignoring locks)
    let dstRun = 1;
    for (let i = dst.length - 2; i >= 0; i--) {
      if (dst[i] === dst[dst.length - 1]) dstRun++;
      else break;
    }
    const dstUniform = dst.every((c) => c === color);
    return 4 + transferred + (dstUniform ? 2 : 0) + (dstRun >= 2 ? 1 : 0);
  }

  // Moving entire top run off source (clears a color group)
  if (srcRun === transferred && src.length > srcRun) {
    return 2 + transferred;
  }

  // Pouring into empty tube
  if (dst.length === 0) return 1;

  return -1;
}

/**
 * Create a heuristic stepper for the dev auto-solver.
 * Tracks visited states with a sliding window to avoid loops.
 * Call `nextMove()` to get the next best move, or null if stuck/complete.
 */
export function createHeuristicSolver() {
  const visited = new Set<string>();

  function reset() {
    visited.clear();
  }

  function nextMove(tubes: Tube[], lockedMask?: boolean[][], excludeIndices?: Set<number>): Move | null {
    if (isLevelComplete(tubes, lockedMask)) return null;

    visited.add(hashState(tubes));

    let moves = getValidMoves(tubes, lockedMask);
    // Filter out moves involving excluded tubes (e.g. paid locked tubes)
    if (excludeIndices && excludeIndices.size > 0) {
      moves = moves.filter((m) => !excludeIndices.has(m.from) && !excludeIndices.has(m.to));
    }
    if (moves.length === 0) return null;

    // Score and sort
    const scored = moves.map((m) => ({ m, s: scoreMove(tubes, m, lockedMask) }));
    scored.sort((a, b) => b.s - a.s);

    // 50% pick from best tier, 50% pick from all
    let candidates: Move[];
    if (Math.random() < 0.5) {
      const bestScore = scored[0]!.s;
      candidates = scored.filter((x) => x.s === bestScore).map((x) => x.m);
    } else {
      candidates = scored.map((x) => x.m);
    }

    // Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }

    // Prefer moves leading to unvisited states
    for (const m of candidates) {
      const next = pour(tubes, m.from, m.to, lockedMask);
      const hash = hashState(next);
      if (!visited.has(hash)) return m;
    }

    // All visited — pick first anyway
    return candidates[0] ?? null;
  }

  return {
    nextMove(tubes: Tube[], lockedMask?: boolean[][], excludeIndices?: Set<number>): Move | null {
      const move = nextMove(tubes, lockedMask, excludeIndices);
      // Sliding window: keep only last 20 states
      if (visited.size > 20) {
        const first = visited.values().next().value;
        visited.delete(first!);
      }
      return move;
    },
    reset,
  };
}
