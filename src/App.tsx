import { useCallback, useEffect, useMemo, useState } from "react";
import { Game } from "./components/Game";
import { LevelSelect } from "./components/LevelSelect";
import { WorldBackground } from "./backgrounds/WorldBackground";
import { createLevel } from "./game/levels";
import { audioManager } from "./audio/audioManager";
import type { Level, LevelResult } from "./game/types";

const STORAGE_KEY_MAX = "water-sort-max-level";
const STORAGE_KEY_RESULTS = "water-sort-results";
const STORAGE_KEY_SPENT = "water-sort-spent-score";

function loadMaxLevel(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MAX);
    if (stored) {
      const n = parseInt(stored, 10);
      if (n > 0 && Number.isFinite(n)) return n;
    }
  } catch {
    // localStorage unavailable
  }
  return 1;
}

function saveMaxLevel(level: number) {
  try {
    const current = loadMaxLevel();
    if (level > current) {
      localStorage.setItem(STORAGE_KEY_MAX, String(level));
    }
  } catch {
    // localStorage unavailable
  }
}

function loadResults(): Record<string, LevelResult> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_RESULTS);
    if (stored) return JSON.parse(stored);
  } catch {
    // localStorage unavailable or corrupt
  }
  return {};
}

type Screen = { kind: "select" } | { kind: "loading"; levelNumber: number } | { kind: "game"; level: Level };

export default function App() {
  const [maxLevel, setMaxLevel] = useState(loadMaxLevel);
  const [screen, setScreen] = useState<Screen>({ kind: "select" });
  const [results, setResults] = useState(loadResults);
  const [spentScore, setSpentScore] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SPENT);
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch { return 0; }
  });

  const earnedScore = useMemo(
    () => Object.values(results).reduce((sum, r) => sum + r.score, 0),
    [results],
  );

  const totalScore = earnedScore - spentScore;

  const spendScore = useCallback((amount: number) => {
    setSpentScore((prev) => {
      const next = prev + amount;
      try { localStorage.setItem(STORAGE_KEY_SPENT, String(next)); } catch {}
      return next;
    });
  }, []);

  const handleLevelComplete = useCallback(
    (levelNumber: number, stars: number, score: number) => {
      setResults((prev) => {
        const key = String(levelNumber);
        const existing = prev[key];
        if (existing && existing.stars > stars) return prev;
        if (existing && existing.stars === stars && existing.score >= score) return prev;
        const next = { ...prev, [key]: { stars, score } };
        try {
          localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(next));
        } catch {
          // localStorage unavailable
        }
        return next;
      });
      // Unlock the next level when this one is completed
      const nextLevel = levelNumber + 1;
      setMaxLevel((m) => {
        const newMax = Math.max(m, nextLevel);
        saveMaxLevel(newMax);
        return newMax;
      });
    },
    [],
  );

  const startLevel = useCallback(
    (levelNumber: number) => {
      // Show loading state, then generate level off the current frame
      setScreen({ kind: "loading", levelNumber });
      setTimeout(() => {
        const level = createLevel(levelNumber);
        setScreen({ kind: "game", level });
      }, 0);
    },
    [],
  );

  const handleNewLevel = useCallback(() => {
    setScreen((prev) => {
      if (prev.kind !== "game") return prev;
      const nextNum = prev.level.levelNumber + 1;
      return { kind: "loading", levelNumber: nextNum };
    });
    // Defer level generation to next frame
    setTimeout(() => {
      setScreen((prev) => {
        if (prev.kind !== "loading") return prev;
        const level = createLevel(prev.levelNumber);
        return { kind: "game", level };
      });
    }, 0);
  }, []);

  const handleBack = useCallback(() => {
    setScreen({ kind: "select" });
  }, []);

  // Initialize audio on first user interaction (required for iOS)
  useEffect(() => {
    const handleFirstInteraction = () => {
      audioManager.ensureContext();
    };
    document.addEventListener("touchstart", handleFirstInteraction, { once: true });
    document.addEventListener("click", handleFirstInteraction, { once: true });
    return () => {
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("click", handleFirstInteraction);
    };
  }, []);

  const currentLevel =
    screen.kind === "game"
      ? screen.level.levelNumber
      : screen.kind === "loading"
        ? screen.levelNumber
        : maxLevel;

  return (
    <>
      <WorldBackground levelNumber={currentLevel} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0 }}>
        {screen.kind === "select" ? (
          <LevelSelect maxLevel={maxLevel} results={results} totalScore={totalScore} onSelect={startLevel} />
        ) : screen.kind === "loading" ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text-secondary)" }}>
              Loading level {screen.levelNumber}...
            </span>
          </div>
        ) : (
          <Game
            key={screen.level.levelNumber}
            initialTubes={screen.level.tubes}
            initialLockedMask={screen.level.lockedMask}
            levelNumber={screen.level.levelNumber}
            par={screen.level.par}
            paidTubes={screen.level.paidTubes}
            tubeCost={screen.level.tubeCost}
            totalScore={totalScore}
            onSpendScore={spendScore}
            onNewLevel={handleNewLevel}
            onBack={handleBack}
            onLevelComplete={handleLevelComplete}
          />
        )}
      </div>
    </>
  );
}
