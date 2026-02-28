import { useCallback, useEffect, useState } from "react";
import { type Tube } from "../game/types";
import {
  canPour,
  pour,
  createGameState,
  isLevelComplete,
  isTubeComplete,
  isStuck as checkStuck,
} from "../game/engine";

export function useGameState(initialTubes: Tube[]) {
  const [state, setState] = useState(() => createGameState(initialTubes));

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
      // If level is already complete, ignore taps
      if (isLevelComplete(prev.tubes)) return prev;

      // No tube selected yet — select this one (if it has liquid)
      if (prev.selectedTube === null) {
        if (prev.tubes[index]!.length === 0) return prev;
        if (isTubeComplete(prev.tubes[index]!)) return prev;
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
        const newTubes = pour(prev.tubes, from, to);

        // Combo detection
        const newCompletedCount = newTubes.filter((t) =>
          isTubeComplete(t),
        ).length;
        const justCompleted = newCompletedCount - prev.prevCompletedCount;

        let comboCounter = prev.comboCounter;
        let totalComboBonus = prev.totalComboBonus;

        if (justCompleted > 0) {
          comboCounter += justCompleted;
          for (let i = 0; i < justCompleted; i++) {
            if (comboCounter > 1) {
              totalComboBonus += comboCounter * 50;
            }
          }
        } else {
          comboCounter = 0;
        }

        return {
          ...prev,
          tubes: newTubes,
          selectedTube: null,
          moves: [...prev.moves, { from, to }],
          history: [...prev.history, prev.tubes],
          prevCompletedCount: newCompletedCount,
          comboCounter,
          totalComboBonus,
          invalidTube: null,
        };
      }

      // Invalid pour — select the new tube instead (if it has liquid and not complete)
      if (
        prev.tubes[index]!.length > 0 &&
        !isTubeComplete(prev.tubes[index]!)
      ) {
        return { ...prev, selectedTube: index, invalidTube: to };
      }

      return { ...prev, selectedTube: null, invalidTube: to };
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.history.length === 0) return prev;
      const prevTubes = prev.history[prev.history.length - 1]!;
      return {
        ...prev,
        tubes: prevTubes,
        selectedTube: null,
        moves: prev.moves.slice(0, -1),
        history: prev.history.slice(0, -1),
        undoCount: prev.undoCount + 1,
        prevCompletedCount: prevTubes.filter((t) => isTubeComplete(t)).length,
        comboCounter: 0,
        invalidTube: null,
        pourAnim: null,
      };
    });
  }, []);

  const restart = useCallback(() => {
    setState((prev) => ({
      ...createGameState(initialTubes),
      restartCount: prev.restartCount + 1,
    }));
  }, [initialTubes]);

  const levelComplete = isLevelComplete(state.tubes);
  const stuck = !levelComplete && checkStuck(state.tubes);

  return { state, selectTube, undo, restart, levelComplete, stuck };
}
