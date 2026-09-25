/**
 * Difficulty audit of the CURRENT game (src/game/levels.ts).
 *
 * For every level 1..MAX_LEVEL it generates several puzzles exactly like the
 * game does (createLevel), then plays each one many times with the same
 * "casual" heuristic player as scripts/benchmark-difficulty.ts.
 * Output: per-level mean / p10 / p90 solve rate, so you see both the curve
 * and how much a single level varies between attempts (restart = new puzzle).
 *
 * Run: npx tsx lab/scripts/analyze-current.ts > lab/analysis/current.json
 */
import { createLevel } from "../../src/game/levels";
import { type Tube, TUBE_CAPACITY } from "../../src/game/types";
import { isLevelComplete } from "../../src/game/engine";
import { solvePath } from "../../src/game/solver";

const MAX_LEVEL = Number(process.env.MAX_LEVEL ?? 100);
const PUZZLES = Number(process.env.PUZZLES ?? 10);
const SIMS = Number(process.env.SIMS ?? 120);
const MAX_MOVES = 400;

interface Move { from: number; to: number }

function hashState(tubes: Tube[]): string {
  const h: string[] = [];
  for (const t of tubes) h.push(t.length === 0 ? "_" : t.join(""));
  h.sort();
  return h.join("|");
}
function applyPour(tubes: Tube[], from: number, to: number): Tube[] {
  const source = [...tubes[from]!];
  const dest = [...tubes[to]!];
  const color = source[source.length - 1]!;
  let count = 1;
  for (let i = source.length - 2; i >= 0; i--) { if (source[i] === color) count++; else break; }
  const transferred = Math.min(count, TUBE_CAPACITY - dest.length);
  source.splice(source.length - transferred, transferred);
  for (let i = 0; i < transferred; i++) dest.push(color);
  return tubes.map((t, i) => (i === from ? source : i === to ? dest : t));
}
function getValidMoves(state: Tube[], ex: Set<number>): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < state.length; from++) {
    if (ex.has(from)) continue;
    const src = state[from]!;
    if (src.length === 0) continue;
    if (src.length === TUBE_CAPACITY && src.every((c) => c === src[0])) continue;
    const top = src[src.length - 1]!;
    let run = 1;
    for (let k = src.length - 2; k >= 0; k--) { if (src[k] === top) run++; else break; }
    let usedEmpty = false;
    for (let to = 0; to < state.length; to++) {
      if (from === to || ex.has(to)) continue;
      const dst = state[to]!;
      if (dst.length >= TUBE_CAPACITY) continue;
      if (dst.length > 0 && dst[dst.length - 1] !== top) continue;
      if (dst.length === 0 && run === src.length) continue;
      if (dst.length === 0) { if (usedEmpty) continue; usedEmpty = true; }
      moves.push({ from, to });
    }
  }
  return moves;
}
function topRun(t: Tube): number {
  if (t.length === 0) return 0;
  let c = 1;
  for (let i = t.length - 2; i >= 0; i--) { if (t[i] === t[t.length - 1]) c++; else break; }
  return c;
}
function scoreMove(state: Tube[], m: Move): number {
  const src = state[m.from]!, dst = state[m.to]!;
  const color = src[src.length - 1]!;
  const srcRun = topRun(src);
  const tr = Math.min(srcRun, TUBE_CAPACITY - dst.length);
  if (dst.length + tr === TUBE_CAPACITY && (dst.length === 0 || dst[dst.length - 1] === color) &&
      (dst.length === 0 ? tr === TUBE_CAPACITY : dst.every((c) => c === color))) return 10 + tr;
  if (dst.length > 0 && dst[dst.length - 1] === color) {
    return 4 + tr + (dst.every((c) => c === color) ? 2 : 0) + (topRun(dst) >= 2 ? 1 : 0);
  }
  if (srcRun === tr && src.length > srcRun) return 2 + tr;
  if (dst.length === 0) return 1;
  return -1;
}
function simulate(tubes: Tube[], ex: Set<number>): { solved: boolean; moves: number } {
  let state = tubes;
  const visited = new Set<string>([hashState(state)]);
  for (let step = 0; step < MAX_MOVES; step++) {
    if (isLevelComplete(state)) return { solved: true, moves: step };
    const moves = getValidMoves(state, ex);
    if (moves.length === 0) return { solved: false, moves: step };
    const scored = moves.map((m) => ({ m, s: scoreMove(state, m) })).sort((a, b) => b.s - a.s);
    let cand: Move[];
    if (Math.random() < 0.5) { const b = scored[0]!.s; cand = scored.filter((x) => x.s === b).map((x) => x.m); }
    else cand = scored.map((x) => x.m);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cand[i], cand[j]] = [cand[j]!, cand[i]!]; }
    let picked: Move | null = null;
    for (const m of cand) { if (!visited.has(hashState(applyPour(state, m.from, m.to)))) { picked = m; break; } }
    if (!picked) picked = cand[0]!;
    state = applyPour(state, picked.from, picked.to);
    visited.add(hashState(state));
    if (visited.size > 20) visited.delete(visited.values().next().value!);
  }
  return { solved: false, moves: MAX_MOVES };
}
const q = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!;
};

const rows: unknown[] = [];
for (let L = 1; L <= MAX_LEVEL; L++) {
  const rates: number[] = [];
  const pars: number[] = [];
  let movesSum = 0, movesN = 0;
  let sample = createLevel(L);
  for (let p = 0; p < PUZZLES; p++) {
    const level = p === 0 ? sample : createLevel(L);
    const ex = new Set<number>();
    for (let i = level.tubes.length - level.paidTubes; i < level.tubes.length; i++) ex.add(i);
    let solved = 0;
    for (let s = 0; s < SIMS; s++) {
      const r = simulate(level.tubes, ex);
      if (r.solved) { solved++; movesSum += r.moves; movesN++; }
    }
    rates.push(solved / SIMS);
    const filled = level.tubes.filter((t) => t.length > 0).length;
    if (filled <= 8) {
      const res = solvePath(level.tubes, ex);
      if (res && res.solvable) pars.push(res.moves.length);
    }
  }
  sample = sample!;
  const filled = sample.tubes.filter((t) => t.length > 0).length;
  const empty = sample.tubes.length - filled - sample.paidTubes;
  const row = {
    level: L,
    colors: sample.colors,
    filled,
    empty,
    challenge: L >= 10 && L % 5 === 0,
    fixedPar: sample.par,
    mean: rates.reduce((a, b) => a + b, 0) / rates.length,
    p10: q(rates, 0.1),
    p50: q(rates, 0.5),
    p90: q(rates, 0.9),
    min: Math.min(...rates),
    max: Math.max(...rates),
    avgMoves: movesN ? movesSum / movesN : 0,
    optimalPars: pars,
  };
  rows.push(row);
  process.stderr.write(
    `L${String(L).padStart(3)} ${sample.colors}c ${String(filled).padStart(2)}f ${empty}e ${row.challenge ? "CH" : "  "} ` +
      `solve mean ${(row.mean * 100).toFixed(0).padStart(3)}%  p10 ${(row.p10 * 100).toFixed(0).padStart(3)}%  p90 ${(row.p90 * 100).toFixed(0).padStart(3)}%` +
      (pars.length ? `  par fixed ${sample.par} vs optimal ${Math.min(...pars)}–${Math.max(...pars)}` : "") + "\n",
  );
}
console.log(JSON.stringify(rows));
