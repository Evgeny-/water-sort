import { type Tube, type Level, TUBE_CAPACITY, COLOR_KEYS } from "./types";
import { isLevelComplete } from "./engine";
import { isSolvableHeuristic } from "./solver";

interface DifficultyParams {
  colors: number;
  tubesPerColor: number;
  emptyTubes: number;
  /** Fraction of filled tubes that get locked segments (0–1) */
  lockedPercentage: number;
  /** Number of extra empty tubes that require spending score to unlock */
  paidTubes: number;
  /** Pre-computed par (optimal move count) for this tier */
  par: number;
}

/**
 * Challenge level — every 5th level starting at 10.
 * Uses 1 empty tube with low color count (3c or 4c) for a tight squeeze.
 * Only 3c×2 (~30% solve) and 4c×2 (~10% solve) work with 1 empty.
 */
function getChallengeParams(levelNumber: number): DifficultyParams | null {
  if (levelNumber < 10 || levelNumber % 5 !== 0) return null;

  // Early challenges: 3c×2, 1 empty (~30% solve rate)
  if (levelNumber <= 30)
    return {
      colors: 3,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.3,
      paidTubes: 1,
      par: 17,
    };
  // Later challenges: 4c×2, 1 empty (~10% solve rate)
  return {
    colors: 4,
    tubesPerColor: 2,
    emptyTubes: 1,
    lockedPercentage: 0.4,
    paidTubes: 1,
    par: 23,
  };
}

/**
 * Difficulty curve — monotonically increasing.
 *
 * Base difficulty uses 2 empty tubes so every level is solvable for free.
 * Every 5th level (from level 10) is a "challenge" with 1 empty tube
 * using only 3c or 4c (the only configs that work with 1 empty).
 *
 * Progression: colors (3→7) and tubesPerColor (2→3) drive difficulty.
 * Lock percentage adds visual complexity but doesn't affect solve rate much.
 */
function getDifficulty(levelNumber: number): DifficultyParams {
  // Check for challenge level first
  const challenge = getChallengeParams(levelNumber);
  if (challenge) return challenge;

  // Levels 1–5: 3c×2, 2 empty — tutorial
  if (levelNumber <= 5)
    return {
      colors: 3,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.15,
      paidTubes: 1,
      par: 18,
    };
  // Levels 6–10: 4c×2, 2 empty — introduce 4th color
  if (levelNumber <= 10)
    return {
      colors: 4,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.2,
      paidTubes: 1,
      par: 27,
    };
  // Levels 11–20: 5c×2, 2 empty — medium-easy
  if (levelNumber <= 20)
    return {
      colors: 5,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.3,
      paidTubes: 1,
      par: 35,
    };
  // Levels 21–35: 6c×2, 2 empty — medium
  if (levelNumber <= 35)
    return {
      colors: 6,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.4,
      paidTubes: 1,
      par: 44,
    };
  // Levels 36–50: 5c×3, 2 empty — medium-hard, bigger board
  if (levelNumber <= 50)
    return {
      colors: 5,
      tubesPerColor: 3,
      emptyTubes: 2,
      lockedPercentage: 0.5,
      paidTubes: 1,
      par: 53,
    };
  // Levels 51–70: 6c×3, 2 empty — hard
  if (levelNumber <= 70)
    return {
      colors: 6,
      tubesPerColor: 3,
      emptyTubes: 2,
      lockedPercentage: 0.6,
      paidTubes: 1,
      par: 68,
    };
  // Levels 71–90: 7c×2, 2 empty — very hard
  if (levelNumber <= 90)
    return {
      colors: 7,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.7,
      paidTubes: 1,
      par: 53,
    };
  // 91+: 7c×3, 2 empty — hardest
  return {
    colors: 7,
    tubesPerColor: 3,
    emptyTubes: 2,
    lockedPercentage: 0.8,
    paidTubes: 1,
    par: 83,
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

/** Cost to unlock one paid tube: base score + level × 20 */
function getTubeCost(levelNumber: number): number {
  const base = 100 + (levelNumber - 1) * 10;
  return base + levelNumber * 20;
}

export function createLevel(levelNumber: number): Level {
  const {
    colors,
    tubesPerColor,
    emptyTubes,
    lockedPercentage,
    paidTubes,
    par,
  } = getDifficulty(levelNumber);
  // Total empty tubes includes both free and paid (paid are appended at the end)
  const totalEmptyTubes = emptyTubes + paidTubes;
  const filledCount = colors * tubesPerColor;
  // Paid tube indices start after filled + free empty tubes
  const paidStart = filledCount + emptyTubes;

  // Build exclude set for paid tubes
  const excludeIndices = new Set<number>();
  for (let i = paidStart; i < filledCount + totalEmptyTubes; i++) {
    excludeIndices.add(i);
  }

  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tubes = generateTubes(colors, tubesPerColor, totalEmptyTubes);

    // Reject already-solved configurations or tubes with a pre-completed tube
    if (isLevelComplete(tubes)) continue;
    if (hasDuplicateTube(tubes)) continue;

    // Verify solvable WITHOUT paid tubes (player must be able to solve for free)
    if (!isSolvableHeuristic(tubes, excludeIndices)) continue;

    return {
      tubes,
      par,
      colors,
      world: Math.ceil(levelNumber / 20),
      levelNumber,
      lockedMask: generateLockedMask(tubes, lockedPercentage),
      paidTubes,
      tubeCost: getTubeCost(levelNumber),
    };
  }

  // Fallback — generate without paid tubes to guarantee solvability
  for (let attempt = 0; attempt < 100; attempt++) {
    const tubes = generateTubes(colors, tubesPerColor, totalEmptyTubes);
    if (isLevelComplete(tubes)) continue;
    if (hasDuplicateTube(tubes)) continue;

    return {
      tubes,
      par,
      colors,
      world: Math.ceil(levelNumber / 20),
      levelNumber,
      lockedMask: generateLockedMask(tubes, lockedPercentage),
      paidTubes,
      tubeCost: getTubeCost(levelNumber),
    };
  }

  // Ultimate fallback
  const tubes = generateTubes(colors, tubesPerColor, totalEmptyTubes);
  return {
    tubes,
    par,
    colors,
    world: Math.ceil(levelNumber / 20),
    levelNumber,
    lockedMask: generateLockedMask(tubes, lockedPercentage),
    paidTubes,
    tubeCost: getTubeCost(levelNumber),
  };
}
