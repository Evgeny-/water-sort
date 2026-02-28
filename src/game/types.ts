/** A color identifier for liquid segments */
export type Color = string;

/** A tube is an array of colors, bottom-to-top (index 0 = bottom) */
export type Tube = Color[];

/** Full tube capacity */
export const TUBE_CAPACITY = 4;

/** A single move: pour from one tube to another */
export interface Move {
  from: number;
  to: number;
}

/** Level definition */
export interface Level {
  tubes: Tube[];
  par: number;
  colors: number;
  world: number;
  levelNumber: number;
  /** Per-tube, per-segment locked mask (true = hidden). Parallel to tubes. */
  lockedMask: boolean[][];
}

/** Data needed to drive the pour animation overlay */
export interface PourAnimation {
  fromIndex: number;
  toIndex: number;
  color: string;
  count: number;
  /** Snapshot of the source tube before pouring (used to render animated clone) */
  sourceTubeBefore: Tube;
  /** Snapshot of the source tube's locked mask before pouring */
  sourceLockedBefore: boolean[];
  /** Number of segments in the destination tube before pouring */
  destTubeLength: number;
}

/** Runtime game state */
export interface GameState {
  tubes: Tube[];
  selectedTube: number | null;
  moves: Move[];
  undoCount: number;
  restartCount: number;
  history: Tube[][];
  /** History of locked masks (parallel to history) for undo */
  lockedMaskHistory: boolean[][][];
  /** Tube index that just had an invalid pour attempt (for shake animation) */
  invalidTube: number | null;
  /** Active pour animation (blocks input while non-null) */
  pourAnim: PourAnimation | null;
  /** Per-tube, per-segment locked mask — revealed as segments are poured away */
  lockedMask: boolean[][];
}

/** Color palette — 7 maximally distinct game colors */
export const COLORS: Record<string, string> = {
  red: "#e5304a",
  blue: "#2979e5",
  green: "#2db84b",
  yellow: "#f5c800",
  purple: "#9333ea",
  orange: "#f07020",
  teal: "#006262",
};

/** Persisted best result for a completed level */
export interface LevelResult {
  stars: number;
  score: number;
}

/** Ordered list of color keys for level generation */
export const COLOR_KEYS = Object.keys(COLORS);
