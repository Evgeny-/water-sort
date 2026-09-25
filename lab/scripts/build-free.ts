/**
 * Free mode pool: for each mechanic × difficulty tier, a couple of levels
 * picked (and hardened if needed) for that tier's planning-effort band.
 *
 * Run: npx tsx scripts/build-free.ts                   all buckets
 *      ONLY=orders,mix npx tsx scripts/build-free.ts   some buckets (run several in parallel)
 *      ONLY=none …                                     just merge
 * Each bucket is saved to analysis/free/, then every run merges what is there
 * (recoloured, see recolor) into src/levels/free.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Recipe } from "../src/engine/generate";
import type { LevelDef } from "../src/engine/types";
import { finalize, recipeFor, recolor, searchSteered, tierOf, TIER_NAMES, type Mech } from "./levelgen";

const PER_BUCKET = Number(process.env.PER_BUCKET ?? 2);
// middle of each difficulty track's range (see build-tracks.ts)
const TIER_TARGET = [0.1, 0.21, 0.34, 0.48];
const PARTS = new URL("../analysis/free/", import.meta.url);

const BUCKETS: Record<string, Mech[][]> = {
  classic: [[]],
  hidden: [["hidden"]],
  flask: [["flask"]],
  jar: [["jar"]],
  locks: [["locks"]],
  valve: [["valve"]],
  orders: [["orders"]],
  mix: [
    ["jar", "locks"],
    ["valve", "hidden"],
    ["flask", "valve"],
    ["jar", "hidden"],
    ["orders", "hidden"],
    ["locks", "hidden"],
    ["flask", "hidden"],
    ["jar", "valve", "hidden"],
  ],
};

/** `shift` moves the board size by whole colours, `boost` strengthens the mechanics (see searchSteered). */
function variants(mech: Mech[], tier: number, shift: number, boost: number): Recipe[] {
  const p = Math.min(1, [0.15, 0.4, 0.7, 0.95][tier]! + boost);
  const colorSet = [...new Set([[4, 5], [5, 6], [6, 7], [6, 7, 8]][tier]!.map((c) => Math.max(3, c + shift)))];
  const out: Recipe[] = [];
  const roomy = mech.includes("jar") || mech.includes("flask") || mech.includes("orders");
  const empties = tier === 0 ? [1, 2] : roomy ? [1, 0] : [1];
  for (const colors of colorSet)
    for (const empty of empties)
      for (const tpc of mech.includes("orders") || mech.includes("jar") ? [1] : colors <= 3 ? [2] : tier >= 2 ? [2, 1] : [1, 2]) {
        const r = recipeFor(mech, colors, tpc, empty, p);
        if (tier >= 2 && r.jars) r.jarAny = false;
        // a chameleon jar needs 8 portions of every colour, which doubles the board: use fewer colours
        if (r.jars && r.jarAny) r.colors = Math.max(3, r.colors - 2);
        out.push(r);
      }
  return out;
}

const only = process.env.ONLY?.split(",");
const reseed = Number(process.env.RESEED ?? 0);
if (!existsSync(PARTS)) mkdirSync(PARTS, { recursive: true });
Object.keys(BUCKETS).forEach((bucket, bi) => {
  if (only && !only.includes(bucket)) return;
  const mixes = BUCKETS[bucket]!;
  const tiers: LevelDef[][] = [];
  for (let tier = 0; tier < 4; tier++) {
    const list: LevelDef[] = [];
    for (let k = 0; k < PER_BUCKET; k++) {
      // mixes: every tier and slot gets a different combination
      const mech = mixes[(k * 4 + tier) % mixes.length]!;
      const seed = 313 + bi * 7_919 + tier * 104_729 + k * 1_299_709 + reseed * 15_485_863;
      const t0 = Date.now();
      const best = searchSteered(`${bucket}-${tier}-${k}`, (shift, boost) => variants(mech, tier, shift, boost), TIER_TARGET[tier]!, seed, {
        perVariant: 3,
        hardenIters: tier >= 2 ? 140 : 70,
        maxVessels: [13, 15, 16, 18][tier],
      });
      if (!best) continue;
      const l = finalize(best, seed);
      l.pack = bucket;
      l.name = String(k + 1);
      l.tier = tierOf(best.d);
      l.target = TIER_TARGET[tier]!;
      list.push(l);
      process.stderr.write(
        `${bucket.padEnd(8)} ${TIER_NAMES[tier]!.padEnd(14)} #${k + 1} ${(mech.join("+") || "classic").padEnd(22)} target ${(TIER_TARGET[tier]! * 100).toFixed(0).padStart(2)}%  got ${(best.d * 100).toFixed(0).padStart(3)}%  par ${l.par}${l.stats.exact ? "*" : ""}  ${Date.now() - t0}ms\n`,
      );
    }
    tiers.push(list);
  }
  writeFileSync(new URL(`${bucket}.json`, PARTS), JSON.stringify(tiers));
});

const out: Record<string, LevelDef[][]> = {};
for (const bucket of Object.keys(BUCKETS)) {
  const f = new URL(`${bucket}.json`, PARTS);
  if (existsSync(f)) out[bucket] = (JSON.parse(readFileSync(f, "utf8")) as LevelDef[][]).map((list) => list.map(recolor));
}
writeFileSync(new URL("../src/levels/free.json", import.meta.url), JSON.stringify(out));
process.stderr.write(`merged ${Object.keys(out).length} buckets into src/levels/free.json\n`);
