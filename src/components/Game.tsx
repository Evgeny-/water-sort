import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tube } from "./Tube";
import { PourAnimationOverlay } from "./PourAnimationOverlay";
import { useGameState } from "../hooks/useGameState";
import { calculateScore } from "../game/scoring";
import type { Tube as TubeType } from "../game/types";

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

  const scoreResult = levelComplete
    ? calculateScore(
        state.moves.length,
        par,
        state.undoCount,
        state.restartCount,
        state.totalComboBonus,
      )
    : null;

  // Report results to parent for persistence
  const reportedRef = useRef(false);
  useEffect(() => {
    if (scoreResult && !reportedRef.current) {
      reportedRef.current = true;
      onLevelComplete(levelNumber, scoreResult.stars, scoreResult.score);
    }
  }, [scoreResult, onLevelComplete, levelNumber]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={onBack} style={styles.backButton}>
            ←
          </button>
          <span style={styles.levelLabel}>Level {levelNumber}</span>
        </div>
        <span style={styles.moveCount}>
          Moves: {state.moves.length} / Par: {par}
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
          style={styles.button}
          disabled={state.moves.length === 0 || levelComplete || isAnimating}
        >
          ↩ Undo
        </button>
        <button
          onClick={restart}
          style={styles.button}
          disabled={state.moves.length === 0 || levelComplete || isAnimating}
        >
          ↻ Restart
        </button>
      </div>

      {/* Level complete overlay */}
      <AnimatePresence>
        {levelComplete && scoreResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.overlay}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                delay: 0.2,
              }}
              style={styles.completeCard}
            >
              <h2 style={{ fontSize: 28, marginBottom: 4 }}>
                Level Complete!
              </h2>

              {/* Stars */}
              <div style={styles.stars}>
                {[1, 2, 3].map((n) => (
                  <motion.span
                    key={n}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 15,
                      delay: 0.3 + n * 0.15,
                    }}
                    style={{
                      fontSize: 36,
                      filter:
                        n <= scoreResult.stars
                          ? "none"
                          : "grayscale(1) opacity(0.3)",
                    }}
                  >
                    ★
                  </motion.span>
                ))}
              </div>

              {/* Score breakdown */}
              <div style={styles.scoreSection}>
                <div style={styles.scoreLine}>
                  <span>Moves</span>
                  <span>
                    {state.moves.length} / {par}
                  </span>
                </div>
                <div style={styles.scoreLine}>
                  <span>Base</span>
                  <span>{scoreResult.base}</span>
                </div>
                {scoreResult.efficiency !== 0 && (
                  <div style={styles.scoreLine}>
                    <span>Efficiency</span>
                    <span
                      style={{
                        color:
                          scoreResult.efficiency > 0 ? "#22c55e" : "#f87171",
                      }}
                    >
                      {scoreResult.efficiency > 0 ? "+" : ""}
                      {scoreResult.efficiency}
                    </span>
                  </div>
                )}
                {scoreResult.comboBonus > 0 && (
                  <div style={styles.scoreLine}>
                    <span>Combos</span>
                    <span style={{ color: "#22c55e" }}>
                      +{scoreResult.comboBonus}
                    </span>
                  </div>
                )}
                {scoreResult.undoMultiplier > 1 && (
                  <div style={styles.scoreLine}>
                    <span>No undo bonus</span>
                    <span style={{ color: "#22c55e" }}>x1.5</span>
                  </div>
                )}
                {scoreResult.restartMultiplier > 1 && (
                  <div style={styles.scoreLine}>
                    <span>No restart bonus</span>
                    <span style={{ color: "#22c55e" }}>x1.2</span>
                  </div>
                )}
                <div
                  style={{
                    ...styles.scoreLine,
                    borderTop: "1px solid var(--tube-glass-border)",
                    paddingTop: 8,
                    marginTop: 4,
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  <span>Score</span>
                  <span>{scoreResult.score}</span>
                </div>
              </div>

              <button onClick={onNewLevel} style={styles.nextButton}>
                Next Level
              </button>
            </motion.div>
          </motion.div>
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
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid var(--tube-glass-border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 18,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  levelLabel: {
    fontSize: 20,
    fontWeight: 700,
  },
  moveCount: {
    fontSize: 14,
    color: "var(--text-secondary)",
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
  button: {
    padding: "12px 24px",
    borderRadius: 12,
    border: "1px solid var(--tube-glass-border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 16,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.2s",
  },
  stuckBanner: {
    textAlign: "center" as const,
    padding: "10px 20px",
    margin: "0 20px",
    borderRadius: 12,
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#f87171",
    fontSize: 14,
    fontWeight: 500,
  },
  overlay: {
    position: "absolute" as const,
    inset: 0,
    background: "rgba(15, 23, 42, 0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  completeCard: {
    background: "var(--bg-secondary)",
    borderRadius: 20,
    padding: "28px 36px",
    textAlign: "center" as const,
    border: "1px solid var(--tube-glass-border)",
    minWidth: 280,
  },
  stars: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    margin: "12px 0 16px",
    color: "#eab308",
  },
  scoreSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    marginBottom: 20,
    textAlign: "left" as const,
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  scoreLine: {
    display: "flex",
    justifyContent: "space-between",
  },
  nextButton: {
    padding: "12px 32px",
    borderRadius: 12,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
