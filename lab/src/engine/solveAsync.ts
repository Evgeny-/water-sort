import SolverWorker from "./solver.worker?worker&inline";
import type { SolveResult } from "./solver.worker";
import type { LevelDef, State } from "./types";

export type { SolveResult };

let worker: Worker | null = null;
let inflight: { id: number; resolve: (r: SolveResult | null) => void } | null = null;
let nextId = 1;

function spawn() {
  const w = new SolverWorker();
  w.onmessage = (e: MessageEvent<SolveResult>) => {
    if (inflight?.id !== e.data.id) return;
    const { resolve } = inflight;
    inflight = null;
    resolve(e.data);
  };
  return w;
}

/**
 * Solve a position in a background worker. Only the latest position matters:
 * a new request stops the one in flight, which then resolves to null.
 */
export function solveAsync(level: LevelDef, state: State): Promise<SolveResult | null> {
  if (inflight) {
    worker?.terminate();
    worker = null;
    inflight.resolve(null);
    inflight = null;
  }
  worker ??= spawn();
  const id = nextId++;
  return new Promise((resolve) => {
    inflight = { id, resolve };
    worker!.postMessage({ id, level, state });
  });
}
