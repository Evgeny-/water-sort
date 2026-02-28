import { type Tube, TUBE_CAPACITY } from "./types";
import { isLevelComplete } from "./engine";

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
