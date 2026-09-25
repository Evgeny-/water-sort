/** Palette index. */
export type Color = number;

/**
 * bottle — regular vessel (cap 4), pours from the top.
 * flask  — small helper vessel (cap 2). Never counts as complete: must end empty.
 * jar    — big collector (cap 8). Accepts one colour only, nothing can be poured out of it.
 * valve  — bottle with a tap at the bottom: pours from the BOTTOM run (a queue, not a stack).
 */
export type Kind = "bottle" | "flask" | "jar" | "valve";

export interface Vessel {
  kind: Kind;
  cap: number;
  /** bottom → top */
  layers: Color[];
  /** parallel to layers; true = colour not visible yet ("?") */
  hidden: boolean[];
  /** jar only: the colour it accepts; null = decided by the first pour ("chameleon" jar) */
  accept: Color | null;
  /** padlock colour: vessel is frozen until some vessel of this colour is completed */
  lock: Color | null;
}

export interface Order {
  color: Color;
  cap: number;
}

export interface OrderSlot extends Order {
  fill: number;
}

export type Mode = "sort" | "orders";

export interface State {
  vessels: Vessel[];
  /** orders mode: visible order cups (null = slot empty, queue exhausted) */
  slots: (OrderSlot | null)[];
  /** index of the next order in LevelDef.queue */
  qi: number;
}

export interface LevelDef {
  id: string;
  pack: string;
  name: string;
  mode: Mode;
  vessels: Vessel[];
  /** orders mode: number of simultaneously visible order cups */
  slots: number;
  /** orders mode: all orders in arrival order */
  queue: Order[];
  par: number;
  /**
   * measured difficulty: casual-bot solve rate, BFS size, whether par is proven
   * optimal, and planning effort (0..1: log2 of positions explored per solution move / 6)
   */
  stats: { casual: number; states: number; exact: boolean; effort?: number };
  /** 0 easy · 1 medium · 2 hard · 3 very hard */
  tier?: number;
  /** planning-effort difficulty the level was picked for */
  target?: number;
  /** a track's challenge level (every 5th): a mix of mechanics, a notch harder */
  boss?: boolean;
  /** mechanics present in the level */
  mechanics?: string[];
}

export interface Move {
  from: number;
  /** vessel index, or vessels.length + slotIndex for an order cup */
  to: number;
}

export interface PourResult {
  state: State;
  color: Color;
  amount: number;
  /** vessel indices that became complete with this pour */
  completed: number[];
  /** vessel indices whose padlock opened */
  unlocked: number[];
  /** layer indices of the source that were revealed */
  revealed: number[];
  /** order slot that got filled up by this pour (-1 if none) */
  orderDone: number;
}
