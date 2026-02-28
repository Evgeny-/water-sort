import { type Tube, type Level, TUBE_CAPACITY, COLOR_KEYS } from "./types";
import { isLevelComplete } from "./engine";
import { solve } from "./solver";

interface DifficultyParams {
  colors: number;
  tubesPerColor: number;
  emptyTubes: number;
  /** Fraction of filled tubes that get locked segments (0–1) */
  lockedPercentage: number;
  /** Number of extra empty tubes that require spending score to unlock */
  paidTubes: number;
}

/**
 * Difficulty curve: controls colors, tubes per color, empty tubes, locked %, and paid tubes.
 * `emptyTubes` = free empty tubes available from the start.
 * `paidTubes` = extra empty tubes the player can unlock by spending score.
 * Every level always has exactly 1 paid tube to keep the mechanic consistent.
 */
/**
 * Difficulty curve — designed so early levels generate fast and play easy,
 * progressing toward tighter puzzles with fewer empty tubes and more locked segments.
 *
 * Key insight: fewer colors with fewer empty tubes = harder to solve AND slower to
 * generate (BFS solver explores huge state space). So we start with more colors /
 * more empties (easy, fast) and progress toward fewer empties / locked segments.
 *
 * Filled tubes = colors × tubesPerColor. Solver runs when filled ≤ 8.
 */
function getDifficulty(levelNumber: number): DifficultyParams {
  // Levels 1–5: 5 colors × 2 tpc = 10 filled, 2 free empties (easy, no solver needed)
  if (levelNumber <= 5)
    return {
      colors: 5,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.1,
      paidTubes: 1,
    };
  // Levels 6–12: 5 colors × 2 tpc = 10 filled, 2 free, introduce locks
  if (levelNumber <= 12)
    return {
      colors: 6,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.15,
      paidTubes: 1,
    };
  // Levels 13–20: 4 colors × 2 tpc = 8 filled, 2 free (solver can run, but fast with 2 empties)
  if (levelNumber <= 20)
    return {
      colors: 5,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.25,
      paidTubes: 1,
    };
  // Levels 21–30: 4 colors × 2 tpc = 8 filled, 1 free (tighter, harder)
  if (levelNumber <= 30)
    return {
      colors: 4,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.35,
      paidTubes: 1,
    };
  // Levels 31–50: 5 colors × 3 tpc = 15 filled, 2 free
  if (levelNumber <= 50)
    return {
      colors: 5,
      tubesPerColor: 3,
      emptyTubes: 2,
      lockedPercentage: 0.35,
      paidTubes: 1,
    };
  // Levels 51–75: 6 colors × 3 tpc = 18 filled, 2 free
  if (levelNumber <= 75)
    return {
      colors: 6,
      tubesPerColor: 3,
      emptyTubes: 2,
      lockedPercentage: 0.45,
      paidTubes: 2,
    };
  // Levels 76–105: 6 colors × 4 tpc = 24 filled, 2 free
  if (levelNumber <= 105)
    return {
      colors: 6,
      tubesPerColor: 4,
      emptyTubes: 2,
      lockedPercentage: 0.55,
      paidTubes: 2,
    };
  // Levels 106–150: 7 colors × 4 tpc = 28 filled, 2 free
  if (levelNumber <= 150)
    return {
      colors: 7,
      tubesPerColor: 4,
      emptyTubes: 2,
      lockedPercentage: 0.65,
      paidTubes: 2,
    };
  // 150+: 7 colors × 5 tpc = 35 filled, 2 free
  return {
    colors: 7,
    tubesPerColor: 5,
    emptyTubes: 2,
    lockedPercentage: 0.85,
    paidTubes: 2,
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
    // Lock a random number of bottom segments (1 to tube.length-1)
    const lockedCount = 1 + Math.floor(Math.random() * (tube.length - 1));
    return tube.map((_, i) => i < lockedCount);
  });
}

/** Estimate par when solver can't compute it exactly */
function estimatePar(filledTubeCount: number): number {
  // Use a conservative multiplier so players can't easily beat par.
  // With TUBE_CAPACITY segments per tube, each tube needs roughly
  // (TUBE_CAPACITY - 1) pours to sort, but many pours overlap.
  return Math.floor(filledTubeCount * (TUBE_CAPACITY - 1.5));
}

/** Cost to unlock one paid tube: always more than the level's max score */
function getTubeCost(levelNumber: number): number {
  const base = 100 + (levelNumber - 1) * 10;
  // Cost = 200% of the level's base score
  return Math.round(base * 2);
}

export function createLevel(levelNumber: number): Level {
  const { colors, tubesPerColor, emptyTubes, lockedPercentage, paidTubes } =
    getDifficulty(levelNumber);
  const filledTubeCount = colors * tubesPerColor;
  // Total empty tubes includes both free and paid (paid are appended at the end)
  const totalEmptyTubes = emptyTubes + paidTubes;

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
    paidTubes,
    tubeCost: getTubeCost(levelNumber),
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tubes = generateTubes(colors, tubesPerColor, totalEmptyTubes);

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
  const tubes = generateTubes(colors, tubesPerColor, totalEmptyTubes);
  return makeLevel(tubes, estimatePar(filledTubeCount));
}
