import { type Tube, type GameState, type Move, TUBE_CAPACITY } from "./types";

/** Get the top color of a tube, or undefined if empty */
export function topColor(tube: Tube): string | undefined {
  return tube[tube.length - 1];
}

/**
 * Count consecutive same-color segments at the top of a tube.
 * If a lockedMask is provided, stops at the first locked segment
 * (player can't pour what they can't see).
 */
export function topCount(tube: Tube, lockedMask?: boolean[]): number {
  if (tube.length === 0) return 0;
  const color = tube[tube.length - 1]!;
  let count = 1;
  for (let i = tube.length - 2; i >= 0; i--) {
    if (lockedMask?.[i]) break;
    if (tube[i] === color) count++;
    else break;
  }
  return count;
}

/** Check if pouring from source to destination is valid */
export function canPour(source: Tube, destination: Tube): boolean {
  if (source.length === 0) return false;
  if (destination.length >= TUBE_CAPACITY) return false;
  if (destination.length === 0) return true;
  return topColor(source) === topColor(destination);
}

/** Execute a pour from source to destination. Returns new tubes (immutable). */
export function pour(tubes: Tube[], from: number, to: number, lockedMask?: boolean[][]): Tube[] {
  const source = [...tubes[from]!];
  const dest = [...tubes[to]!];

  const color = topColor(source)!;
  const count = topCount(source, lockedMask?.[from]);
  const space = TUBE_CAPACITY - dest.length;
  const transferred = Math.min(count, space);

  // Remove from source
  source.splice(source.length - transferred, transferred);

  // Add to destination
  for (let i = 0; i < transferred; i++) {
    dest.push(color);
  }

  const newTubes = tubes.map((t, i) => {
    if (i === from) return source;
    if (i === to) return dest;
    return t; // unchanged tubes don't need copying
  });

  return newTubes;
}

/** Check if a tube is complete (full with one color, no locked segments) */
export function isTubeComplete(tube: Tube, lockedMask?: boolean[]): boolean {
  if (tube.length !== TUBE_CAPACITY) return false;
  if (lockedMask?.some(Boolean)) return false;
  return tube.every((c) => c === tube[0]);
}

/** Check if the level is solved */
export function isLevelComplete(tubes: Tube[], lockedMask?: boolean[][]): boolean {
  return tubes.every((tube, i) => tube.length === 0 || isTubeComplete(tube, lockedMask?.[i]));
}

/** Get all valid moves from the current state */
export function getValidMoves(tubes: Tube[], lockedMask?: boolean[][]): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < tubes.length; from++) {
    if (tubes[from]!.length === 0) continue;
    // Skip already-completed tubes as source
    if (isTubeComplete(tubes[from]!, lockedMask?.[from])) continue;
    for (let to = 0; to < tubes.length; to++) {
      if (from === to) continue;
      if (canPour(tubes[from]!, tubes[to]!)) {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

/** Check if the player is stuck (no valid moves and not solved) */
export function isStuck(tubes: Tube[], lockedMask?: boolean[][]): boolean {
  return !isLevelComplete(tubes, lockedMask) && getValidMoves(tubes, lockedMask).length === 0;
}

/**
 * Sync locked mask to match current tube lengths and reveal the new top segment.
 * - Truncates mask entries for segments that were poured away
 * - Pads with `false` for segments that were poured in (new segments are always visible)
 * - Reveals the topmost segment if it was locked
 * Returns a new mask (immutable).
 */
/**
 * Sync locked mask for specific tubes and reveal the new top segment.
 * Only processes the given tube indices; other masks are reused as-is.
 */
export function revealTopSegments(
  lockedMask: boolean[][],
  tubes: Tube[],
  affectedIndices?: number[],
): boolean[][] {
  // If no specific indices given, process all (for initial setup)
  const indicesToProcess = affectedIndices
    ? new Set(affectedIndices)
    : null;

  return lockedMask.map((tubeMask, ti) => {
    if (indicesToProcess && !indicesToProcess.has(ti)) return tubeMask;

    const tube = tubes[ti]!;
    // Sync mask length to tube length
    let newMask: boolean[];
    if (tubeMask.length > tube.length) {
      // Segments were removed — truncate
      newMask = tubeMask.slice(0, tube.length);
    } else if (tubeMask.length < tube.length) {
      // Segments were added — pad with false (new segments are visible)
      newMask = [...tubeMask];
      while (newMask.length < tube.length) {
        newMask.push(false);
      }
    } else {
      newMask = [...tubeMask];
    }
    // Reveal the top segment if locked
    if (tube.length > 0 && newMask[tube.length - 1]) {
      newMask[tube.length - 1] = false;
    }
    return newMask;
  });
}

/** Create initial game state from a level's tube configuration */
export function createGameState(
  tubes: Tube[],
  lockedMask: boolean[][],
): GameState {
  const initialMask = revealTopSegments(
    lockedMask.map((m) => [...m]),
    tubes,
  );
  return {
    tubes: tubes.map((t) => [...t]),
    selectedTube: null,
    moves: [],
    undoCount: 0,
    restartCount: 0,
    history: [],
    lockedMaskHistory: [],
    invalidTube: null,
    pourAnim: null,
    lockedMask: initialMask,
    unlockedPaidTubes: new Set(),
  };
}
