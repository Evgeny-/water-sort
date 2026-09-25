/**
 * Builds the analysis page (lab/report/report.html) from the measured data:
 * analysis/current.json (current game audit), analysis/knobs.json (mechanics as
 * difficulty knobs) and src/levels/track0..3.json (the four difficulty tracks).
 * Run: npx tsx scripts/build-report.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { LevelDef } from "../src/engine/types";

const LAB_URL = process.env.LAB_URL ?? "https://claude.ai/artifact/YU1xNQNechajHcor4qiGHq";

interface CurRow {
  level: number;
  colors: number;
  filled: number;
  empty: number;
  challenge: boolean;
  fixedPar: number;
  mean: number;
  p10: number;
  p90: number;
  optimalPars: number[];
}
interface Knob {
  group: string;
  label: string;
  mean: number;
}

const cur = JSON.parse(readFileSync(new URL("../analysis/current.json", import.meta.url), "utf8")) as CurRow[];
const knobs = JSON.parse(readFileSync(new URL("../analysis/knobs.json", import.meta.url), "utf8")) as Knob[];
const tracks = [0, 1, 2, 3].map((t) => JSON.parse(readFileSync(new URL(`../src/levels/track${t}.json`, import.meta.url), "utf8")) as LevelDef[]);
const calib = JSON.parse(readFileSync(new URL("../analysis/effort-calibration.json", import.meta.url), "utf8")) as { name: string; effort: number; casual: number }[];
const eff = (l: LevelDef) => l.stats.effort ?? 1 - l.stats.casual;
const lvlNo = (l: LevelDef) => Number(l.name);

const pct = (x: number) => `${Math.round(x * 100)}%`;
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const TIER_NAMES = ["Лёгкий", "Средний", "Сложный", "Очень сложный"];
const MECH_NAMES: Record<string, string> = {
  hidden: "скрытые слои",
  flask: "мини-колба",
  jar: "бак",
  locks: "замки",
  valve: "кран",
  orders: "заказы",
};

// ─── headline numbers ─────────────────────────────────────────────────────
const chD = cur.filter((r) => r.challenge).map((r) => 1 - r.mean);
const normD = cur.filter((r) => !r.challenge && r.level >= 10).map((r) => 1 - r.mean);
const spread = cur.filter((r) => r.level >= 10).map((r) => r.p90 - r.p10);
const dev = tracks.flat().map((l) => Math.abs(eff(l) - (l.target ?? 0)));
const mechNames = (l: LevelDef) => (l.mechanics ?? []).map((m) => MECH_NAMES[m]).join(" + ") || "классика";
const byTier = (lo: number, hi: number) => avg(cur.filter((r) => !r.challenge && r.level >= lo && r.level <= hi).map((r) => 1 - r.mean));

// ─── chart 1: current game ────────────────────────────────────────────────
function chartCurrent() {
  const W = 720;
  const H = 300;
  const p = { l: 44, r: 14, t: 16, b: 34 };
  const x = (lv: number) => p.l + ((lv - 1) / 99) * (W - p.l - p.r);
  const y = (v: number) => p.t + (1 - v) * (H - p.t - p.b);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((v) => `<line class="grid" x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${p.l - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`)
    .join("");
  const xt = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    .map((lv) => `<text class="tick" x="${x(lv)}" y="${H - p.b + 18}" text-anchor="middle">${lv}</text>`)
    .join("");
  const normal = cur.filter((r) => !r.challenge);
  const line = normal.map((r, i) => `${i ? "L" : "M"}${x(r.level).toFixed(1)},${y(1 - r.mean).toFixed(1)}`).join("");
  const whisk = cur
    .map((r) => `<line class="whisk ${r.challenge ? "s2" : "s1"}" x1="${x(r.level)}" x2="${x(r.level)}" y1="${y(1 - r.p90)}" y2="${y(1 - r.p10)}"/>`)
    .join("");
  const dots = cur
    .map((r) => `<circle class="dot ${r.challenge ? "s2" : "s1"}" cx="${x(r.level).toFixed(1)}" cy="${y(1 - r.mean).toFixed(1)}" r="${r.challenge ? 4.5 : 3.2}"/>`)
    .join("");
  const l10 = cur.find((r) => r.level === 10)!;
  const note = `<text class="note" x="${x(10) + 8}" y="${y(1 - l10.mean) - 8}">10-й уровень: сразу ${pct(1 - l10.mean)}</text>`;
  const pts = cur.map((r) => ({
    x: +x(r.level).toFixed(1),
    t: `Уровень ${r.level}${r.challenge ? " · челлендж" : ""}`,
    v: `${pct(1 - r.mean)}`,
    s: `разброс ${pct(1 - r.p90)}–${pct(1 - r.p10)} · ${r.colors} цв., ${r.filled} бут. + ${r.empty} пуст.`,
  }));
  return `<figure class="chart" data-points='${esc(JSON.stringify(pts))}'>
    <div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Сложность уровней 1–100 в текущей игре">
      ${grid}${xt}
      <text class="axis-title" x="${W - p.r}" y="${H - 2}" text-anchor="end">уровень</text>
      ${whisk}<path class="line s1" d="${line}"/>${dots}${note}
      <line class="cross" y1="${p.t}" y2="${H - p.b}" x1="-10" x2="-10"/>
    </svg></div>
    <div class="tip" hidden></div>
    <figcaption class="legend">
      <span><i class="key dot-key s1"></i>обычные уровни</span>
      <span><i class="key dot-key s2 big"></i>каждый 5-й — челлендж с одной пустой колбой</span>
      <span><i class="key whisk-key"></i>разброс между генерациями (10–90 перцентиль)</span>
    </figcaption>
  </figure>`;
}

// ─── chart 2: mechanics as knobs ───────────────────────────────────────────
function chartKnobs() {
  const groups = [
    { key: "4c×2", title: "4 цвета × 2 бутылки" },
    { key: "6c×2", title: "6 цветов × 2 бутылки" },
    { key: "5c×1", title: "Режим заказов, 5–6 цветов", alt: "6c×1" },
  ];
  const base = (label: string) => label === "2 пустые" || label === "1 пустая";
  let rows = "";
  let table = "";
  for (const g of groups) {
    const items = knobs.filter((k) => k.group === g.key || k.group === g.alt).sort((a, b) => (1 - a.mean) - (1 - b.mean));
    rows += `<div class="bar-group"><h4>${g.title}</h4>`;
    for (const k of items) {
      const d = 1 - k.mean;
      rows += `<div class="bar-row" tabindex="0" data-tip="${esc(`${k.label}: бот не проходит ${pct(d)} партий`)}">
        <span class="bar-label">${esc(k.label)}</span>
        <span class="bar-track"><span class="bar ${base(k.label) ? "base" : "mech"}" style="width:${Math.max(0.6, d * 100)}%"></span><span class="bar-val">${pct(d)}</span></span>
      </div>`;
      table += `<tr><td>${g.title}</td><td>${esc(k.label)}</td><td class="num">${pct(d)}</td></tr>`;
    }
    rows += `</div>`;
  }
  return { rows, table };
}

// ─── chart 3: the four difficulty tracks ───────────────────────────────────
function chartTracks() {
  const W = 720;
  const H = 320;
  const p = { l: 44, r: 14, t: 16, b: 34 };
  const n = 25;
  const x = (lv: number) => p.l + ((lv - 1) / (n - 1)) * (W - p.l - p.r);
  const y = (v: number) => p.t + (1 - Math.min(v, 0.8) / 0.8) * (H - p.t - p.b);
  const grid = [0, 0.2, 0.4, 0.6, 0.8]
    .map((v) => `<line class="grid" x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${p.l - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`)
    .join("");
  const xt = [1, 5, 10, 15, 20, 25].map((lv) => `<text class="tick" x="${x(lv)}" y="${H - p.b + 18}" text-anchor="middle">${lv}</text>`).join("");
  const shape = (t: number, cx: number, cy: number, k = 1) => {
    const s = 5.2 * k;
    if (t === 0) return `<circle cx="${cx}" cy="${cy}" r="${s * 0.95}"/>`;
    if (t === 1) return `<rect x="${cx - s * 0.85}" y="${cy - s * 0.85}" width="${s * 1.7}" height="${s * 1.7}" rx="1.5"/>`;
    if (t === 2) return `<path d="M${cx},${cy - s * 1.1}L${cx + s},${cy + s * 0.75}L${cx - s},${cy + s * 0.75}Z"/>`;
    return `<path d="M${cx},${cy - s * 1.15}L${cx + s},${cy}L${cx},${cy + s * 1.15}L${cx - s},${cy}Z"/>`;
  };
  const targets = tracks
    .map((tr, t) => `<path class="line tl t${t}" d="${tr.map((l, i) => `${i ? "L" : "M"}${x(lvlNo(l)).toFixed(1)},${y(l.target ?? 0).toFixed(1)}`).join("")}"/>`)
    .join("");
  const marks = tracks
    .map((tr, t) => tr.map((l) => `<g class="mk t${t}${l.boss ? " boss" : ""}">${shape(t, +x(lvlNo(l)).toFixed(1), +y(eff(l)).toFixed(1), l.boss ? 1.45 : 1)}</g>`).join(""))
    .join("");
  const pts = Array.from({ length: n }, (_, i) => {
    const row = tracks.map((tr) => tr.find((l) => lvlNo(l) === i + 1));
    return {
      x: +x(i + 1).toFixed(1),
      t: `Уровень ${i + 1}${(i + 1) % 5 === 0 ? " · испытание" : ""}`,
      v: row.map((l) => (l ? pct(eff(l)) : "—")).join(" · "),
      s: row.map((l, t) => `${TIER_NAMES[t]}: ${l ? `${pct(eff(l))} (цель ${pct(l.target ?? 0)}), ${mechNames(l)}` : "—"}`).join("\n"),
    };
  });
  const table = tracks
    .flatMap((tr, t) =>
      tr.map(
        (l) =>
          `<tr><td>${TIER_NAMES[t]}</td><td class="num">${l.name}${l.boss ? " ★" : ""}</td><td>${mechNames(l)}</td><td class="num">${pct(l.target ?? 0)}</td><td class="num">${pct(eff(l))}</td><td class="num">${l.vessels.length}</td><td class="num">${l.par}${l.stats.exact ? "*" : ""}</td></tr>`,
      ),
    )
    .join("");
  return {
    svg: `<figure class="chart" data-points='${esc(JSON.stringify(pts))}'>
      <div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Сложность уровней четырёх трасс: цель и замер">
        ${grid}${xt}
        <text class="axis-title" x="${W - p.r}" y="${H - 2}" text-anchor="end">уровень трассы</text>
        ${targets}${marks}
        <line class="cross" y1="${p.t}" y2="${H - p.b}" x1="-10" x2="-10"/>
      </svg></div>
      <div class="tip" hidden></div>
      <figcaption class="legend">
        ${TIER_NAMES.map((t, i) => `<span><svg class="key-shape t${i}" viewBox="-7 -7 14 14" aria-hidden="true">${shape(i, 0, 0)}</svg>${t}</span>`).join("")}
        <span><i class="key dash-key"></i>цель трассы</span>
        <span><svg class="key-shape big t1" viewBox="-9 -9 18 18" aria-hidden="true">${shape(1, 0, 0, 1.45)}</svg>испытание (каждый 5-й)</span>
      </figcaption>
    </figure>`,
    table,
  };
}

// ─── chart 4: casual bot vs planning effort ────────────────────────────────
function chartCalib() {
  let rows = "";
  for (const c of calib) {
    rows += `<div class="pair-row" tabindex="0" data-tip="${esc(`${c.name}: казуальный бот не проходит ${pct(c.casual)}, усилие поиска ${pct(c.effort)}`)}">
      <span class="bar-label">${esc(c.name)}</span>
      <span class="pair">
        <span class="bar-track"><span class="bar base" style="width:${Math.max(0.6, c.casual * 100)}%"></span><span class="bar-val">${pct(c.casual)}</span></span>
        <span class="bar-track"><span class="bar mech" style="width:${Math.max(0.6, c.effort * 100)}%"></span><span class="bar-val">${pct(c.effort)}</span></span>
      </span>
    </div>`;
  }
  return rows;
}

const knobChart = chartKnobs();
const trackChart = chartTracks();
const calibRows = chartCalib();
const l8 = cur.find((r) => r.level === 8)!;

const page = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Water Sort 2.0</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" />
<style>
:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --surface: #ffffff;
  --surface-2: #eef1f7;
  --ink: #111521;
  --ink-2: #454d60;
  --muted: #737b8f;
  --line: #e1e5ee;
  --grid: #e7eaf1;
  --accent: #2a78d6;
  --accent-ink: #1c5cab;
  --s1: #2a78d6;
  --s2: #eb6834;
  --base: #a3aab8;
  --t0: #4f8ad6;
  --t1: #2f6fc4;
  --t2: #1c5cab;
  --t3: #0d366b;
  --display: "Unbounded", "Golos Text", system-ui, sans-serif;
  --body: "Golos Text", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0f1218;
    --surface: #171b24;
    --surface-2: #1e2330;
    --ink: #f1f3f7;
    --ink-2: #bcc2cf;
    --muted: #8a91a2;
    --line: #2a303d;
    --grid: #262c38;
    --accent: #5b9ef0;
    --accent-ink: #86b6ef;
    --s1: #3987e5;
    --s2: #d95926;
    --base: #5d6474;
    --t0: #3072c4;
    --t1: #5b9ef0;
    --t2: #9cc3f5;
    --t3: #d6e6fb;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0f1218;
  --surface: #171b24;
  --surface-2: #1e2330;
  --ink: #f1f3f7;
  --ink-2: #bcc2cf;
  --muted: #8a91a2;
  --line: #2a303d;
  --grid: #262c38;
  --accent: #5b9ef0;
  --accent-ink: #86b6ef;
  --s1: #3987e5;
  --s2: #d95926;
  --base: #5d6474;
  --t0: #3072c4;
  --t1: #5b9ef0;
  --t2: #9cc3f5;
  --t3: #d6e6fb;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 var(--body); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 860px; margin: 0 auto; padding-inline: 20px; padding-block: 40px 72px; }
h1, h2, h3 { font-family: var(--display); font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(34px, 7vw, 54px); line-height: 1.02; }
h2 { font-size: clamp(21px, 3.6vw, 27px); line-height: 1.2; margin-top: 64px; }
h3 { font-size: 17px; line-height: 1.3; margin-top: 28px; }
h4 { margin: 0 0 8px; font: 600 13px/1.3 var(--body); color: var(--ink-2); }
p { margin: 12px 0 0; max-width: 68ch; color: var(--ink-2); }
p strong, li strong { color: var(--ink); font-weight: 600; }
a { color: var(--accent-ink); text-underline-offset: 3px; }
.eyebrow { font: 600 12px/1.2 var(--body); letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 14px; }
.lede { font-size: 18px; color: var(--ink-2); max-width: 60ch; margin-top: 18px; }
.cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 18px; border-radius: 12px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); color: var(--ink); background: var(--surface); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn:focus-visible, .bar-row:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-top: 32px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; }
.tile b { display: block; font: 600 30px/1.1 var(--body); color: var(--ink); }
.tile span { display: block; margin-top: 6px; font-size: 14px; line-height: 1.4; color: var(--ink-2); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 18px 14px; margin-top: 22px; }
.chart { margin: 0; position: relative; }
.chart-scroll { overflow-x: auto; }
.chart-scroll > svg { display: block; width: 100%; min-width: 600px; height: auto; }
.grid { stroke: var(--grid); stroke-width: 1; }
.tick { fill: var(--muted); font: 500 12px var(--body); font-variant-numeric: tabular-nums; }
.axis-title { fill: var(--muted); font: 500 12px var(--body); }
.note { fill: var(--ink-2); font: 600 13px var(--body); }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line.s1 { stroke: var(--s1); opacity: 0.55; }
.line.target { stroke: var(--muted); }
.whisk { stroke-width: 1.5; stroke-linecap: round; opacity: 0.32; }
.whisk.s1 { stroke: var(--s1); }
.whisk.s2 { stroke: var(--s2); }
.dot { stroke: var(--surface); stroke-width: 2; }
.dot.s1 { fill: var(--s1); }
.dot.s2 { fill: var(--s2); }
.mk path, .mk rect, .mk circle { stroke: var(--surface); stroke-width: 2; }
.mk.boss path, .mk.boss rect, .mk.boss circle { stroke: var(--ink); stroke-width: 1.5; }
.line.tl { stroke-width: 1.5; stroke-dasharray: 4 4; opacity: 0.7; }
.line.tl.t0 { stroke: var(--t0); }
.line.tl.t1 { stroke: var(--t1); }
.line.tl.t2 { stroke: var(--t2); }
.line.tl.t3 { stroke: var(--t3); }
.dash-key { width: 18px; height: 0; border-top: 2px dashed var(--muted); }
.legend .key-shape.big { width: 15px; height: 15px; }
.legend .key-shape.big * { stroke: var(--ink); stroke-width: 1.5; }
.t0 path, .t0 rect, .t0 circle, .key-shape.t0 * { fill: var(--t0); }
.t1 path, .t1 rect, .t1 circle, .key-shape.t1 * { fill: var(--t1); }
.t2 path, .t2 rect, .t2 circle, .key-shape.t2 * { fill: var(--t2); }
.t3 path, .t3 rect, .t3 circle, .key-shape.t3 * { fill: var(--t3); }
.intro { fill: var(--ink-2); font: 500 11.5px var(--body); }
.band { fill: var(--surface-2); opacity: 0.55; }
.band.alt { opacity: 0.25; }
.band-label { fill: var(--muted); font: 500 11.5px var(--body); }
.pair-row { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; gap: 12px; align-items: center; padding: 5px 0; border-radius: 8px; }
.pair { display: grid; gap: 3px; }
.pair .bar { height: 10px; }
.legend .sw { width: 12px; height: 10px; border-radius: 0 3px 3px 0; display: inline-block; }
.legend .sw.base { background: var(--base); }
.legend .sw.mech { background: var(--s1); }
.intro-rule { stroke: var(--grid); stroke-width: 1; }
.cross { stroke: var(--muted); stroke-width: 1; opacity: 0.6; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 13px; color: var(--ink-2); }
.legend span { display: inline-flex; align-items: center; gap: 7px; }
.key { display: inline-block; }
.dot-key { width: 8px; height: 8px; border-radius: 50%; background: var(--s1); }
.dot-key.s2 { background: var(--s2); }
.dot-key.big { width: 10px; height: 10px; }
.whisk-key { width: 2px; height: 14px; background: var(--s1); opacity: 0.4; border-radius: 1px; }
.line-key { width: 18px; height: 2px; background: var(--muted); border-radius: 1px; }
.legend .key-shape { width: 12px; height: 12px; flex: none; }
.tip { position: absolute; z-index: 2; pointer-events: none; min-width: 180px; max-width: 320px; padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(10, 16, 30, 0.18); font-size: 13px; line-height: 1.35; color: var(--ink-2); }
.tip b { display: block; font: 600 18px/1.2 var(--body); color: var(--ink); }
.tip small { display: block; color: var(--muted); margin-top: 3px; white-space: pre-line; }
.findings { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; counter-reset: f; }
.findings li { position: relative; padding-left: 38px; color: var(--ink-2); max-width: 70ch; }
.findings li::before { counter-increment: f; content: counter(f); position: absolute; left: 0; top: 1px; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: var(--surface-2); color: var(--ink); font: 600 13px/1 var(--body); }
.bar-group { margin-top: 18px; }
.bar-group:first-child { margin-top: 4px; }
.bar-row { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; gap: 12px; align-items: center; padding: 4px 0; border-radius: 8px; }
.bar-label { font-size: 14px; color: var(--ink-2); }
.bar-track { position: relative; display: flex; align-items: center; gap: 8px; }
.bar { display: block; height: 16px; border-radius: 0 4px 4px 0; }
.bar.base { background: var(--base); }
.bar.mech { background: var(--s1); }
.bar-row:hover .bar { filter: brightness(1.12); }
.bar-val { font: 600 13px/1 var(--body); color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
details { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
summary { cursor: pointer; font-size: 13.5px; color: var(--muted); font-weight: 500; }
.table-wrap { overflow-x: auto; margin-top: 10px; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); color: var(--ink-2); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 12.5px; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mech-table td:first-child { color: var(--ink); font-weight: 600; white-space: nowrap; }
.pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pill.on { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent-ink); }
.pill.idea { background: var(--surface-2); color: var(--muted); }
.steps { margin: 16px 0 0; padding-left: 22px; display: grid; gap: 10px; color: var(--ink-2); max-width: 70ch; }
.checklist { margin: 16px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.checklist li { padding: 12px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); color: var(--ink-2); }
.checklist li strong { display: block; color: var(--ink); }
code { font: 500 0.88em var(--mono); background: var(--surface-2); padding: 1px 6px; border-radius: 6px; color: var(--ink); }
pre { font: 500 13px/1.6 var(--mono); background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; overflow-x: auto; color: var(--ink-2); margin: 14px 0 0; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 18px; }
.two .tile b { font-size: 17px; }
footer { margin-top: 64px; font-size: 13px; color: var(--muted); }
@media (max-width: 520px) {
  .bar-row, .pair-row { grid-template-columns: 1fr; gap: 4px; }
  .wrap { padding-block: 28px 56px; }
}
</style>

<main class="wrap">
  <p class="eyebrow">Разбор и план · Water Sort</p>
  <h1>Water Sort 2.0</h1>
  <p class="lede">Что сейчас не так со сложностью, как её выровнять, какие механики добавить и как сделать воду объёмной. Каждое утверждение про сложность проверено симуляцией и поиском, а не на глаз.</p>
  <div class="cta">
    <a class="btn primary" href="${LAB_URL}" target="_blank" rel="noopener">Открыть прототип →</a>
    <a class="btn" href="#plan">План переноса в игру</a>
  </div>
  <div class="tiles">
    <div class="tile"><b>${pct(avg(chD))} против ${pct(avg(normD))}</b><span>средняя сложность каждого 5-го уровня против остальных (10–100): обрыв каждые пять уровней</span></div>
    <div class="tile"><b>${Math.round(avg(spread) * 100)} п.&nbsp;п.</b><span>средний разброс сложности одного и того же уровня между генерациями: рестарт — это лотерея</span></div>
    <div class="tile"><b>×${(calib.find((c) => c.name.startsWith("7c×2 2e"))!.casual / Math.max(0.01, calib.find((c) => c.name.startsWith("7c×2 2e"))!.effort)).toFixed(0)}</b><span>во столько раз казуальный бот завышает сложность поля 7 цветов × 2 по сравнению с игроком, который может отменять ходы</span></div>
  </div>

  <h2>Сложность сейчас: пила и лотерея</h2>
  <p>Сложность здесь — доля партий, которые «казуальный» бот не довёл до конца. Это та же модель игрока, что в <code>scripts/benchmark-difficulty.ts</code>: половина ходов — лучшие по эвристике, половина — случайные. Для каждого уровня 1–100 я генерировал 10 раскладок ровно так, как это делает игра, и прогонял каждую 120 раз.</p>
  <div class="card">${chartCurrent()}
    <details><summary>Таблица: все 100 уровней</summary><div class="table-wrap"><table>
      <thead><tr><th>Уровень</th><th>Поле</th><th>Сложность</th><th>Разброс</th><th>Пар в игре</th><th>Оптимум (BFS)</th></tr></thead>
      <tbody>${cur
        .map(
          (r) =>
            `<tr><td class="num">${r.level}${r.challenge ? " ⚑" : ""}</td><td>${r.colors} цв. · ${r.filled} бут. + ${r.empty} пуст.</td><td class="num">${pct(1 - r.mean)}</td><td class="num">${pct(1 - r.p90)}–${pct(1 - r.p10)}</td><td class="num">${r.fixedPar}</td><td class="num">${r.optimalPars.length ? `${Math.min(...r.optimalPars)}–${Math.max(...r.optimalPars)}` : "—"}</td></tr>`,
        )
        .join("")}</tbody></table></div></details>
  </div>
  <ol class="findings">
    <li><strong>Старт слишком ровный, первый обрыв слишком крутой.</strong> Уровни 1–9 бот проходит почти всегда (сложность 0–3%), а 10-й — первый челлендж — сразу ${pct(1 - cur.find((r) => r.level === 10)!.mean)}.</li>
    <li><strong>Каждый 5-й уровень — стена, и она перестаёт расти.</strong> Челленджи в среднем ${pct(avg(chD))} против ${pct(avg(normD))} у соседей. После 35-го это всегда одна и та же конфигурация (4 цвета × 2, одна пустая колба): ${pct(Math.min(...cur.filter((r) => r.challenge && r.level >= 35).map((r) => 1 - r.mean)))}–${pct(Math.max(...cur.filter((r) => r.challenge && r.level >= 35).map((r) => 1 - r.mean)))}, а обычные уровни к 91-му догоняют их (${pct(byTier(91, 100))}).</li>
    <li><strong>Тиры идут не по порядку.</strong> Уровни 36–49 (5 цветов × 3) легче предыдущих 21–34 (6 × 2): ${pct(byTier(36, 49))} против ${pct(byTier(21, 34))}. Больше бутылок ≠ сложнее.</li>
    <li><strong>Один уровень — много разных уровней.</strong> Раскладка генерируется заново при каждом входе и рестарте, поэтому разброс сложности одного уровня в среднем ${Math.round(avg(spread) * 100)} п.&nbsp;п., а максимум — ${Math.round(Math.max(...spread) * 100)} п.&nbsp;п.</li>
    <li><strong>Пар не соответствует уровню.</strong> Он зашит один на тир: на 8-м уровне пар ${l8.fixedPar} при оптимуме ${l8.optimalPars[0] ?? 16}, у челленджей после 35-го пар 23 при оптимуме от 13 до 24 — иногда уложиться в пар невозможно.</li>
    <li><strong>Бенчмарк смотрел не туда.</strong> В <code>benchmark-difficulty.ts</code> после 43-го тестируются уровни 45, 60, 65, 80, 85, 120 — все кратны пяти, то есть только челленджи; обычные тиры 51+ не измерялись. Скрытые слои «?» в модели не учитываются, хотя их доля растёт до 80%.</li>
  </ol>

  <h2>Механики — это промежуточные ступени сложности</h2>
  <p>Сейчас у сложности две ручки: число цветов и число пустых колб. Вторая работает как выключатель: убрать одну пустую колбу — значит прыгнуть с 2% до 93%. Новые механики дают ступени между этими крайностями — и одновременно разнообразие. Серые полосы — обычные конфигурации, синие — с механикой. Здесь сложность по казуальному боту на случайных раскладках, поэтому абсолютные числа завышены (см. следующий раздел), но порядок ступеней сохраняется.</p>
  <div class="card">
    <div class="bars">${knobChart.rows}</div>
    <details><summary>Таблица</summary><div class="table-wrap"><table><thead><tr><th>Поле</th><th>Конфигурация</th><th>Сложность</th></tr></thead><tbody>${knobChart.table}</tbody></table></div></details>
  </div>
  <p>Бак и две мини-колбы сильно облегчают, одна мини-колба и замок-награда дают «среднюю» ступень, заказы с одним слотом — очень сложно. Кран почти не меняет сложность для бота, но меняет её для человека: бутылка работает как очередь, а не стопка, и это надо держать в голове.</p>

  <h2>Почему «сложные» уровни ощущались лёгкими</h2>
  <p>Казуальный бот половину ходов делает случайно и не умеет отменять. Человек думает и жмёт «Отмена», поэтому поле, на котором бот проигрывает 60% партий, человек решает с первой попытки. Я перешёл на другую метрику — <strong>усилие поиска</strong>: поиск в глубину сначала пробует самые естественные ходы (те, что сильнее уменьшают беспорядок) и откатывается из тупиков, как игрок с отменой. Сложность — это сколько позиций пришлось перебрать на один ход решения, в логарифмической шкале: без откатов = 0%, в 8 раз больше = 50%.</p>
  <div class="card">
    <div class="bars">${calibRows}</div>
    <div class="legend"><span><i class="sw base"></i>казуальный бот: доля проигранных партий</span><span><i class="sw mech"></i>усилие поиска</span></div>
  </div>
  <p>Отсюда главный вывод: <strong>случайная раскладка почти всегда лёгкая для думающего игрока</strong>, даже на 8 цветах. Настоящая сложность появляется, когда запасного места мало (одна пустая колба) и естественные ходы ведут в ловушку. Такие раскладки случайно почти не выпадают, поэтому их надо искать: генератор берёт раскладку и переставляет по одной порции между бутылками, оставляя изменения, которые увеличивают число нужных откатов, пока уровень остаётся решаемым.</p>

  <h2>Четыре трассы сложности вместо одной кривой</h2>
  <p>Сложность выбирается в главном меню: «Лёгкий», «Средний», «Сложный», «Очень сложный». У каждой — своя трасса из 25 уровней и свой прогресс, так что опытный игрок сразу получает интересные уровни, а не проходит двадцать разминочных. По умолчанию выбран «Средний».</p>
  <ul class="checklist">
    <li><strong>Плавный рост внутри трассы.</strong>Сложность идёт от начала своего диапазона к концу: «Лёгкий» 5→17%, «Средний» 14→28%, «Сложный» 26→42%, «Очень сложный» 38→58%. Соседние трассы немного перекрываются, как в судоку.</li>
    <li><strong>Каждый 5-й уровень — испытание.</strong>Комбинация механик и на ступень сложнее; следующий за ним — передышка. Это прежний ритм «каждый пятый сложнее», но внутри трассы.</li>
    <li><strong>Механика с первого уровня.</strong> «Лёгкий» начинается с заказов, «Средний» — с бака, «Сложный» — с крана, «Очень сложный» — со скрытых слоёв. Все шесть механик появляются за первые 7 уровней, в каждой трассе в своём порядке; карточка «Новая механика» показывается один раз, где бы игрок её ни встретил.</li>
    <li><strong>Дальше механики комбинируются.</strong> Скрытые слои работают как модификатор поверх чего угодно — классики, крана, бака, замков, заказов: чем сложнее трасса, тем больше уровней прячут цвета. Чистая классика осталась передышкой.</li>
  </ul>
  <div class="card">${trackChart.svg}
    <details><summary>Таблица: все 100 уровней</summary><div class="table-wrap"><table>
      <thead><tr><th>Трасса</th><th>Уровень</th><th>Механики</th><th>Цель</th><th>Усилие</th><th>Сосудов</th><th>Пар</th></tr></thead>
      <tbody>${trackChart.table}</tbody></table></div><p style="font-size:13px">★ — испытание. * — пар доказан BFS как оптимальный.</p></details>
  </div>
  <p>Среднее отклонение от цели — ${(avg(dev) * 100).toFixed(1)} п.&nbsp;п., в пределах ±5 п.&nbsp;п. — ${dev.filter((d) => d <= 0.05).length} уровней из ${dev.length}. Труднее всего усложняются заказы и замки сами по себе: механика подсказывает порядок действий. Поэтому на трудных трассах они почти всегда идут в паре со скрытыми слоями.</p>
  <p>Скрытые слои теперь честно учитываются в метрике: поиск не «подглядывает» под «?» и выбирает ходы, видя только то, что видит игрок.</p>
  <h3>Как собираются уровни</h3>
  <ol class="steps">
    <li>Для уровня берутся несколько вариантов рецепта рядом с ожидаемой сложностью: число цветов, запасных колб и интенсивность механик.</li>
    <li>Кандидаты оцениваются усилием поиска; если все слишком лёгкие, лучшие «закаляются» перестановками порций — с отжигом, чтобы не застревать на плато.</li>
    <li>Три ближайших к цели кандидата перемеряются точно (7 прогонов), выбирается лучший. Решаемость проверяется поиском.</li>
    <li>Пар — оптимум BFS или лучший путь beam-поиска. Звёзды: 3 — в пар, 2 — до 1,3 пара.</li>
    <li>Уровни фиксированы: рестарт даёт ту же раскладку.</li>
  </ol>

  <h2>Механики</h2>
  <p>Все пять новых механик работают в прототипе, их можно комбинировать; солвер и бот их понимают. Бак — ваша идея с большой банкой, я сделал два варианта: с цветом на этикетке и «хамелеон», который принимает первый налитый цвет.</p>
  <div class="card"><div class="table-wrap"><table class="mech-table">
    <thead><tr><th>Механика</th><th>Правило</th><th>Что даёт игре</th><th>Статус</th></tr></thead>
    <tbody>
      <tr><td>Скрытые слои</td><td>Цвет под «?» виден, только когда слой сверху</td><td>Память и риск; уже есть в игре</td><td><span class="pill on">в игре</span></td></tr>
      <tr><td>Мини-колба</td><td>2 порции любого цвета, к концу должна быть пустой</td><td>Мягкая ступень между «2 пустые» и «1 пустая»</td><td><span class="pill on">прототип</span></td></tr>
      <tr><td>Бак</td><td>8 порций одного цвета, вылить нельзя; вариант-хамелеон</td><td>Стратегический выбор цвета; облегчает большие поля</td><td><span class="pill on">прототип</span></td></tr>
      <tr><td>Замки</td><td>Бутылка на цепи открывается, когда собран цвет замка</td><td>Порядок действий, «награда» в виде пустой колбы</td><td><span class="pill on">прототип</span></td></tr>
      <tr><td>Кран</td><td>Выливается нижний слой, наливается — верхний</td><td>Очередь вместо стопки: свежая логика без новых цветов</td><td><span class="pill on">прототип</span></td></tr>
      <tr><td>Заказы</td><td>Стаканы-заказы сверху, очередь видна; сортировать не нужно</td><td>Отдельный режим в духе «jam»-игр, легко масштабировать</td><td><span class="pill on">прототип</span></td></tr>
      <tr><td>Масло</td><td>Масляный слой всегда всплывает наверх</td><td>Физика плотности, красиво в 3D; сложно объяснить</td><td><span class="pill idea">идея</span></td></tr>
      <tr><td>Смеситель</td><td>Синий + жёлтый в смесителе = зелёный</td><td>«Химия» для отдельного мира; другой тип головоломки</td><td><span class="pill idea">идея</span></td></tr>
      <tr><td>Второй ряд</td><td>Собранная бутылка уезжает, из-за полки выезжает новая</td><td>Длинные уровни без перегруза экрана</td><td><span class="pill idea">идея</span></td></tr>
      <tr><td>Лёд</td><td>Бутылка оттаивает через N собранных бутылок</td><td>Как замки, но без цвета-ключа: проще читается</td><td><span class="pill idea">идея</span></td></tr>
      <tr><td>Сообщающиеся сосуды</td><td>Две бутылки соединены трубкой на определённой высоте</td><td>Самая «физическая» механика; нужен свой солвер</td><td><span class="pill idea">идея</span></td></tr>
    </tbody></table></div></div>

  <h2>Графика: вода как объём</h2>
  <p>В прототипе поле рисуется на Three.js, интерфейс остаётся обычным HTML. Главное отличие от текущей SVG-версии — жидкость считается как объём внутри стекла.</p>
  <div class="two">
    <div class="tile"><b>Горизонт при наклоне</b><span>Поверхность всегда горизонтальна, слои лежат по высоте. Объём под наклонной плоскостью считается точно, срез за срезом.</span></div>
    <div class="tile"><b>Наклон по объёму</b><span>Полная бутылка начинает литься на ~70°, последняя порция — на ~115°. Кромка горлышка держится над целью.</span></div>
    <div class="tile"><b>Живая жидкость</b><span>Плеск на пружинах от ускорений, струя, брызги, пузырьки, рябь поверхности, мениск.</span></div>
    <div class="tile"><b>Предметы</b><span>Пробка на собранной бутылке, 3D-цепи и замок цвета-ключа, кран, стаканы-заказы, этикетка бака.</span></div>
  </div>
  <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Вариант</th><th>Плюсы</th><th>Минусы</th></tr></thead>
    <tbody>
      <tr><td><strong>SVG + framer-motion</strong> (сейчас)</td><td>Просто, чётко, лёгкий бандл</td><td>Жидкость поворачивается вместе с бутылкой; дорогие анимации на 16+ бутылках</td></tr>
      <tr><td><strong>Canvas 2D</strong></td><td>Быстро, та же физика объёма возможна в 2D</td><td>Потолок по «вау»: стекло и объём приходится рисовать вручную</td></tr>
      <tr><td><strong>Three.js 3D</strong> (прототип)</td><td>Настоящее стекло, свет, объём; скины бутылок почти бесплатно</td><td>+~150 КБ gzip за three.js; нужен экономный режим для слабых телефонов</td></tr>
    </tbody></table></div></div>
  <p><strong>Рекомендация — Three.js для поля, HTML для интерфейса.</strong> Кадры рисуются только когда что-то движется (батарея), есть экономный режим (ниже DPR). Сглаживание не зависит от MSAA: край поверхности жидкости рисуется вторым проходом с полупрозрачной полоской в 1 пиксель, границы слоёв смешиваются в шейдере. Что проверить на реальных устройствах: старый Android и iPhone в режиме энергосбережения.</p>

  <h2>Звук</h2>
  <p>Звуки собраны из «пузырей»: каждый пузырь звучит как короткий затухающий тон, который чуть поднимается, пока пузырь всплывает. Наливание — низкие мягкие «бульки» воздуха, входящего в бутылку, из которой льём («Глубокий»); звук ставится на момент, когда жидкость переходит через край, с поправкой на задержку устройства — на Bluetooth-наушниках она доходит до 0,2–0,3 с. Выбор бутылки — одна «капля», чем полнее бутылка, тем выше. Собранная бутылка — хлопок пробки и стеклянный колокольчик. Финальная фанфара и звон звёзд перенесены из игры без изменений. Выбор вариантов звука убран: осталась одна настройка — звук вкл/выкл.</p>

  <h2>Что проверить в прототипе</h2>
  <ul class="checklist">
    <li><strong>Ощущение наливания.</strong> Скорость, наклон, плеск. Не слишком ли долго на длинных уровнях?</li>
    <li><strong>Трассы.</strong> Интересно ли начинать сразу со «Среднего» или «Сложного»? Чувствуется ли рост внутри трассы и испытания каждые 5 уровней?</li>
    <li><strong>Механики.</strong> Какие из бака, заказов, замков, крана, мини-колбы хочется оставить в трассах, а какие вынести в отдельный мир?</li>
    <li><strong>Телефон.</strong> Плавность в «высокой» и «экономной» графике, нагрев.</li>
  </ul>

  <h2 id="plan">План переноса в игру</h2>
  <ol class="steps">
    <li><strong>Уровни.</strong> Перейти со случайной генерации при входе на фиксированный набор, собранный пайплайном (<code>lab/scripts/build-tracks.ts</code>): четыре трассы по 25 уровней, ровный рост внутри трассы, честный пар. Новые уровни добавлять пачками в конец каждой трассы.</li>
    <li><strong>Движок.</strong> Заменить <code>src/game/engine.ts</code> обобщённым движком из <code>lab/src/engine</code>: сосуды разных типов, заказы, замки, кран; солвер и бот понимают все механики.</li>
    <li><strong>Рендер.</strong> Обернуть <code>Stage</code> из <code>lab/src/render</code> в React-компонент на место <code>Tube</code> и <code>PourAnimationOverlay</code>; шапку и оверлеи оставить в React.</li>
    <li><strong>Звук.</strong> Заменить синтез в <code>src/audio/sounds.ts</code>, оставив <code>playLevelComplete</code> и <code>playStar</code>.</li>
    <li><strong>Контроль.</strong> Прогонять <code>lab/scripts/analyze-current.ts</code> и сборку трасс в CI, чтобы кривая не расползалась при правках генератора.</li>
  </ol>
  <h3>Где лежит код</h3>
<pre>lab/                       отдельный проект, основное приложение не тронуто
  src/engine/              правила, солвер (BFS + beam), бот, генератор
  src/render/              Three.js: сосуды, шейдеры жидкости и стекла, анимации
  src/ui/                  экраны, шапка, звук
  scripts/build-tracks.ts     4 трассы × 25 уровней под целевые кривые
  scripts/build-free.ts       пул свободного режима
  scripts/analyze-current.ts  замер текущей игры (этот отчёт)
  scripts/knobs.ts            механики как ручки сложности

cd lab && npm install && npm run dev      # локально, порт 5180
npm run build && node scripts/artifact.mjs  # один HTML-файл</pre>
  <footer>Данные: 100 уровней × 10 генераций × 120 партий бота для текущей игры; конфигурации механик — 40 раскладок × 100 партий; калибровка метрики — 12 решаемых раскладок на конфигурацию; уровни трасс — 7 прогонов поиска на уровень.</footer>
</main>

<script>
(() => {
  for (const fig of document.querySelectorAll("figure.chart[data-points]")) {
    const pts = JSON.parse(fig.dataset.points);
    const svg = fig.querySelector("svg");
    const tip = fig.querySelector(".tip");
    const cross = fig.querySelector(".cross");
    const vb = svg.viewBox.baseVal;
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * vb.width;
      let best = pts[0], bd = Infinity;
      for (const p of pts) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } }
      cross.setAttribute("x1", best.x); cross.setAttribute("x2", best.x);
      tip.replaceChildren();
      const t = document.createElement("span"); t.textContent = best.t;
      const b = document.createElement("b"); b.textContent = best.v;
      const s = document.createElement("small"); s.textContent = best.s;
      tip.append(t, b, s);
      tip.hidden = false;
      const fr = fig.getBoundingClientRect();
      const px = r.left - fr.left + (best.x / vb.width) * r.width;
      const w = tip.offsetWidth;
      tip.style.left = Math.max(0, px + 12 + w > fr.width ? px - w - 12 : px + 12) + "px";
      tip.style.top = "8px";
    };
    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); });
  }
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  tip.style.position = "fixed";
  document.body.append(tip);
  for (const row of document.querySelectorAll(".bar-row, .pair-row")) {
    const on = () => {
      tip.textContent = row.dataset.tip;
      tip.hidden = false;
      const r = row.getBoundingClientRect();
      tip.style.left = Math.min(r.left + 12, innerWidth - tip.offsetWidth - 12) + "px";
      tip.style.top = r.bottom + 6 + "px";
    };
    row.addEventListener("pointerenter", on);
    row.addEventListener("focus", on);
    row.addEventListener("pointerleave", () => (tip.hidden = true));
    row.addEventListener("blur", () => (tip.hidden = true));
  }
})();
</script>
`;

mkdirSync(new URL("../report", import.meta.url), { recursive: true });
writeFileSync(new URL("../report/report.html", import.meta.url), page);
console.log("wrote report/report.html", (page.length / 1024).toFixed(0), "KB");
