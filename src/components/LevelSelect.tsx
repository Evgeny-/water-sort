import { memo } from "react";
import { motion } from "framer-motion";
import { IoStar, IoDownloadOutline } from "react-icons/io5";
import type { LevelResult } from "../game/types";
import { audioManager } from "../audio/audioManager";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

interface LevelSelectProps {
  maxLevel: number;
  results: Record<string, LevelResult>;
  totalScore: number;
  onSelect: (level: number) => void;
}

const TOTAL_LEVELS = 200;
const levels = Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1);

const LevelButton = memo(function LevelButton({
  n,
  result,
  isCurrent,
  onSelect,
}: {
  n: number;
  result: LevelResult | undefined;
  isCurrent: boolean;
  onSelect: (level: number) => void;
}) {
  return (
    <button
      className={`btn btn-level${isCurrent ? " current" : ""}`}
      onClick={() => {
        audioManager.playButtonClick();
        onSelect(n);
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
              <IoStar />
            </span>
          ))}
        </span>
      )}
    </button>
  );
});

export function LevelSelect({
  maxLevel,
  results,
  totalScore,
  onSelect,
}: LevelSelectProps) {
  const { canInstall, install } = useInstallPrompt();

  return (
    <div style={styles.container}>
      <img
        src={`${import.meta.env.BASE_URL}logo-wide.png`}
        alt="Water Sort Puzzle"
        style={styles.logo}
      />
      {totalScore > 0 && (
        <p className="score-badge" style={styles.totalScore}>
          <IoStar /> {totalScore}
        </p>
      )}
      {canInstall && (
        <motion.button
          className="btn"
          style={styles.installBtn}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            audioManager.playButtonClick();
            install();
          }}
        >
          <IoDownloadOutline style={{ fontSize: 18 }} /> Install App
        </motion.button>
      )}

      <div style={styles.scrollArea}>
        <div style={styles.grid}>
          {levels.map((n) => {
            const result = results[String(n)];
            const isUnlocked = n <= maxLevel;
            const isCurrent = isUnlocked && !result;

            return (
              <LevelButton
                key={n}
                n={n}
                result={result}
                isCurrent={isCurrent}
                onSelect={onSelect}
              />
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
  logo: {
    display: "block",
    maxWidth: 240,
    width: "60%",
    height: "auto",
    margin: "0 auto 6px",
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
  installBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 auto 12px",
    padding: "8px 20px",
    fontSize: 14,
    borderRadius: 20,
    background: "rgba(41, 121, 229, 0.25)",
    border: "1px solid rgba(41, 121, 229, 0.5)",
    color: "#93c5fd",
    cursor: "pointer",
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
