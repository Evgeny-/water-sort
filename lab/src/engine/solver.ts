import type { LevelDef, Move, State } from "./types";
import { applyPour, canPour, hashState, isMonochrome, isWin, sourceBlock, sourceRun, validMoves } from "./rules";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moves for exhaustive search, with symmetry pruning. */
function searchMoves(state: State, level: LevelDef): Move[] {
  const out: Move[] = [];
  const vs = state.vessels;
  const n = vs.length;
  const total = n + state.slots.length;
  for (let from = 0; from < n; from++) {
    if (sourceBlock(state, level.mode, from) !== null) continue;
    const src = vs[from]!;
    const mono = isMonochrome(src);
    const seenEmpty = new Set<string>();
    for (let to = 0; to < total; to++) {
      if (!canPour(state, level.mode, from, to)) continue;
      if (to < n) {
        const dst = vs[to]!;
        if (dst.layers.length === 0) {
          // pouring a single-colour vessel into an identical empty one changes nothing
          if (mono && dst.kind === src.kind && dst.cap === src.cap && src.kind !== "valve") continue;
          const sig = dst.kind + dst.cap + ":" + dst.accept + ":" + dst.lock;
          if (seenEmpty.has(sig)) continue;
          seenEmpty.add(sig);
        }
      }
      out.push({ from, to });
    }
  }
  return out;
}

export interface SolveOut {
  solvable: boolean;
  path: Move[] | null;
  states: number;
  /** false when the search hit the state cap (result unknown / par not optimal) */
  exact: boolean;
}

/** Breadth-first search: optimal (fewest pours) solution. */
export function solveBfs(level: LevelDef, start: State, maxStates = 250_000): SolveOut {
  if (isWin(start, level.mode)) return { solvable: true, path: [], states: 1, exact: true };
  const states: State[] = [start];
  const parent: number[] = [-1];
  const via: Move[] = [{ from: -1, to: -1 }];
  const seen = new Set<string>([hashState(start)]);
  for (let head = 0; head < states.length; head++) {
    const s = states[head]!;
    for (const m of searchMoves(s, level)) {
      const next = applyPour(s, level, m.from, m.to).state;
      const h = hashState(next);
      if (seen.has(h)) continue;
      seen.add(h);
      states.push(next);
      parent.push(head);
      via.push(m);
      if (isWin(next, level.mode)) {
        const path: Move[] = [];
        for (let i = states.length - 1; i > 0; i = parent[i]!) path.push(via[i]!);
        path.reverse();
        return { solvable: true, path, states: states.length, exact: true };
      }
      if (states.length > maxStates) return { solvable: false, path: null, states: states.length, exact: false };
    }
    // free memory of processed layer lazily: keep arrays (needed for parents)
  }
  return { solvable: false, path: null, states: states.length, exact: true };
}

// ─── "Casual player" — same scoring idea as scripts/benchmark-difficulty.ts ───

function scoreMove(state: State, _level: LevelDef, m: Move): number {
  const n = state.vessels.length;
  const src = state.vessels[m.from]!;
  const run = sourceRun(src)!;
  if (m.to >= n) {
    const slot = state.slots[m.to - n]!;
    const tr = Math.min(run.count, slot.cap - slot.fill);
    return 9 + tr + (slot.fill + tr >= slot.cap ? 3 : 0);
  }
  const dst = state.vessels[m.to]!;
  const tr = Math.min(run.count, dst.cap - dst.layers.length);
  if (dst.kind === "jar") return 6 + tr + (dst.layers.length + tr >= dst.cap ? 4 : 0);
  const dstUniform = dst.layers.length > 0 && isMonochrome(dst);
  if (dst.kind !== "flask" && dst.layers.length + tr === dst.cap && (dst.layers.length === 0 ? tr === dst.cap : dstUniform)) {
    return 10 + tr;
  }
  if (dst.layers.length > 0) {
    let dstRun = 1;
    for (let i = dst.layers.length - 2; i >= 0; i--) {
      if (dst.layers[i] === run.color) dstRun++;
      else break;
    }
    return 4 + tr + (dstUniform ? 2 : 0) + (dstRun >= 2 ? 1 : 0);
  }
  if (run.count === tr && src.layers.length > run.count) return 2 + tr;
  // pointless shuffles of uniform vessels into empties are what humans avoid too
  if (isMonochrome(src) && dst.kind === src.kind) return -2;
  return 1;
}

/**
 * Plays like a casual human: half the time picks among the best-looking moves,
 * half the time any legal move; avoids the last 20 states.
 */
export function casualPlay(level: LevelDef, start: State, rng: Rng, maxMoves = 400): { solved: boolean; moves: number } {
  let state = start;
  const recent: string[] = [hashState(state)];
  const recentSet = new Set(recent);
  for (let step = 0; step < maxMoves; step++) {
    if (isWin(state, level.mode)) return { solved: true, moves: step };
    const moves = validMoves(state, level.mode);
    if (moves.length === 0) return { solved: false, moves: step };
    const scored = moves.map((m) => ({ m, s: scoreMove(state, level, m) })).sort((a, b) => b.s - a.s);
    let cand: Move[];
    if (rng() < 0.5) {
      const best = scored[0]!.s;
      cand = scored.filter((x) => x.s === best).map((x) => x.m);
    } else {
      cand = scored.map((x) => x.m);
    }
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cand[i], cand[j]] = [cand[j]!, cand[i]!];
    }
    let picked: Move | null = null;
    let pickedState: State | null = null;
    for (const m of cand) {
      const next = applyPour(state, level, m.from, m.to).state;
      if (!recentSet.has(hashState(next))) {
        picked = m;
        pickedState = next;
        break;
      }
    }
    if (!picked) {
      picked = cand[0]!;
      pickedState = applyPour(state, level, picked.from, picked.to).state;
    }
    state = pickedState!;
    const h = hashState(state);
    recent.push(h);
    recentSet.add(h);
    if (recent.length > 20) recentSet.delete(recent.shift()!);
  }
  return { solved: false, moves: maxMoves };
}

export function casualRate(level: LevelDef, start: State, sims: number, rng: Rng): { rate: number; bestMoves: number } {
  let solved = 0;
  let best = Infinity;
  for (let i = 0; i < sims; i++) {
    const r = casualPlay(level, start, rng);
    if (r.solved) {
      solved++;
      best = Math.min(best, r.moves);
    }
  }
  return { rate: solved / sims, bestMoves: best };
}

// ─── Beam search: near-optimal par for levels too big for BFS ───

/**
 * Depth-first search that tries the most natural moves first and remembers only
 * position hashes, so it covers far more positions than BFS in the same memory.
 * `complete` means every reachable position was visited: with no path, the
 * position is proven lost. The path is a solution, not necessarily the shortest.
 */
export function solveDfs(level: LevelDef, start: State, cap = 300_000): { path: Move[] | null; complete: boolean } {
  if (isWin(start, level.mode)) return { path: [], complete: true };
  const expand = (s: State) =>
    searchMoves(s, level)
      .map((m) => {
        const n = applyPour(s, level, m.from, m.to).state;
        return { m, n, k: heuristic(n, level) };
      })
      .sort((a, b) => a.k - b.k);
  const seen = new Set<string>([hashState(start)]);
  // explicit stack: solution paths can be far deeper than the call stack allows
  const stack = [{ kids: expand(start), i: 0 }];
  const path: Move[] = [];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    if (top.i >= top.kids.length) {
      stack.pop();
      path.pop();
      continue;
    }
    const { m, n } = top.kids[top.i++]!;
    const h = hashState(n);
    if (seen.has(h)) continue;
    seen.add(h);
    if (isWin(n, level.mode)) return { path: [...path, m], complete: true };
    if (seen.size > cap) return { path: null, complete: false };
    path.push(m);
    stack.push({ kids: expand(n), i: 0 });
  }
  return { path: null, complete: true };
}

export function heuristic(state: State, level: LevelDef): number {
  let boundaries = 0;
  const holders = new Map<number, number>();
  for (const v of state.vessels) {
    let prev = -1;
    const seenHere = new Set<number>();
    for (let i = 0; i < v.layers.length; i++) {
      // the player can't see a hidden layer's colour: count it as a likely boundary, not as a colour
      if (v.hidden[i]) {
        boundaries += 1;
        prev = -1;
        continue;
      }
      const c = v.layers[i]!;
      if (prev !== -1 && c !== prev) boundaries++;
      prev = c;
      seenHere.add(c);
    }
    for (const c of seenHere) holders.set(c, (holders.get(c) ?? 0) + 1);
  }
  let splits = 0;
  for (const n of holders.values()) splits += n - 1;
  let pending = 0;
  if (level.mode === "orders") {
    for (let i = state.qi; i < level.queue.length; i++) pending += 1;
    for (const s of state.slots) if (s) pending += 1 - s.fill / s.cap;
  }
  return boundaries * 1.0 + splits * 0.8 + pending * 1.5;
}

export function solveBeam(level: LevelDef, start: State, width = 2500, maxDepth = 220): Move[] | null {
  interface Node { state: State; parent: number; move: Move; score: number }
  const nodes: Node[] = [{ state: start, parent: -1, move: { from: -1, to: -1 }, score: 0 }];
  let frontier = [0];
  const seen = new Set<string>([hashState(start)]);
  const pathTo = (i: number) => {
    const p: Move[] = [];
    for (let k = i; k > 0; k = nodes[k]!.parent) p.push(nodes[k]!.move);
    return p.reverse();
  };
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: number[] = [];
    for (const idx of frontier) {
      const s = nodes[idx]!.state;
      for (const m of searchMoves(s, level)) {
        const s2 = applyPour(s, level, m.from, m.to).state;
        const h = hashState(s2);
        if (seen.has(h)) continue;
        seen.add(h);
        nodes.push({ state: s2, parent: idx, move: m, score: heuristic(s2, level) });
        const ni = nodes.length - 1;
        if (isWin(s2, level.mode)) return pathTo(ni);
        next.push(ni);
      }
    }
    if (!next.length) return null;
    next.sort((a, b) => nodes[a]!.score - nodes[b]!.score);
    frontier = next.slice(0, width);
  }
  return null;
}

// ─── "Strategist" player: reduces disorder, avoids dead ends and loops ───

/**
 * A thoughtful player: scores each move by how much it reduces disorder
 * (same heuristic as beam search), refuses moves into immediate dead ends,
 * avoids revisiting states, and samples with a softmax so it still makes
 * the occasional plausible mistake. Closer to a person who thinks than the
 * casual player, so its failures mean the level needs real planning.
 */
export function smartPlay(level: LevelDef, start: State, rng: Rng, temp = 0.55, maxMoves = 260): { solved: boolean; moves: number } {
  let state = start;
  const visits = new Map<string, number>([[hashState(start), 1]]);
  for (let step = 0; step < maxMoves; step++) {
    if (isWin(state, level.mode)) return { solved: true, moves: step };
    const moves = validMoves(state, level.mode);
    if (!moves.length) return { solved: false, moves: step };
    const cands: { next: State; key: string; s: number; w: number }[] = [];
    for (const m of moves) {
      const next = applyPour(state, level, m.from, m.to).state;
      if (isWin(next, level.mode)) return { solved: true, moves: step + 1 };
      const key = hashState(next);
      const dead = validMoves(next, level.mode).length === 0;
      const s = -heuristic(next, level) + scoreMove(state, level, m) * 0.12 - (dead ? 40 : 0) - (visits.get(key) ?? 0) * 3;
      cands.push({ next, key, s, w: 0 });
    }
    let best = -Infinity;
    for (const c of cands) best = Math.max(best, c.s);
    let sum = 0;
    for (const c of cands) {
      c.w = Math.exp((c.s - best) / temp);
      sum += c.w;
    }
    let r = rng() * sum;
    let pick = cands[cands.length - 1]!;
    for (const c of cands) {
      r -= c.w;
      if (r <= 0) {
        pick = c;
        break;
      }
    }
    state = pick.next;
    visits.set(pick.key, (visits.get(pick.key) ?? 0) + 1);
  }
  return { solved: false, moves: maxMoves };
}

export function smartRate(level: LevelDef, start: State, sims: number, rng: Rng): { rate: number; bestMoves: number } {
  let solved = 0;
  let best = Infinity;
  for (let i = 0; i < sims; i++) {
    const r = smartPlay(level, start, rng);
    if (r.solved) {
      solved++;
      best = Math.min(best, r.moves);
    }
  }
  return { rate: solved / sims, bestMoves: best };
}

// ─── Planning effort: what a player with undo actually has to explore ───

/**
 * Depth-first search that tries the most natural-looking moves first
 * (lowest disorder after the move, with a little noise) and backtracks
 * out of dead ends — like a person who can press undo. Returns how many
 * positions it had to visit before the first solution.
 */
export function searchEffort(level: LevelDef, start: State, rng: Rng, cap = 12_000, noise = 0.7): { nodes: number; solved: boolean; depth: number } {
  const seen = new Set<string>();
  let nodes = 0;
  let depthFound = 0;
  const dfs = (s: State, depth: number): boolean => {
    if (isWin(s, level.mode)) {
      depthFound = depth;
      return true;
    }
    if (nodes >= cap || depth > 400) return false;
    const key = hashState(s);
    if (seen.has(key)) return false;
    seen.add(key);
    nodes++;
    const next = searchMoves(s, level).map((m) => {
      const n = applyPour(s, level, m.from, m.to).state;
      return { n, k: heuristic(n, level) + rng() * noise };
    });
    next.sort((a, b) => a.k - b.k);
    for (const c of next) if (dfs(c.n, depth + 1)) return true;
    return false;
  };
  const solved = dfs(start, 0);
  return { nodes, solved, depth: depthFound };
}

/**
 * Difficulty 0..1 from planning effort: log2 of (positions explored / solution
 * length), scaled so 1× = 0, 8× = 0.5, 64× = 1. Median of several noisy runs.
 */
export function effortDifficulty(level: LevelDef, start: State, runs: number, rng: Rng, cap = 12_000): { d: number; ratio: number; par: number } {
  const ratios: number[] = [];
  let par = Infinity;
  for (let i = 0; i < runs; i++) {
    const r = searchEffort(level, start, rng, cap);
    if (!r.solved) {
      ratios.push(64);
      continue;
    }
    par = Math.min(par, r.depth);
    ratios.push(Math.max(1, r.nodes / Math.max(1, r.depth)));
  }
  ratios.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)]!;
  return { d: Math.max(0, Math.min(1, Math.log2(med) / 6)), ratio: med, par };
}
