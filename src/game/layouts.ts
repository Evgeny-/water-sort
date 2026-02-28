// Layout: arrange bottles in rows.
// Adjacent rows differ by at most 1 in count. Prefer width over height.
// Avoid rows with only 1 bottle.

const TUBE_W = 64;
const TUBE_H = 176;
const GAP_X = 16;
const GAP_Y = 32;
const STEP_X = TUBE_W + GAP_X; // 80
const STEP_Y = TUBE_H + GAP_Y; // 208

interface BottlePosition {
  x: number;
  y: number;
}

export interface LayoutResult {
  positions: BottlePosition[];
  width: number;
  height: number;
}

/**
 * Build row sizes for n bottles.
 * Distributes evenly across rows, each row within ±1 of the others.
 * Picks the number of rows that gives the best scale (prefers wider).
 * Avoids single-bottle rows.
 */
function buildRows(n: number, availW: number, availH: number): number[] {
  if (n <= 1) return [n];

  const maxCols = Math.ceil(n / 2);

  let best: number[] | null = null;
  let bestScale = 0;

  // Try different numbers of rows — scaling handles overflow
  for (let numRows = 1; numRows <= n; numRows++) {
    const base = Math.floor(n / numRows);
    const extra = n % numRows;

    // Skip if rows would be too wide to fit
    if (base + (extra > 0 ? 1 : 0) > maxCols) continue;

    // Distribute: first `extra` rows get `base+1`, rest get `base`
    const rows: number[] = [];
    for (let i = 0; i < numRows; i++) {
      rows.push(i < extra ? base + 1 : base);
    }

    // Skip layouts with a row of 1 (unless it's the only row)
    if (numRows > 1 && rows[rows.length - 1]! < 2) continue;

    const widest = rows[0]!;
    const w = widest * TUBE_W + (widest - 1) * GAP_X;
    const h = numRows * TUBE_H + (numRows - 1) * GAP_Y;
    const scale = Math.min(availW / w, availH / h, 1);

    if (scale > bestScale) {
      bestScale = scale;
      best = rows;
    }
  }

  return best ?? [n];
}

function rowsToPositions(rowSizes: number[]): BottlePosition[] {
  const maxW = Math.max(...rowSizes);
  const maxRowW = maxW * TUBE_W + (maxW - 1) * GAP_X;
  const positions: BottlePosition[] = [];
  let y = 0;
  for (const size of rowSizes) {
    const rowW = size * TUBE_W + (size - 1) * GAP_X;
    const offsetX = (maxRowW - rowW) / 2;
    for (let j = 0; j < size; j++) {
      positions.push({ x: offsetX + j * STEP_X, y });
    }
    y += STEP_Y;
  }
  return positions;
}

function normalize(positions: BottlePosition[]): LayoutResult {
  if (positions.length === 0) return { positions: [], width: 0, height: 0 };
  let minX = Infinity,
    minY = Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const shifted = positions.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  let maxX = 0,
    maxY = 0;
  for (const p of shifted) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { positions: shifted, width: maxX + TUBE_W, height: maxY + TUBE_H };
}

export function getLayoutForLevel(
  _levelNumber: number,
  tubeCount: number,
  availW: number,
  availH: number,
): LayoutResult {
  if (tubeCount <= 0) return { positions: [], width: 0, height: 0 };

  const rows = buildRows(tubeCount, availW, availH);
  return normalize(rowsToPositions(rows));
}
