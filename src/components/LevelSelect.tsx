import { motion } from "framer-motion";
import type { LevelResult } from "../game/types";

interface LevelSelectProps {
  maxLevel: number;
  results: Record<string, LevelResult>;
  totalScore: number;
  onSelect: (level: number) => void;
}

const TOTAL_LEVELS = 200;

export function LevelSelect({ maxLevel, results, totalScore, onSelect }: LevelSelectProps) {
  const levels = Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Water Sort</h1>
      <p style={styles.subtitle}>Choose a level</p>
      {totalScore > 0 && (
        <p style={styles.totalScore}>Score: {totalScore}</p>
      )}

      <div style={styles.scrollArea}>
        <div style={styles.grid}>
          {levels.map((n) => {
            const isCurrent = n === maxLevel;
            const result = results[String(n)];

            return (
              <motion.button
                key={n}
                whileTap={{ scale: 0.92 }}
                onClick={() => onSelect(n)}
                style={{
                  ...styles.levelButton,
                  ...(isCurrent ? styles.current : {}),
                }}
              >
                <span>{n}</span>
                {result && (
                  <span style={styles.starsRow}>
                    {[1, 2, 3].map((s) => (
                      <span
                        key={s}
                        style={{
                          color: s <= result.stars ? "#eab308" : "#475569",
                        }}
                      >
                        ★
                      </span>
                    ))}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "20px",
    overflow: "hidden",
    minHeight: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    textAlign: "center",
    marginBottom: 4,
  },
  totalScore: {
    fontSize: 14,
    color: "#eab308",
    textAlign: "center" as const,
    marginBottom: 16,
    fontWeight: 600,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    WebkitOverflowScrolling: "touch" as const,
    minHeight: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 10,
    maxWidth: 360,
    margin: "0 auto",
    paddingBottom: 20,
  },
  levelButton: {
    aspectRatio: "1",
    borderRadius: 12,
    border: "1px solid var(--tube-glass-border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  starsRow: {
    display: "flex",
    gap: 1,
    fontSize: 10,
    lineHeight: 1,
  },
  current: {
    border: "2px solid #3b82f6",
    boxShadow: "0 0 12px rgba(59, 130, 246, 0.3)",
  },
};
