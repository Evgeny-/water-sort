import { type Tube } from "./types";
import { getValidMoves, pour, isLevelComplete } from "./engine";

/** Maximum number of states to explore before giving up */
const MAX_STATES = 300_000;

/**
 * Canonical hash of a game state.
 * Tubes are interchangeable, so sort them to deduplicate equivalent states.
 */
function hashState(tubes: Tube[]): string {
  return tubes
    .map((t) => t.join(","))
    .sort()
    .join("|");
}

export interface SolveResult {
  solvable: boolean;
  par: number;
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
      const moves = getValidMoves(state);

      for (const move of moves) {
        // Prune: don't pour a single-color tube into an empty tube (pointless)
        const source = state[move.from]!;
        if (
          state[move.to]!.length === 0 &&
          source.every((c) => c === source[0])
        ) {
          continue;
        }

        const next = pour(state, move.from, move.to);

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
        return null; // Too complex to solve exhaustively
      }
    }

    queue = nextQueue;
  }

  return { solvable: false, par: 0 };
}
