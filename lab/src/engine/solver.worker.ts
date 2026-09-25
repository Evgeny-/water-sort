/** Runs the solver off the main thread: the next move of a solution, or proof there is none. */
import { solveBfs, solveDfs } from "./solver";
import type { LevelDef, Move, State } from "./types";

export interface SolveRequest {
  id: number;
  level: LevelDef;
  state: State;
}

export interface SolveResult {
  id: number;
  /** first move of a solution, if one was found */
  move: Move | null;
  /** true: a solution exists · false: proven that none does · null: search gave up */
  solvable: boolean | null;
  /** moves to go (the optimum when `optimal`) */
  left: number;
  /** the solution is a shortest one */
  optimal: boolean;
  /** when proven lost: how many positions can still be reached (a handful means the moves only go round in circles) */
  reach: number | null;
}

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, level, state } = e.data;
  let result: SolveResult;
  // BFS gives the shortest solution on small positions; it keeps whole positions, so its budget
  // is small and bigger boards go straight to the depth-first search, which answers in milliseconds
  const bfs = solveBfs(level, state, 12_000);
  if (bfs.solvable && bfs.path) result = { id, move: bfs.path[0] ?? null, solvable: true, left: bfs.path.length, optimal: true, reach: null };
  else if (bfs.exact) result = { id, move: null, solvable: false, left: 0, optimal: true, reach: bfs.states };
  else {
    // bigger positions: a depth-first search keeps only hashes and covers far more
    const dfs = solveDfs(level, state, 300_000);
    result = dfs.path
      ? { id, move: dfs.path[0] ?? null, solvable: true, left: dfs.path.length, optimal: false, reach: null }
      : { id, move: null, solvable: dfs.complete ? false : null, left: 0, optimal: false, reach: dfs.complete ? dfs.visited : null };
  }
  (self as unknown as { postMessage(m: SolveResult): void }).postMessage(result);
};
