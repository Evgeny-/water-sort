import { type Tube, type GameState, type Move, TUBE_CAPACITY } from "./types";

/** Get the top color of a tube, or undefined if empty */
export function topColor(tube: Tube): string | undefined {
  return tube[tube.length - 1];
}

/** Count consecutive same-color segments at the top of a tube */
export function topCount(tube: Tube): number {
  if (tube.length === 0) return 0;
  const color = tube[tube.length - 1]!;
  let count = 1;
  for (let i = tube.length - 2; i >= 0; i--) {
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
export function pour(tubes: Tube[], from: number, to: number): Tube[] {
  const source = [...tubes[from]!];
  const dest = [...tubes[to]!];

  const color = topColor(source)!;
  const count = topCount(source);
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
    return [...t];
  });

  return newTubes;
}

/** Check if a tube is complete (full with one color) */
export function isTubeComplete(tube: Tube): boolean {
  if (tube.length !== TUBE_CAPACITY) return false;
  return tube.every((c) => c === tube[0]);
}

/** Check if the level is solved */
export function isLevelComplete(tubes: Tube[]): boolean {
  return tubes.every((tube) => tube.length === 0 || isTubeComplete(tube));
}

/** Get all valid moves from the current state */
export function getValidMoves(tubes: Tube[]): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < tubes.length; from++) {
    if (tubes[from]!.length === 0) continue;
    // Skip already-completed tubes as source
    if (isTubeComplete(tubes[from]!)) continue;
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
export function isStuck(tubes: Tube[]): boolean {
  return !isLevelComplete(tubes) && getValidMoves(tubes).length === 0;
}

/**
 * Reveal the topmost segment in each tube if it was locked.
 * Returns a new mask (immutable).
 */
export function revealTopSegments(
  lockedMask: boolean[][],
  tubes: Tube[],
): boolean[][] {
  return lockedMask.map((tubeMask, ti) => {
    const tube = tubes[ti]!;
    if (tube.length === 0) return [...tubeMask];
    const topIdx = tube.length - 1;
    if (!tubeMask[topIdx]) return [...tubeMask];
    // Reveal the top segment
    const newMask = [...tubeMask];
    newMask[topIdx] = false;
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
    comboCounter: 0,
    totalComboBonus: 0,
    prevCompletedCount: 0,
    invalidTube: null,
    pourAnim: null,
    lockedMask: initialMask,
  };
}
