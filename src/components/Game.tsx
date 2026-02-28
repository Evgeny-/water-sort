import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tube } from "./Tube";
import { useGameState } from "../hooks/useGameState";
import { calculateScore } from "../game/scoring";
import type { Tube as TubeType } from "../game/types";

/** Compute a CSS scale factor so all tubes fit on one screen */
function getTubeScale(tubeCount: number): number {
  if (tubeCount <= 10) return 1;
  if (tubeCount <= 14) return 0.82;
  if (tubeCount <= 20) return 0.68;
  if (tubeCount <= 28) return 0.55;
  if (tubeCount <= 38) return 0.46;
  return 0.4;
}

interface GameProps {
  initialTubes: TubeType[];
  levelNumber: number;
  par: number;
  onNewLevel: () => void;
  onBack: () => void;
}

export function Game({ initialTubes, levelNumber, par, onNewLevel, onBack }: GameProps) {
  const { state, selectTube, undo, restart, levelComplete, stuck } =
    useGameState(initialTubes);

  const scale = useMemo(() => getTubeScale(state.tubes.length), [state.tubes.length]);

  const scoreResult = levelComplete
    ? calculateScore(
        state.moves.length,
        par,
        state.undoCount,
        state.restartCount,
        state.totalComboBonus,
      )
    : null;

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
      <div style={styles.board}>
        <div style={{
          ...styles.tubesGrid,
          zoom: scale,
        }}>
          {state.tubes.map((tube, i) => (
            <Tube
              key={i}
              tube={tube}
              selected={state.selectedTube === i}
              invalid={state.invalidTube === i}
              onClick={() => selectTube(i)}
            />
          ))}
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
          disabled={state.moves.length === 0 || levelComplete}
        >
          ↩ Undo
        </button>
        <button
          onClick={restart}
          style={styles.button}
          disabled={state.moves.length === 0 || levelComplete}
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
    padding: "0 12px",
    overflow: "visible",
  },
  tubesGrid: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    justifyContent: "center",
    alignContent: "center",
    maxWidth: 600,
    rowGap: 28,
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
