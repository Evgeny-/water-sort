import { type Tube, type Level, TUBE_CAPACITY, COLOR_KEYS } from "./types";
import { isLevelComplete } from "./engine";
import { solve } from "./solver";

interface DifficultyParams {
  colors: number;
  tubesPerColor: number;
  emptyTubes: number;
  /** Fraction of filled tubes that get locked segments (0–1) */
  lockedPercentage: number;
}

/** Difficulty curve: fewer colors, more tubes per color for more bottles */
function getDifficulty(levelNumber: number): DifficultyParams {
  if (levelNumber <= 3) return { colors: 3, tubesPerColor: 2, emptyTubes: 1, lockedPercentage: 0 };
  if (levelNumber <= 4) return { colors: 4, tubesPerColor: 2, emptyTubes: 1, lockedPercentage: 0 };
  if (levelNumber <= 8) return { colors: 4, tubesPerColor: 2, emptyTubes: 1, lockedPercentage: 0.15 };
  if (levelNumber <= 18) return { colors: 5, tubesPerColor: 2, emptyTubes: 2, lockedPercentage: 0.25 };
  if (levelNumber <= 30) return { colors: 5, tubesPerColor: 3, emptyTubes: 2, lockedPercentage: 0.35 };
  if (levelNumber <= 50) return { colors: 6, tubesPerColor: 3, emptyTubes: 2, lockedPercentage: 0.45 };
  if (levelNumber <= 75) return { colors: 6, tubesPerColor: 4, emptyTubes: 2, lockedPercentage: 0.55 };
  if (levelNumber <= 105) return { colors: 7, tubesPerColor: 4, emptyTubes: 2, lockedPercentage: 0.65 };
  if (levelNumber <= 150) return { colors: 7, tubesPerColor: 5, emptyTubes: 3, lockedPercentage: 0.75 };
  return { colors: 7, tubesPerColor: 5, emptyTubes: 3, lockedPercentage: 0.75 };
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

/** Check if any filled tube has all segments of the same color (pre-completed) */
function hasDuplicateTube(tubes: Tube[]): boolean {
  return tubes.some(
    (t) => t.length === TUBE_CAPACITY && t.every((c) => c === t[0]),
  );
}

/**
 * Generate a locked mask for tubes. For each filled tube, with probability
 * `lockedPercentage`, all segments except the topmost are locked.
 */
function generateLockedMask(
  tubes: Tube[],
  lockedPercentage: number,
): boolean[][] {
  return tubes.map((tube) => {
    if (tube.length === 0 || lockedPercentage <= 0) {
      return tube.map(() => false);
    }
    const isLocked = Math.random() < lockedPercentage;
    if (!isLocked) return tube.map(() => false);
    // Lock all segments except the topmost
    return tube.map((_, i) => i < tube.length - 1);
  });
}

/** Estimate par when solver can't compute it exactly */
function estimatePar(filledTubeCount: number): number {
  // Use a conservative multiplier so players can't easily beat par.
  // With TUBE_CAPACITY segments per tube, each tube needs roughly
  // (TUBE_CAPACITY - 1) pours to sort, but many pours overlap.
  return Math.floor(filledTubeCount * (TUBE_CAPACITY - 1.5));
}

/**
 * Create a level for the given level number.
 * Uses the solver to verify solvability and compute exact par for
 * levels with up to 8 filled tubes. Larger levels use estimated par.
 */
export function createLevel(levelNumber: number): Level {
  const { colors, tubesPerColor, emptyTubes, lockedPercentage } = getDifficulty(levelNumber);
  const filledTubeCount = colors * tubesPerColor;

  // Run solver for levels with up to 8 filled tubes
  const canSolve = filledTubeCount <= 8;
  const maxAttempts = canSolve ? 50 : 20;

  const makeLevel = (tubes: Tube[], par: number): Level => ({
    tubes,
    par,
    colors,
    world: Math.ceil(levelNumber / 20),
    levelNumber,
    lockedMask: generateLockedMask(tubes, lockedPercentage),
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tubes = generateTubes(colors, tubesPerColor, emptyTubes);

    // Reject already-solved configurations or tubes with a pre-completed tube
    if (isLevelComplete(tubes)) continue;
    if (hasDuplicateTube(tubes)) continue;

    if (canSolve) {
      const result = solve(tubes);

      if (result === null) {
        return makeLevel(tubes, estimatePar(filledTubeCount));
      }

      if (!result.solvable) continue;
      if (result.par < 3) continue;

      return makeLevel(tubes, result.par);
    }

    // For large levels, skip solver — just ensure it's not already solved
    return makeLevel(tubes, estimatePar(filledTubeCount));
  }

  // Fallback
  const tubes = generateTubes(colors, tubesPerColor, emptyTubes);
  return makeLevel(tubes, estimatePar(filledTubeCount));
}
