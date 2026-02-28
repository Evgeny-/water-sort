/** A color identifier for liquid segments */
export type Color = string;

/** A tube is an array of colors, bottom-to-top (index 0 = bottom) */
export type Tube = Color[];

/** Full tube capacity */
export const TUBE_CAPACITY = 5;

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
}

/** Runtime game state */
export interface GameState {
  tubes: Tube[];
  selectedTube: number | null;
  moves: Move[];
  undoCount: number;
  restartCount: number;
  history: Tube[][];
  /** Number of consecutive tube completions in a row */
  comboCounter: number;
  /** Accumulated combo bonus points */
  totalComboBonus: number;
  /** Number of completed tubes after previous move (for combo detection) */
  prevCompletedCount: number;
  /** Tube index that just had an invalid pour attempt (for shake animation) */
  invalidTube: number | null;
}

/** Color palette — 16 distinct game colors */
export const COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
  lime: "#84cc16",
  cyan: "#06b6d4",
  rose: "#f43f5e",
  amber: "#f59e0b",
  emerald: "#10b981",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
};

/** Ordered list of color keys for level generation */
export const COLOR_KEYS = Object.keys(COLORS);
