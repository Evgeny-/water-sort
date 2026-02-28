// Layout patterns for arranging bottles in creative, symmetrical formations.
// All patterns are row-based grids with modest variation between adjacent rows.

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

interface LayoutPattern {
  name: string;
  minTubes: number;
  maxTubes: number;
  generate: (n: number, availW: number, availH: number) => LayoutResult;
}

// ─── Helpers ───────────────────────────────────────────────────

function normalize(positions: BottlePosition[]): LayoutResult {
  if (positions.length === 0)
    return { positions: [], width: 0, height: 0 };
  let minX = Infinity, minY = Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const shifted = positions.map(p => ({ x: p.x - minX, y: p.y - minY }));
  let maxX = 0, maxY = 0;
  for (const p of shifted) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { positions: shifted, width: maxX + TUBE_W, height: maxY + TUBE_H };
}

function scaleFor(result: LayoutResult, availW: number, availH: number): number {
  if (result.width <= 0 || result.height <= 0) return 0;
  return Math.min(availW / result.width, availH / result.height, 1);
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

function bestGridCols(n: number, availW: number, availH: number): number {
  let bestCols = 1;
  let bestScale = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = cols * TUBE_W + (cols - 1) * GAP_X;
    const h = rows * TUBE_H + (rows - 1) * GAP_Y;
    const scale = Math.min(availW / w, availH / h, 1);
    if (scale > bestScale) {
      bestScale = scale;
      bestCols = cols;
    }
  }
  return bestCols;
}

function hasOverlaps(positions: BottlePosition[]): boolean {
  const minGap = 4;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = Math.abs(positions[i]!.x - positions[j]!.x);
      const dy = Math.abs(positions[i]!.y - positions[j]!.y);
      if (dx < TUBE_W + minGap && dy < TUBE_H + minGap) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Build a row layout from a shape function and adjust to exactly n tubes.
 * shapeFn(t) maps row position t∈[0,1] to a fraction ∈[0,1] of peakCols.
 * Adjacent rows differ by at most 2 tubes to keep dispersion low.
 */
function shapeToLayout(
  n: number,
  numRows: number,
  shapeFn: (t: number) => number,
): LayoutResult {
  if (numRows < 2) numRows = 2;

  // Estimate peakCols so total ≈ n
  let fracSum = 0;
  for (let r = 0; r < numRows; r++) {
    fracSum += shapeFn(numRows > 1 ? r / (numRows - 1) : 0.5);
  }
  const peakCols = Math.max(2, Math.round(n / fracSum));

  // Generate raw row sizes
  const rawRows: number[] = [];
  for (let r = 0; r < numRows; r++) {
    const t = numRows > 1 ? r / (numRows - 1) : 0.5;
    rawRows.push(Math.max(1, Math.round(peakCols * shapeFn(t))));
  }

  // Clamp adjacent row difference to max 2
  for (let i = 1; i < rawRows.length; i++) {
    if (rawRows[i]! > rawRows[i - 1]! + 2) rawRows[i] = rawRows[i - 1]! + 2;
    if (rawRows[i]! < rawRows[i - 1]! - 2) rawRows[i] = rawRows[i - 1]! - 2;
  }
  // Backward pass too
  for (let i = rawRows.length - 2; i >= 0; i--) {
    if (rawRows[i]! > rawRows[i + 1]! + 2) rawRows[i] = rawRows[i + 1]! + 2;
    if (rawRows[i]! < rawRows[i + 1]! - 2) rawRows[i] = rawRows[i + 1]! - 2;
  }

  // Adjust to exactly n
  let total = rawRows.reduce((a, b) => a + b, 0);
  while (total > n) {
    // Reduce the largest row
    let maxIdx = 0;
    for (let i = 1; i < rawRows.length; i++) {
      if (rawRows[i]! > rawRows[maxIdx]!) maxIdx = i;
    }
    rawRows[maxIdx]!--;
    total--;
    if (rawRows[maxIdx]! <= 0) rawRows.splice(maxIdx, 1);
  }
  while (total < n) {
    // Increase the largest row (respecting ±2 clamp with neighbors)
    let bestIdx = 0;
    for (let i = 0; i < rawRows.length; i++) {
      const prevOk = i === 0 || rawRows[i]! + 1 <= rawRows[i - 1]! + 2;
      const nextOk = i === rawRows.length - 1 || rawRows[i]! + 1 <= rawRows[i + 1]! + 2;
      if (prevOk && nextOk && rawRows[i]! >= rawRows[bestIdx]!) {
        bestIdx = i;
      }
    }
    rawRows[bestIdx]!++;
    total++;
  }

  return normalize(rowsToPositions(rawRows));
}

// ─── Pattern generators ────────────────────────────────────────

/** Honeycomb: alternating rows offset by half, rows differ by 1 */
function generateHoneycomb(n: number, availW: number, availH: number): LayoutResult {
  const gridCols = bestGridCols(n, availW, availH);
  // Use 1 fewer col so we get more rows with stagger effect
  const cols = Math.max(2, gridCols - 1);

  const positions: BottlePosition[] = [];
  let placed = 0;
  let row = 0;
  while (placed < n) {
    const isOffset = row % 2 === 1;
    const rowCols = isOffset ? Math.max(cols - 1, 1) : cols;
    const count = Math.min(rowCols, n - placed);
    const maxRowW = cols * TUBE_W + (cols - 1) * GAP_X;
    const rowW = count * TUBE_W + (count - 1) * GAP_X;
    const offsetX = (maxRowW - rowW) / 2;
    for (let j = 0; j < count; j++) {
      positions.push({ x: offsetX + j * STEP_X, y: row * STEP_Y });
    }
    placed += count;
    row++;
  }

  return normalize(positions);
}

/** Diamond: narrow → wide → narrow (symmetric bulge in the middle) */
function generateDiamond(n: number, _availW: number, _availH: number): LayoutResult {
  const numRows = Math.max(4, Math.min(Math.ceil(Math.sqrt(n * 1.5)), 7));
  return shapeToLayout(n, numRows, (t) => {
    // Bell shape: peaks at t=0.5
    return 0.4 + 0.6 * Math.sin(t * Math.PI);
  });
}

/** Hourglass: wide → narrow → wide (pinched waist in the middle) */
function generateHourglass(n: number, _availW: number, _availH: number): LayoutResult {
  const numRows = Math.max(4, Math.min(Math.ceil(Math.sqrt(n * 1.5)), 7));
  return shapeToLayout(n, numRows, (t) => {
    // Inverse bell: dips at t=0.5
    const dip = Math.sin(t * Math.PI); // 0→1→0
    return 1.0 - 0.5 * dip;           // 1→0.5→1
  });
}

/** Pyramid: narrow top → wide bottom */
function generatePyramid(n: number, _availW: number, _availH: number): LayoutResult {
  const numRows = Math.max(3, Math.min(Math.ceil(Math.sqrt(n * 1.2)), 7));
  return shapeToLayout(n, numRows, (t) => {
    return 0.4 + 0.6 * t;
  });
}

/** Chevron / inverted pyramid: wide top → narrow bottom */
function generateChevron(n: number, _availW: number, _availH: number): LayoutResult {
  const numRows = Math.max(3, Math.min(Math.ceil(Math.sqrt(n * 1.2)), 7));
  return shapeToLayout(n, numRows, (t) => {
    return 1.0 - 0.6 * t;
  });
}

/** Wave: rows shift horizontally in a sine pattern (same row sizes, different offsets) */
function generateWave(n: number, availW: number, availH: number): LayoutResult {
  const gridCols = bestGridCols(n, availW, availH);
  const cols = gridCols;
  const numRows = Math.ceil(n / cols);

  const positions: BottlePosition[] = [];
  let placed = 0;
  for (let row = 0; row < numRows && placed < n; row++) {
    const count = Math.min(cols, n - placed);
    const rowW = count * TUBE_W + (count - 1) * GAP_X;
    const maxRowW = cols * TUBE_W + (cols - 1) * GAP_X;
    const baseOffset = (maxRowW - rowW) / 2;
    // Sine wave horizontal shift
    const waveOffset = Math.sin(row * Math.PI * 0.7) * STEP_X * 0.4;
    for (let j = 0; j < count; j++) {
      positions.push({
        x: baseOffset + j * STEP_X + waveOffset,
        y: row * STEP_Y,
      });
    }
    placed += count;
  }

  return normalize(positions);
}

// ─── Pattern registry ──────────────────────────────────────────

const ALL_PATTERNS: LayoutPattern[] = [
  { name: "honeycomb", minTubes: 6, maxTubes: 40, generate: generateHoneycomb },
  { name: "diamond",   minTubes: 8, maxTubes: 40, generate: generateDiamond },
  { name: "hourglass", minTubes: 10, maxTubes: 40, generate: generateHourglass },
  { name: "pyramid",   minTubes: 6, maxTubes: 40, generate: generatePyramid },
  { name: "chevron",   minTubes: 6, maxTubes: 40, generate: generateChevron },
  { name: "wave",      minTubes: 6, maxTubes: 40, generate: generateWave },
];

/**
 * Pick the best layout for a level.
 * Deterministically picks a pattern. Rejects if scale < 55% of optimal grid.
 */
export function getLayoutForLevel(
  levelNumber: number,
  tubeCount: number,
  availW: number,
  availH: number,
): LayoutResult {
  if (tubeCount <= 0) return { positions: [], width: 0, height: 0 };

  // Baseline: optimal plain grid
  const gridCols = bestGridCols(tubeCount, availW, availH);
  const gridRows: number[] = [];
  let rem = tubeCount;
  while (rem > 0) {
    gridRows.push(Math.min(gridCols, rem));
    rem -= gridCols;
  }
  const gridResult = normalize(rowsToPositions(gridRows));
  const gridScale = scaleFor(gridResult, availW, availH);

  const eligible = ALL_PATTERNS.filter(
    p => tubeCount >= p.minTubes && tubeCount <= p.maxTubes,
  );

  if (eligible.length === 0) return gridResult;

  const startIdx = ((levelNumber - 1) * 7) % eligible.length;
  for (let attempt = 0; attempt < eligible.length; attempt++) {
    const idx = (startIdx + attempt) % eligible.length;
    const pattern = eligible[idx]!;
    const result = pattern.generate(tubeCount, availW, availH);

    if (result.positions.length !== tubeCount) continue;
    if (hasOverlaps(result.positions)) continue;

    const scale = scaleFor(result, availW, availH);
    if (scale >= gridScale * 0.55) {
      return result;
    }
  }

  return gridResult;
}
