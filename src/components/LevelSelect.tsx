import { motion } from "framer-motion";
import { IoStar } from "react-icons/io5";
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
      <h1 className="game-title" style={styles.title}>Water Sort</h1>
      <p style={styles.subtitle}>Choose a level</p>
      {totalScore > 0 && (
        <p className="score-badge" style={styles.totalScore}><IoStar /> {totalScore}</p>
      )}

      <div style={styles.scrollArea}>
        <div style={styles.grid}>
          {levels.map((n) => {
            const result = results[String(n)];
            const isUnlocked = n <= maxLevel;
            const isCurrent = isUnlocked && !result;

            return (
              <motion.button
                key={n}
                className={`btn btn-level${isCurrent ? " current" : ""}`}
                whileTap={{ scale: 0.92 }}
                onClick={() => onSelect(n)}
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
                        <IoStar />
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
    textAlign: "center" as const,
    marginBottom: 16,
    margin: "0 auto 16px",
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
  starsRow: {
    display: "flex",
    gap: 1,
    fontSize: 10,
    lineHeight: 1,
  },
};
