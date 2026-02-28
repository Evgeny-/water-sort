import { type Tube, type Level, TUBE_CAPACITY, COLOR_KEYS } from "./types";
import { isLevelComplete } from "./engine";
import { solve } from "./solver";

interface DifficultyParams {
  colors: number;
  tubesPerColor: number;
  emptyTubes: number;
}

/** Difficulty curve: fewer colors, more tubes per color for more bottles */
function getDifficulty(levelNumber: number): DifficultyParams {
  if (levelNumber <= 3) return { colors: 3, tubesPerColor: 2, emptyTubes: 2 };
  if (levelNumber <= 10) return { colors: 4, tubesPerColor: 2, emptyTubes: 2 };
  if (levelNumber <= 20) return { colors: 5, tubesPerColor: 2, emptyTubes: 2 };
  if (levelNumber <= 35) return { colors: 5, tubesPerColor: 3, emptyTubes: 2 };
  if (levelNumber <= 55) return { colors: 6, tubesPerColor: 3, emptyTubes: 2 };
  if (levelNumber <= 80) return { colors: 6, tubesPerColor: 4, emptyTubes: 3 };
  if (levelNumber <= 110) return { colors: 7, tubesPerColor: 4, emptyTubes: 3 };
  if (levelNumber <= 150) return { colors: 7, tubesPerColor: 5, emptyTubes: 3 };
  return {
    colors: Math.min(7 + Math.floor((levelNumber - 151) / 50), 8),
    tubesPerColor: 5,
    emptyTubes: 3,
  };
}

/** Fisher-Yates shuffle of an array in place */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Generate shuffled tubes. Each color gets `tubesPerColor` tubes worth of
 * segments (tubesPerColor * TUBE_CAPACITY segments per color), all pooled
 * and randomly distributed across the filled tubes.
 */
function generateTubes(
  numColors: number,
  tubesPerColor: number,
  emptyTubes: number,
): Tube[] {
  const colors = COLOR_KEYS.slice(0, numColors);
  const filledTubeCount = numColors * tubesPerColor;

  // Create a flat pool: tubesPerColor * TUBE_CAPACITY of each color
  const pool: string[] = [];
  for (const color of colors) {
    for (let i = 0; i < TUBE_CAPACITY * tubesPerColor; i++) {
      pool.push(color);
    }
  }

  // Shuffle the pool
  shuffleArray(pool);

  // Distribute into tubes of TUBE_CAPACITY each
  const tubes: Tube[] = [];
  for (let i = 0; i < filledTubeCount; i++) {
    tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
  }

  // Add empty tubes
  for (let i = 0; i < emptyTubes; i++) {
    tubes.push([]);
  }

  return tubes;
}

/**
 * Create a level for the given level number.
 * Uses the solver to verify solvability for smaller levels.
 * Larger levels skip the solver and use estimated par.
 */
export function createLevel(levelNumber: number): Level {
  const { colors, tubesPerColor, emptyTubes } = getDifficulty(levelNumber);
  const filledTubeCount = colors * tubesPerColor;

  // Only run solver for small enough levels (6 or fewer filled tubes)
  const canSolve = filledTubeCount <= 6;
  const maxAttempts = canSolve ? 50 : 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tubes = generateTubes(colors, tubesPerColor, emptyTubes);

    // Reject already-solved configurations
    if (isLevelComplete(tubes)) continue;

    if (canSolve) {
      const result = solve(tubes);

      if (result === null) {
        return {
          tubes,
          par: filledTubeCount * 3,
          colors,
          world: Math.ceil(levelNumber / 20),
          levelNumber,
        };
      }

      if (!result.solvable) continue;
      if (result.par < 3) continue;

      return {
        tubes,
        par: result.par,
        colors,
        world: Math.ceil(levelNumber / 20),
        levelNumber,
      };
    }

    // For large levels, skip solver — just ensure it's not already solved
    return {
      tubes,
      par: filledTubeCount * 3,
      colors,
      world: Math.ceil(levelNumber / 20),
      levelNumber,
    };
  }

  // Fallback
  const tubes = generateTubes(colors, tubesPerColor, emptyTubes);
  return {
    tubes,
    par: filledTubeCount * 3,
    colors,
    world: Math.ceil(levelNumber / 20),
    levelNumber,
  };
}
