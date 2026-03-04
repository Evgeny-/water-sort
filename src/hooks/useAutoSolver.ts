import { useCallback, useEffect, useRef, useState } from "react";
import { solvePath } from "../game/solver";
import type { Move, Tube } from "../game/types";

const BETWEEN_MOVES_MS = 500;
const TAP_GAP_MS = 100;
const RETRY_MS = 200;

interface UseAutoSolverOpts {
  tubes: Tube[];
  lockedMask: boolean[][];
  pourAnim: unknown;
  selectedTube: number | null;
  levelComplete: boolean;
  selectTube: (index: number) => void;
  /** Indices of tubes that are not rendered (paid locked) */
  excludeIndices: Set<number>;
}

export function useAutoSolver({
  tubes,
  lockedMask,
  pourAnim,
  selectedTube,
  levelComplete,
  selectTube,
  excludeIndices,
}: UseAutoSolverOpts) {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const movesRef = useRef<Move[]>([]);
  const moveIndexRef = useRef(0);

  const tubesRef = useRef(tubes);
  const lockedMaskRef = useRef(lockedMask);
  const pourAnimRef = useRef(pourAnim);
  const selectedTubeRef = useRef(selectedTube);
  const levelCompleteRef = useRef(levelComplete);
  const selectTubeRef = useRef(selectTube);
  const excludeRef = useRef(excludeIndices);
  tubesRef.current = tubes;
  lockedMaskRef.current = lockedMask;
  pourAnimRef.current = pourAnim;
  selectedTubeRef.current = selectedTube;
  levelCompleteRef.current = levelComplete;
  selectTubeRef.current = selectTube;
  excludeRef.current = excludeIndices;

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  }, []);

  const whenIdle = useCallback((fn: () => void) => {
    function check() {
      if (!runningRef.current) return;
      if (pourAnimRef.current || selectedTubeRef.current !== null) {
        addTimer(check, RETRY_MS);
        return;
      }
      fn();
    }
    check();
  }, [addTimer]);

  const replan = useCallback(() => {
    const result = solvePath(tubesRef.current, excludeRef.current);
    if (result && result.solvable && result.moves.length > 0) {
      movesRef.current = result.moves;
      moveIndexRef.current = 0;
      return true;
    }
    return false;
  }, []);

  const doNextMove = useCallback(() => {
    if (!runningRef.current) return;
    if (levelCompleteRef.current) {
      runningRef.current = false;
      setRunning(false);
      return;
    }

    whenIdle(() => {
      if (!runningRef.current) return;
      if (levelCompleteRef.current) {
        runningRef.current = false;
        setRunning(false);
        return;
      }

      // If we've exhausted the current plan, re-solve from current state
      // (locked segments may have revealed new info)
      if (moveIndexRef.current >= movesRef.current.length) {
        if (!replan()) {
          runningRef.current = false;
          setRunning(false);
          return;
        }
      }

      const move = movesRef.current[moveIndexRef.current]!;
      moveIndexRef.current++;

      selectTubeRef.current(move.from);

      addTimer(() => {
        if (!runningRef.current) return;

        if (pourAnimRef.current) {
          // Animation started unexpectedly, wait for idle then continue
          whenIdle(() => doNextMove());
          return;
        }

        if (selectedTubeRef.current !== move.from) {
          // Source didn't select (maybe it's now complete/empty), replan
          movesRef.current = [];
          moveIndexRef.current = 0;
          whenIdle(() => doNextMove());
          return;
        }

        selectTubeRef.current(move.to);

        addTimer(() => {
          whenIdle(() => {
            addTimer(doNextMove, BETWEEN_MOVES_MS);
          });
        }, 100);
      }, TAP_GAP_MS);
    });
  }, [whenIdle, addTimer, replan]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    clearTimers();
  }, [clearTimers]);

  const toggle = useCallback(() => {
    if (runningRef.current) {
      stop();
    } else {
      // Solve from current state
      if (!replan()) {
        // Can't solve — don't start
        return;
      }
      runningRef.current = true;
      setRunning(true);
      doNextMove();
    }
  }, [stop, doNextMove, replan]);

  useEffect(() => {
    if (levelComplete && runningRef.current) stop();
  }, [levelComplete, stop]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  return { running, stop, toggle };
}
