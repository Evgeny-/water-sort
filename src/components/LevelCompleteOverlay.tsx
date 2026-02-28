import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { IoRefresh } from "react-icons/io5";
import { ConfettiEffect } from "./ConfettiEffect";
import { ScoreDonut } from "./ScoreDonut";
import type { ScoreBreakdown } from "../game/scoring";

interface LevelCompleteOverlayProps {
  scoreResult: ScoreBreakdown;
  par: number;
  moves: number;
  onNewLevel: () => void;
  onRetry: () => void;
}

export function LevelCompleteOverlay({
  scoreResult,
  par,
  moves,
  onNewLevel,
  onRetry,
}: LevelCompleteOverlayProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const handleFillComplete = useCallback(() => {
    setShowBreakdown(true);
  }, []);

  // Build the score breakdown lines
  const breakdownLines: { label: string; value: string; color?: string }[] = [
    { label: "Moves", value: `${moves} / ${par}` },
    { label: "Base", value: `${scoreResult.base}` },
  ];
  if (scoreResult.efficiency !== 0) {
    breakdownLines.push({
      label: "Efficiency",
      value: `${scoreResult.efficiency > 0 ? "+" : ""}${scoreResult.efficiency}`,
      color: scoreResult.efficiency > 0 ? "#22c55e" : "#f87171",
    });
  }
  if (scoreResult.undoFine > 0) {
    breakdownLines.push({
      label: "Undo fine",
      value: `-${scoreResult.undoFine}`,
      color: "#f87171",
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.overlay}
    >
      {/* Confetti burst */}
      <ConfettiEffect />

      {/* Celebration card */}
      <motion.div
        className="complete-card"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
          delay: 0.3,
        }}
        style={styles.card}
      >
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Level Complete!</h2>

        {/* Animated score donut with stars */}
        <ScoreDonut
          score={scoreResult.score}
          referenceMax={scoreResult.maxScore}
          stars={scoreResult.stars}
          onFillComplete={handleFillComplete}
          startDelay={0.5}
        />

        {/* Score breakdown — revealed after donut fills */}
        <div style={{ ...styles.scoreSection, opacity: showBreakdown ? 1 : 0 }}>
          {breakdownLines.map((line, i) => (
            <motion.div
              key={line.label}
              initial={{ opacity: 0, y: 10 }}
              animate={showBreakdown ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.25, delay: i * 0.1 }}
              style={styles.scoreLine}
            >
              <span>{line.label}</span>
              <span style={line.color ? { color: line.color } : undefined}>
                {line.value}
              </span>
            </motion.div>
          ))}

          {/* Total score line */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={showBreakdown ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.25,
              delay: breakdownLines.length * 0.1,
            }}
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
          </motion.div>
        </div>

        {/* Buttons — appear after breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={showBreakdown ? { opacity: 1, y: 0 } : {}}
          transition={{
            duration: 0.3,
            delay: (breakdownLines.length + 1) * 0.1 + 0.1,
          }}
          style={styles.buttons}
        >
          <button onClick={onRetry} className="btn btn-control">
            <IoRefresh /> Retry
          </button>
          <button onClick={onNewLevel} className="btn btn-primary">
            Next Level
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(15, 23, 42, 0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  card: {
    padding: "28px 36px",
    textAlign: "center",
    minWidth: 280,
    maxWidth: 340,
  },
  scoreSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 20,
    textAlign: "left",
    fontSize: 14,
    color: "var(--text-secondary)",
    transition: "opacity 0.2s",
  },
  scoreLine: {
    display: "flex",
    justifyContent: "space-between",
  },
  buttons: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
  },
};
