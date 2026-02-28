import { useCallback, useEffect, useMemo, useState } from "react";
import { type Tube, TUBE_CAPACITY } from "../game/types";
import {
  canPour,
  pour,
  topColor,
  topCount,
  createGameState,
  isLevelComplete,
  isTubeComplete,
  getValidMoves,
  revealTopSegments,
} from "../game/engine";

export function useGameState(initialTubes: Tube[], initialLockedMask: boolean[][]) {
  const [state, setState] = useState(() => createGameState(initialTubes, initialLockedMask));

  // Auto-clear invalid tube shake after 500ms
  useEffect(() => {
    if (state.invalidTube === null) return;
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, invalidTube: null }));
    }, 500);
    return () => clearTimeout(timer);
  }, [state.invalidTube]);

  const selectTube = useCallback((index: number) => {
    setState((prev) => {
      // Block all taps while pour animation is playing
      if (prev.pourAnim) return prev;

      // If level is already complete, ignore taps
      if (isLevelComplete(prev.tubes, prev.lockedMask)) return prev;

      // No tube selected yet — select this one (if it has liquid)
      if (prev.selectedTube === null) {
        if (prev.tubes[index]!.length === 0) return prev;
        if (isTubeComplete(prev.tubes[index]!, prev.lockedMask[index])) return prev;
        return { ...prev, selectedTube: index };
      }

      // Tapped the same tube — deselect
      if (prev.selectedTube === index) {
        return { ...prev, selectedTube: null };
      }

      // Try to pour from selected to tapped
      const from = prev.selectedTube;
      const to = index;
      if (canPour(prev.tubes[from]!, prev.tubes[to]!)) {
        // Phase 1: start animation — don't commit the pour yet
        const source = prev.tubes[from]!;
        const color = topColor(source)!;
        const count = Math.min(
          topCount(source, prev.lockedMask[from]),
          TUBE_CAPACITY - prev.tubes[to]!.length,
        );

        return {
          ...prev,
          selectedTube: null,
          invalidTube: null,
          pourAnim: {
            fromIndex: from,
            toIndex: to,
            color,
            count,
            sourceTubeBefore: [...source],
            sourceLockedBefore: [...prev.lockedMask[from]!],
            destTubeLength: prev.tubes[to]!.length,
          },
        };
      }

      // Invalid pour — select the new tube instead (if it has liquid and not complete)
      if (
        prev.tubes[index]!.length > 0 &&
        !isTubeComplete(prev.tubes[index]!, prev.lockedMask[index])
      ) {
        return { ...prev, selectedTube: index, invalidTube: null };
      }

      return { ...prev, selectedTube: null, invalidTube: to };
    });
  }, []);

  // Phase 2a: commit tube state when tilt starts (keeps pourAnim alive for overlay)
  const commitPour = useCallback(() => {
    setState((prev) => {
      if (!prev.pourAnim) return prev;
      const { fromIndex, toIndex } = prev.pourAnim;
      const newTubes = pour(prev.tubes, fromIndex, toIndex, prev.lockedMask);

      // Reveal newly exposed top segments — only source and dest changed
      const newLockedMask = revealTopSegments(prev.lockedMask, newTubes, [fromIndex, toIndex]);

      return {
        ...prev,
        tubes: newTubes,
        selectedTube: null,
        // pourAnim stays non-null so overlay remains mounted
        moves: [...prev.moves, { from: fromIndex, to: toIndex }],
        history: [...prev.history, prev.tubes],
        lockedMaskHistory: [...prev.lockedMaskHistory, prev.lockedMask],
        invalidTube: null,
        lockedMask: newLockedMask,
      };
    });
  }, []);

  // Phase 2b: clear animation overlay after return animation finishes
  const finishPourAnim = useCallback(() => {
    setState((prev) => ({ ...prev, pourAnim: null }));
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.history.length === 0) return prev;
      const prevTubes = prev.history[prev.history.length - 1]!;
      const prevLockedMask = prev.lockedMaskHistory[prev.lockedMaskHistory.length - 1]!;
      return {
        ...prev,
        tubes: prevTubes,
        selectedTube: null,
        moves: prev.moves.slice(0, -1),
        history: prev.history.slice(0, -1),
        lockedMaskHistory: prev.lockedMaskHistory.slice(0, -1),
        undoCount: prev.undoCount + 1,
        invalidTube: null,
        pourAnim: null,
        lockedMask: prevLockedMask,
      };
    });
  }, []);

  const unlockPaidTube = useCallback((index: number) => {
    setState((prev) => {
      if (prev.unlockedPaidTubes.has(index)) return prev;
      const next = new Set(prev.unlockedPaidTubes);
      next.add(index);
      return { ...prev, unlockedPaidTubes: next };
    });
  }, []);

  const levelComplete = useMemo(
    () => isLevelComplete(state.tubes, state.lockedMask),
    [state.tubes, state.lockedMask],
  );
  // Skip stuck check during pour animation — player can't act anyway
  const stuck = useMemo(
    () => !levelComplete && !state.pourAnim && getValidMoves(state.tubes, state.lockedMask).length === 0,
    [levelComplete, state.pourAnim, state.tubes, state.lockedMask],
  );

  return { state, selectTube, unlockPaidTube, commitPour, finishPourAnim, undo, levelComplete, stuck };
}
