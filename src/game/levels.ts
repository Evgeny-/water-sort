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
 * Difficulty curve — monotonically increasing.
 *
 * After the tutorial (levels 1–6 with 2 empty tubes), we lock to 1 empty
 * tube for the rest of the game. Difficulty scales through colors (3→7)
 * and locked percentage (0→90%).
 *
 * tubesPerColor stays at 2 throughout — fewer copies per color = tighter puzzles.
 * Filled tubes = colors × 2. Solver runs when filled ≤ 8.
 */
function getDifficulty(levelNumber: number): DifficultyParams {
  // Levels 1–3: 3×2=6 filled, 2 empty — tutorial
  if (levelNumber <= 3)
    return {
      colors: 3,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.15,
      paidTubes: 1,
      par: 15,
    };
  // Levels 4–6: 4×2=8 filled, 2 empty — introduce 4th color
  if (levelNumber <= 6)
    return {
      colors: 4,
      tubesPerColor: 2,
      emptyTubes: 2,
      lockedPercentage: 0.4,
      paidTubes: 1,
      par: 20,
    };
  // Levels 7–14: 3×2=6 filled, 1 empty — first squeeze
  if (levelNumber <= 14)
    return {
      colors: 3,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.2,
      paidTubes: 1,
      par: 21,
    };
  // Levels 15–25: 4 colors, 1 empty — relief via low locks
  if (levelNumber <= 25)
    return {
      colors: 4,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.1,
      paidTubes: 1,
      par: 20,
    };

  // Levels 26–35: 5×3=15 filled, 1 empty — back to hard, big board
  if (levelNumber <= 35)
    return {
      colors: 5,
      tubesPerColor: 3,
      emptyTubes: 1,
      lockedPercentage: 0.4,
      paidTubes: 1,
      par: 30,
    };
  // Levels 36–55: 4 colors, 1 empty, heavy locks — hard
  if (levelNumber <= 55)
    return {
      colors: 4,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.4,
      paidTubes: 1,
      par: 25,
    };
  // Levels 56–70: 5 colors, 1 empty — more locks
  if (levelNumber <= 70)
    return {
      colors: 5,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.7,
      paidTubes: 1,
      par: 30,
    };
  // Levels 71–90: 6×2=12 filled, 1 empty — all colors
  if (levelNumber <= 90)
    return {
      colors: 6,
      tubesPerColor: 2,
      emptyTubes: 1,
      lockedPercentage: 0.8,
      paidTubes: 1,
      par: 35,
    };
  // 91+: 7×2=14 filled, 1 empty — maximum difficulty
  return {
    colors: 7,
    tubesPerColor: 2,
    emptyTubes: 1,
    lockedPercentage: 0.9,
    paidTubes: 1,
    par: 35,
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
