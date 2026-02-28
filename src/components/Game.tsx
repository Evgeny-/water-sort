import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IoArrowBack, IoArrowUndo, IoRefresh } from "react-icons/io5";
import { Tube } from "./Tube";
import { PourAnimationOverlay } from "./PourAnimationOverlay";
import { LevelCompleteOverlay } from "./LevelCompleteOverlay";
import { useGameState } from "../hooks/useGameState";
import { calculateScore } from "../game/scoring";
import type { ScoreBreakdown } from "../game/scoring";
import type { Tube as TubeType } from "../game/types";

const IS_DEV = import.meta.env.DEV;

// Tube pixel dimensions (must match Tube.tsx constants)
const TUBE_W = 64;
const TUBE_H = 176;
const GAP_X = 16;
const GAP_Y = 32;
// Extra vertical room for selected-tube lift + wave
const LIFT_PADDING = 28;
// Max grid width so tubes don't spread into one wide row on desktop
const MAX_GRID_W = 480;
// Horizontal padding inside the board area
const BOARD_PAD_X = 16;

interface GridLayout {
  cols: number;
  rows: number;
  scale: number;
  gridW: number; // unscaled grid width
  gridH: number; // unscaled grid height
}

/**
 * Compute the best grid layout so all tubes fill the available board area.
 * Tries different column counts and picks the one with the largest scale.
 * Returns the chosen layout so we can set explicit dimensions on the grid.
 */
function computeLayout(
  tubeCount: number,
  containerW: number,
  containerH: number,
): GridLayout {
  const fallback: GridLayout = { cols: tubeCount, rows: 1, scale: 1, gridW: 0, gridH: 0 };
  if (tubeCount === 0 || containerW <= 0 || containerH <= 0) return fallback;

  const availW = Math.min(containerW - BOARD_PAD_X * 2, MAX_GRID_W);
  const availH = containerH - LIFT_PADDING;
  let best: GridLayout = fallback;

  for (let cols = 1; cols <= tubeCount; cols++) {
    const rows = Math.ceil(tubeCount / cols);
    const gridW = cols * TUBE_W + (cols - 1) * GAP_X;
    const gridH = rows * TUBE_H + (rows - 1) * GAP_Y;
    const scaleX = availW / gridW;
    const scaleY = availH / gridH;
    const scale = Math.min(scaleX, scaleY, 1); // never zoom above 1
    if (scale > best.scale || best.gridW === 0) {
      best = { cols, rows, scale, gridW, gridH };
    }
  }

  return best;
}

interface GameProps {
  initialTubes: TubeType[];
  initialLockedMask: boolean[][];
  levelNumber: number;
  par: number;
  onNewLevel: () => void;
  onBack: () => void;
  onLevelComplete: (levelNumber: number, stars: number, score: number) => void;
}

export function Game({ initialTubes, initialLockedMask, levelNumber, par, onNewLevel, onBack, onLevelComplete }: GameProps) {
  const { state, selectTube, commitPour, finishPourAnim, undo, restart, levelComplete, stuck } =
    useGameState(initialTubes, initialLockedMask);

  const isAnimating = state.pourAnim !== null;

  const boardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tubeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState<GridLayout>({
    cols: state.tubes.length, rows: 1, scale: 1, gridW: 0, gridH: 0,
  });

  const updateLayout = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    setLayout(computeLayout(state.tubes.length, el.clientWidth, el.clientHeight));
  }, [state.tubes.length]);

  useEffect(() => {
    updateLayout();
    const ro = new ResizeObserver(updateLayout);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, [updateLayout]);

  const [devSkipResult, setDevSkipResult] = useState<ScoreBreakdown | null>(null);

  const devSkipLevel = useCallback(() => {
    const base = 100 + (levelNumber - 1) * 10;
    const finePct = Math.random() * 0.3; // 0–30%
    const totalFine = Math.round(base * finePct);
    // Split the fine randomly between efficiency loss and undo fine
    const undoFine = Math.round(totalFine * Math.random());
    const efficiency = -(totalFine - undoFine);
    const score = Math.max(0, base + efficiency - undoFine);
    const pct = base > 0 ? score / base : 0;
    const stars = pct >= 0.85 ? 3 : pct >= 0.5 ? 2 : 1;
    setDevSkipResult({ base, efficiency, undoFine, score, maxScore: base, stars });
  }, [levelNumber]);

  const scoreResult = levelComplete
    ? calculateScore(
        state.moves.length,
        par,
        state.undoCount,
        levelNumber,
      )
    : devSkipResult;

  const showComplete = levelComplete || devSkipResult !== null;

  // Report results to parent for persistence
  const reportedRef = useRef(false);
  useEffect(() => {
    if (scoreResult && showComplete && !reportedRef.current) {
      reportedRef.current = true;
      onLevelComplete(levelNumber, scoreResult.stars, scoreResult.score);
    }
  }, [scoreResult, showComplete, onLevelComplete, levelNumber]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={onBack} className="btn btn-icon">
            <IoArrowBack />
          </button>
          <span style={styles.levelLabel}>Level {levelNumber}</span>
        </div>
        <span className="score-badge">
          {state.moves.length} / {par}
        </span>
      </div>

      {/* Game board */}
      <div ref={boardRef} style={styles.board}>
        {/* Outer wrapper sized to the scaled grid so flexbox centering works */}
        <div style={{
          width: layout.gridW * layout.scale,
          height: layout.gridH * layout.scale,
        }}>
          <div ref={gridRef} style={{
            ...styles.tubesGrid,
            width: layout.gridW,
            height: layout.gridH,
            transform: `scale(${layout.scale})`,
            transformOrigin: "top left",
            position: "relative",
          }}>
            {state.tubes.map((tube, i) => {
              const isAnimSource = state.pourAnim?.fromIndex === i;

              return (
                <div
                  key={i}
                  ref={(el) => { tubeRefs.current[i] = el; }}
                  style={{ opacity: isAnimSource ? 0 : 1 }}
                >
                  <Tube
                    tube={tube}
                    selected={state.selectedTube === i}
                    invalid={state.invalidTube === i}
                    onClick={() => selectTube(i)}
                    lockedMask={state.lockedMask[i]}
                    hidden={isAnimSource}
                  />
                </div>
              );
            })}

            {/* Pour animation overlay — renders animated clone above the grid */}
            {state.pourAnim && (
              <PourAnimationOverlay
                anim={state.pourAnim}
                gridRef={gridRef}
                tubeRefs={tubeRefs}
                onPour={commitPour}
                onFinished={finishPourAnim}
              />
            )}
          </div>
        </div>
      </div>

      {/* Stuck banner */}
      <AnimatePresence>
        {stuck && (
          <motion.div
            className="stuck-banner"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={styles.stuckBanner}
          >
            No valid moves! Try undo or restart.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          onClick={undo}
          className="btn btn-control"
          disabled={state.moves.length === 0 || showComplete || isAnimating}
        >
          <IoArrowUndo /> Undo
        </button>
        <button
          onClick={restart}
          className="btn btn-control"
          disabled={state.moves.length === 0 || showComplete || isAnimating}
        >
          <IoRefresh /> Restart
        </button>
        {IS_DEV && !showComplete && (
          <button onClick={devSkipLevel} className="btn btn-control" style={{ opacity: 0.5, fontSize: 11 }}>
            Skip
          </button>
        )}
      </div>

      {/* Level complete overlay */}
      <AnimatePresence>
        {showComplete && scoreResult && (
          <LevelCompleteOverlay
            scoreResult={scoreResult}
            par={par}
            moves={state.moves.length}
            onNewLevel={onNewLevel}
            onRetry={restart}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  levelLabel: {
    fontSize: 20,
    fontWeight: 700,
  },
  board: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: `0 ${BOARD_PAD_X}px`,
    overflow: "hidden",
  },
  tubesGrid: {
    display: "flex",
    gap: GAP_X,
    flexWrap: "wrap" as const,
    justifyContent: "center",
    alignContent: "center",
    rowGap: GAP_Y,
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    padding: "20px",
  },
  stuckBanner: {
    textAlign: "center" as const,
    padding: "10px 20px",
    margin: "0 20px",
    color: "#f87171",
    fontSize: 14,
    fontWeight: 500,
  },
};
