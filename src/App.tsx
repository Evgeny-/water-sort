import { useCallback, useState } from "react";
import { Game } from "./components/Game";
import { LevelSelect } from "./components/LevelSelect";
import { createLevel } from "./game/levels";
import type { Level } from "./game/types";

const STORAGE_KEY_MAX = "water-sort-max-level";

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

type Screen = { kind: "select" } | { kind: "game"; level: Level };

export default function App() {
  const [maxLevel, setMaxLevel] = useState(loadMaxLevel);
  const [screen, setScreen] = useState<Screen>({ kind: "select" });

  const startLevel = useCallback(
    (levelNumber: number) => {
      const level = createLevel(levelNumber);
      setScreen({ kind: "game", level });
    },
    [],
  );

  const handleNewLevel = useCallback(() => {
    setScreen((prev) => {
      if (prev.kind !== "game") return prev;
      const nextNum = prev.level.levelNumber + 1;
      // Unlock the next level
      setMaxLevel((m) => {
        const newMax = Math.max(m, nextNum);
        saveMaxLevel(newMax);
        return newMax;
      });
      const next = createLevel(nextNum);
      return { kind: "game", level: next };
    });
  }, []);

  const handleBack = useCallback(() => {
    setScreen({ kind: "select" });
  }, []);

  if (screen.kind === "select") {
    return <LevelSelect maxLevel={maxLevel} onSelect={startLevel} />;
  }

  return (
    <Game
      key={screen.level.levelNumber}
      initialTubes={screen.level.tubes}
      levelNumber={screen.level.levelNumber}
      par={screen.level.par}
      onNewLevel={handleNewLevel}
      onBack={handleBack}
    />
  );
}
