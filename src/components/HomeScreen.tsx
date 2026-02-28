import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IoStar, IoDownloadOutline, IoPlay, IoChevronDown, IoRefresh } from "react-icons/io5";
import type { LevelResult } from "../game/types";
import { audioManager } from "../audio/audioManager";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

interface HomeScreenProps {
  maxLevel: number;
  results: Record<string, LevelResult>;
  totalScore: number;
  onSelect: (level: number) => void;
}

const LevelPill = memo(function LevelPill({
  n,
  result,
  isSelected,
  onSelect,
}: {
  n: number;
  result: LevelResult;
  isSelected: boolean;
  onSelect: (level: number) => void;
}) {
  return (
    <button
      className={`btn level-pill${isSelected ? " level-pill-selected" : ""}`}
      onClick={() => {
        audioManager.playButtonClick();
        onSelect(n);
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{n}</span>
      <span style={pillStarsStyle}>
        {[1, 2, 3].map((s) => (
          <IoStar
            key={s}
            style={{
              color: s <= result.stars ? "#eab308" : "#475569",
              fontSize: 8,
            }}
          />
        ))}
      </span>
    </button>
  );
});

const pillStarsStyle: React.CSSProperties = {
  display: "flex",
  gap: 1,
  lineHeight: 1,
};

export function HomeScreen({
  maxLevel,
  results,
  totalScore,
  onSelect,
}: HomeScreenProps) {
  const { canInstall, install } = useInstallPrompt();
  const [showPrevious, setShowPrevious] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  // The "current" level = first uncompleted level up to maxLevel
  const currentLevel = useMemo(() => {
    for (let i = 1; i <= maxLevel; i++) {
      if (!results[String(i)]) return i;
    }
    return maxLevel;
  }, [maxLevel, results]);

  // Completed levels for the "Previous Levels" section
  const completedLevels = useMemo(() => {
    const levels: number[] = [];
    for (let i = 1; i <= maxLevel; i++) {
      if (results[String(i)]) levels.push(i);
    }
    return levels;
  }, [maxLevel, results]);

  // The level shown in the hero card
  const heroLevel = selectedLevel ?? currentLevel;
  const heroResult = results[String(heroLevel)];
  const isReplay = heroLevel !== currentLevel || !!heroResult;

  const handlePlay = () => {
    audioManager.playButtonClick();
    onSelect(heroLevel);
  };

  const handlePillSelect = (level: number) => {
    if (level === currentLevel && !results[String(level)]) {
      setSelectedLevel(null);
    } else {
      setSelectedLevel(level);
    }
  };

  return (
    <div style={styles.container}>
      {/* Logo */}
      <img
        src={`${import.meta.env.BASE_URL}logo-wide.png`}
        alt="Water Sort Puzzle"
        style={styles.logo}
      />

      {/* Score badge */}
      {totalScore > 0 && (
        <p className="score-badge" style={styles.scoreBadge}>
          <IoStar /> {totalScore}
        </p>
      )}

      {/* Top spacer — pushes hero card to center */}
      <div style={{ flex: 1 }} />

      {/* Hero card */}
      <div style={{ ...styles.heroArea, marginTop: -50 }}>
        <motion.div
          className="complete-card"
          style={styles.heroCard}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          key={heroLevel}
        >
          <span style={styles.heroLabel}>
            Level {heroLevel}
          </span>

          {heroResult && (
            <span style={styles.heroStars}>
              {[1, 2, 3].map((s) => (
                <IoStar
                  key={s}
                  style={{
                    color: s <= heroResult.stars ? "#eab308" : "#475569",
                    fontSize: 20,
                  }}
                />
              ))}
            </span>
          )}

          <motion.button
            className="btn btn-primary"
            style={styles.playButton}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlay}
          >
            {isReplay ? (
              <>
                <IoRefresh style={{ fontSize: 20 }} /> Retry
              </>
            ) : (
              <>
                <IoPlay style={{ fontSize: 20 }} /> Play
              </>
            )}
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom spacer — mirrors top spacer for centering */}
      <div style={{ flex: 1 }} />

      {/* Previous Levels */}
      {completedLevels.length > 0 && (
        <div style={styles.previousSection}>
          <button
            style={styles.previousToggle}
            onClick={() => {
              audioManager.playButtonClick();
              setShowPrevious((v) => !v);
            }}
          >
            <span>Previous Levels</span>
            <motion.span
              animate={{ rotate: showPrevious ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex", alignItems: "center" }}
            >
              <IoChevronDown />
            </motion.span>
          </button>

          <AnimatePresence>
            {showPrevious && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{ overflow: "hidden" }}
              >
                <div style={styles.pillGrid}>
                  {completedLevels.map((n) => (
                    <LevelPill
                      key={n}
                      n={n}
                      result={results[String(n)]!}
                      isSelected={selectedLevel === n}
                      onSelect={handlePillSelect}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Install button */}
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
    overflowY: "auto" as const,
    minHeight: 0,
  },
  logo: {
    display: "block",
    maxWidth: 240,
    width: "60%",
    aspectRatio: "600 / 218",
    margin: "20px 0 10px",
  },
  scoreBadge: {
    textAlign: "center" as const,
    marginBottom: 0,
  },
  heroArea: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  heroCard: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 16,
    padding: "32px 48px",
    width: "100%",
    maxWidth: 300,
  },
  heroLabel: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.5,
    color: "#f8fafc",
  },
  heroStars: {
    display: "flex",
    gap: 6,
  },
  playButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 48px",
    fontSize: 18,
    fontWeight: 600,
    marginTop: 4,
  },
  previousSection: {
    width: "100%",
    maxWidth: 360,
  },
  previousToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "10px 0",
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pillGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 8,
    padding: "8px 0 16px",
  },
  installBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    padding: "8px 20px",
    fontSize: 14,
    borderRadius: 20,
    background: "rgba(41, 121, 229, 0.25)",
    border: "1px solid rgba(41, 121, 229, 0.5)",
    color: "#93c5fd",
    cursor: "pointer",
  },
};
