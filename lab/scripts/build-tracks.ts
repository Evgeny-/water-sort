/**
 * Four difficulty tracks (easy · medium · hard · very hard), 25 levels each.
 * The player picks a track in the main menu; each track has its own progress.
 *
 * Inside a track difficulty rises gently across the tier's band, and every 5th
 * level is a challenge: a mix of mechanics, a notch harder. Every track opens
 * with a mechanic rather than plain classic and shows all six within its first
 * 7 levels, each track in its own order. After that mechanics are combined more
 * and more; hidden layers work as a modifier on top of anything (classic
 * included), so the harder the track, the more of its levels hide colours.
 * Difficulty is planning effort (see levelgen.ts).
 *
 * Run: npx tsx scripts/build-tracks.ts               all four tracks
 *      TRACK=3 ONLY=1-8 npx tsx scripts/build-tracks.ts   part of one track (run several in parallel)
 *      RESEED=1 …                                     fresh seeds
 *      ONLY=0 …                                       just merge
 * Each level is saved to analysis/levels/, then every run merges what is there
 * (recoloured, see recolor) into src/levels/track0.json … track3.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Recipe } from "../src/engine/generate";
import type { LevelDef } from "../src/engine/types";
import { finalize, recipeFor, recolor, searchSteered, type Mech } from "./levelgen";

const CODES: Record<string, Mech> = { J: "jar", O: "orders", L: "locks", V: "valve", F: "flask", H: "hidden" };

interface Track {
  name: string;
  /** planning-effort target of the first and the last level */
  lo: number;
  hi: number;
  /** colours on early / late levels */
  colors: [number[], number[]];
  /** 25 levels in groups of five (the 5th is the challenge): C classic · J jar · O orders · L locks · V valve · F flask · H hidden, "+" combines */
  seq: string;
}

const TRACKS: Track[] = [
  {
    name: "лёгкий",
    lo: 0.05,
    hi: 0.17,
    colors: [[4, 5], [5, 6]],
    seq: "O J V L J+V | F H C O J+L | V+H F H J O+H | L V F+H O F+V | J+H L+V C O J+L+H",
  },
  {
    name: "средний",
    lo: 0.14,
    hi: 0.28,
    colors: [[5, 6], [6, 7]],
    seq: "J O H V O+H | L F H J+L V+H | F+V J+H O L+H J+V | C F+H V+L O J+L+H | V+H J H O+H F+V+H",
  },
  {
    name: "сложный",
    lo: 0.26,
    hi: 0.42,
    colors: [[6, 7], [7, 8]],
    seq: "V J O H J+H | F L+H H V+L V+H | O+H F+H J+L V F+V+H | H J+H O+V L+V J+L+H | V+H O+H F+H J+V L+F+H",
  },
  {
    name: "очень сложный",
    lo: 0.38,
    hi: 0.58,
    colors: [[6, 7, 8], [7, 8, 9]],
    seq: "H J+H V+H O+H J+V+H | F+H L+H H J+L+H F+V+H | O+H V+L+H O+V+H H L+F+H | V+H J+L O+H F+V+H J+V+H | H L+V+H J+H F+V J+L+V+H",
  },
];

const LEVELS = 25;
const PARTS = new URL("../analysis/levels/", import.meta.url);

interface Slot {
  tier: number;
  k: number; // 1-based
  mech: Mech[];
  boss: boolean;
  label: string;
}

function slotsOf(tier: number): Slot[] {
  const codes = TRACKS[tier]!.seq.split(/[\s|]+/).filter(Boolean);
  if (codes.length !== LEVELS) throw new Error(`track ${tier}: ${codes.length} levels`);
  return codes.map((code, i) => {
    const mech = code
      .split("+")
      .filter((c) => c !== "C")
      .map((c) => CODES[c]!);
    return { tier, k: i + 1, mech, boss: (i + 1) % 5 === 0, label: mech.join("+") || "classic" };
  });
}

/** Largest board per track that still reads well on a phone. */
const MAX_VESSELS = [13, 15, 16, 18];

/** Gentle ramp across the band; challenges a notch above it, the level after one a notch below. */
function targetFor(s: Slot): number {
  const t = TRACKS[s.tier]!;
  let d = t.lo + ((t.hi - t.lo) * (s.k - 1)) / (LEVELS - 1);
  if (s.boss) d += 0.05;
  else if (s.k > 1 && s.k % 5 === 1) d -= 0.02;
  return Math.round(d * 1000) / 1000;
}

function variants(s: Slot, shift: number, boost: number): Recipe[] {
  const t = TRACKS[s.tier]!;
  const late = s.k > 12;
  const p = Math.min(1, [0.2, 0.45, 0.7, 0.95][s.tier]! + (0.1 * (s.k - 1)) / (LEVELS - 1) + boost);
  const colorsList = [...new Set((late ? t.colors[1] : t.colors[0]).map((c) => Math.max(3, c + shift)))];
  const orders = s.mech.includes("orders");
  const roomy = s.mech.includes("jar") || s.mech.includes("flask");
  // with two spare bottles almost any layout is easy for a player who plans
  const empties = s.tier === 0 ? [1, 2] : orders ? [1, 0] : roomy ? (s.tier >= 3 ? [0, 1] : [1, 0]) : [1];
  const out: Recipe[] = [];
  for (const colors of colorsList)
    for (const empty of empties)
      for (const tpc of orders || s.mech.includes("jar") ? [1] : s.tier >= 2 ? [2, 1] : [1, 2]) {
        const r = recipeFor(s.mech, colors, tpc, empty, p);
        // a jar with its colour on the label is easier to read; the chameleon jar comes later on gentle tracks
        if (r.jars && !(s.tier <= 1 && s.k > 8)) r.jarAny = false;
        // a chameleon jar needs 8 portions of every colour, which doubles the board: use fewer colours
        if (r.jars && r.jarAny) r.colors = Math.max(3, r.colors - 2);
        out.push(r);
      }
  return out;
}

/** "1-8,12" → [1..8, 12] */
function parseOnly(v: string | undefined): number[] | null {
  if (!v) return null;
  return v.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i);
  });
}

function merge(tier: number) {
  const prefix = `t${tier}-`;
  const levels = readdirSync(PARTS)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => recolor(JSON.parse(readFileSync(new URL(f, PARTS), "utf8")) as LevelDef))
    .sort((a, b) => Number(a.name) - Number(b.name));
  writeFileSync(new URL(`../src/levels/track${tier}.json`, import.meta.url), JSON.stringify(levels));
  return levels.length;
}

const only = parseOnly(process.env.ONLY);
const reseed = Number(process.env.RESEED ?? 0);
const tiers = process.env.TRACK !== undefined ? [Number(process.env.TRACK)] : [0, 1, 2, 3];
if (!existsSync(PARTS)) mkdirSync(PARTS, { recursive: true });

for (const tier of tiers) {
  for (const s of slotsOf(tier)) {
    if (only && !only.includes(s.k)) continue;
    const target = targetFor(s);
    const t0 = Date.now();
    const best = searchSteered(`t${tier}-${s.k}`, (shift, boost) => variants(s, shift, boost), target, 5000 + tier * 10_007 + s.k * 131 + reseed * 7_919, {
      perVariant: s.tier >= 2 ? 4 : 3,
      hardenIters: [80, 120, 160, 200][tier]!,
      maxVessels: MAX_VESSELS[tier],
    });
    if (!best) {
      process.stderr.write(`!! ${TRACKS[tier]!.name} ${s.k} ${s.label}: nothing usable\n`);
      continue;
    }
    // a rebuild only replaces the saved level when it lands closer to the target
    const part = new URL(`t${tier}-${s.k}.json`, PARTS);
    if (existsSync(part)) {
      const old = JSON.parse(readFileSync(part, "utf8")) as LevelDef;
      if (old.target === target && Math.abs((old.stats.effort ?? 0) - target) <= Math.abs(best.d - target)) {
        process.stderr.write(`   ${TRACKS[tier]!.name} ${s.k}: kept the saved level (${Math.round((old.stats.effort ?? 0) * 100)}% vs ${Math.round(best.d * 100)}%)\n`);
        continue;
      }
    }
    const l = finalize(best, 900 + tier * 100 + s.k);
    l.id = `t${tier}-${s.k}`;
    l.pack = `track${tier}`;
    l.name = String(s.k);
    l.tier = tier;
    l.target = target;
    if (s.boss) l.boss = true;
    writeFileSync(part, JSON.stringify(l));
    process.stderr.write(
      `${TRACKS[tier]!.name.padEnd(14)} ${String(s.k).padStart(2)}${s.boss ? "★" : " "} ${s.label.padEnd(22)} target ${(target * 100).toFixed(0).padStart(3)}%  got ${(best.d * 100).toFixed(0).padStart(3)}%  ` +
        `vessels ${String(l.vessels.length).padStart(2)}  par ${String(l.par).padStart(3)}${l.stats.exact ? "*" : " "}  ${Date.now() - t0}ms\n`,
    );
  }
  process.stderr.write(`merged ${merge(tier)} levels into src/levels/track${tier}.json\n`);
}
