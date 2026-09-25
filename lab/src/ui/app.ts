import track0 from "../levels/track0.json";
import track1 from "../levels/track1.json";
import track2 from "../levels/track2.json";
import track3 from "../levels/track3.json";
import freeData from "../levels/free.json";
import logoUrl from "../assets/logo-wide.webp";
import type { LevelDef, Move, State } from "../engine/types";
import { applyPour, canPour, initialState, isWin, sourceBlock, sourceRun, validMoves } from "../engine/rules";
import { solveBeam, solveBfs } from "../engine/solver";
import { Stage, type Quality } from "../render/stage";
import { css } from "../palette";
import { MECHANICS, TIERS } from "./mechanics";
import { ICONS } from "./icons";
import { buzz, sfx } from "./audio";

/** One track of levels per difficulty; the player picks the difficulty in the main menu. */
const TRACKS = [track0, track1, track2, track3] as unknown as LevelDef[][];
const FREE = freeData as unknown as Record<string, LevelDef[][]>;
const FREE_ORDER = ["classic", "hidden", "flask", "jar", "locks", "valve", "orders", "mix"];

// ─── storage ────────────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// ─── small helpers ──────────────────────────────────────────────────────────

function h(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
const dot = (c: number) => `<span class="dot" style="--c:${css(c)}"></span>`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pips = (tier: number) =>
  `<span class="pips">${[0, 1, 2, 3].map((i) => `<i class="${i <= tier ? "on" : ""}"></i>`).join("")}</span>`;
const ribbon = (tier: number, cls = "") => {
  const t = TIERS[tier] ?? TIERS[0]!;
  return `<span class="ribbon ${cls}" style="--tc:${t.color};--ti:${t.ink}">${pips(tier)}<b>${t.name}</b></span>`;
};
function starsFor(moves: number, par: number) {
  return moves <= par ? 3 : moves <= Math.ceil(par * 1.3) ? 2 : 1;
}
const moveWord = (n: number) => (n === 1 ? "move" : "moves");
const mechList = (l: LevelDef) => (l.mechanics && l.mechanics.length ? l.mechanics : ["classic"]);
/** planning-effort difficulty (0..1); older levels fall back to the casual-bot measure */
const effortOf = (l: LevelDef) => l.stats.effort ?? 1 - l.stats.casual;
/** chips for a level's mechanics; `fresh` ones are marked as new */
const mechChips = (l: LevelDef, fresh: string[] = []) =>
  (l.boss ? `<span class="chip boss"><i>${ICONS.crown}</i>Challenge</span>` : "") +
  mechList(l)
    .map((m) => `<span class="chip" style="--h:${MECHANICS[m]!.hue}"><i>${ICONS[m]}</i>${MECHANICS[m]!.name}${fresh.includes(m) ? "<b class=\"new\">new</b>" : ""}</span>`)
    .join("");

interface Progress {
  /** best stars by level id (track and free levels alike) */
  stars: Record<string, number>;
  /** rules cards already shown: "classic" is how to play, the rest are mechanics */
  seen: Record<string, boolean>;
}

type Ctx = { kind: "track"; tier: number; index: number } | { kind: "free"; bucket: string; tier: number; index: number };

// ─── app shell ──────────────────────────────────────────────────────────────

export class App {
  progress: Progress = load<Progress>("wsl3-progress", { stars: {}, seen: {} });
  /** difficulty picked in the main menu */
  private tier = load<number>("wsl3-tier", 1);
  private quality: Quality = load<Quality>("wsl-quality", "high");
  private freePick = load<{ bucket: string; tier: number }>("wsl2-freepick", { bucket: "jar", tier: 1 });
  private screen: HTMLElement | null = null;
  private stage: Stage | null = null;
  private session: Session | null = null;

  constructor(private root: HTMLElement) {
    root.append(h(`<div class="backdrop"></div>`));
    this.home();
    if (import.meta.env.DEV) (window as unknown as { __lab: unknown }).__lab = this;
  }

  get current() {
    return this.session;
  }

  setHue(hue: number) {
    document.documentElement.style.setProperty("--hue", String(hue));
  }

  private show(el: HTMLElement) {
    this.session?.dispose();
    this.session = null;
    this.screen?.remove();
    this.screen = el;
    this.root.append(el);
  }

  saveProgress() {
    save("wsl3-progress", this.progress);
  }

  private pickTier(tier: number) {
    this.tier = tier;
    save("wsl3-tier", tier);
  }

  /** first level of a track without stars (the last one when all are done) */
  nextIndex(tier: number) {
    const track = TRACKS[tier]!;
    const i = track.findIndex((l) => !this.progress.stars[l.id]);
    return i < 0 ? track.length - 1 : i;
  }

  private trackStats(tier: number) {
    const track = TRACKS[tier]!;
    return {
      done: track.filter((l) => this.progress.stars[l.id]).length,
      stars: track.reduce((a, l) => a + (this.progress.stars[l.id] ?? 0), 0),
      total: track.length,
    };
  }

  /** mechanics in a level whose rules card the player hasn't seen yet */
  private freshMechs(level: LevelDef) {
    return (level.mechanics ?? []).filter((m) => !this.progress.seen[m]);
  }

  // ── home: pick a difficulty ──
  home() {
    this.setHue(222);
    const tabs = TIERS.map(
      (t, i) =>
        `<button type="button" class="tab" role="radio" aria-checked="false" data-track="${i}" style="--tc:${t.color};--tink:${t.ink}">${pips(i)}<span>${t.short}</span></button>`,
    ).join("");
    const el = h(`<main class="screen home">
      <div class="home-inner">
        <div class="logo-wrap"><img class="logo" src="${logoUrl}" alt="Water Sort Puzzle" /></div>
        <section class="mode-card">
          <div class="dpick">
            <button type="button" class="dp-current" aria-expanded="false"></button>
            <div class="tier-tabs" role="radiogroup" aria-label="Difficulty" hidden>${tabs}</div>
          </div>
          <div class="mc-next" aria-live="polite"></div>
          <button type="button" class="gbtn big tier-play" data-go="play">${ICONS.play}<span>Play</span></button>
          <button type="button" class="gbtn glass" data-go="map">${ICONS.map}<span>Level map</span></button>
        </section>
        <button type="button" class="gbtn blue wide" data-go="free"><span class="wide-icon">${ICONS.mix}</span><b>Free play</b></button>
        <div class="settings">
          <div class="seg" role="group" aria-label="Graphics">
            <button type="button" data-q="high" aria-pressed="${this.quality === "high"}">Graphics: high</button>
            <button type="button" data-q="low" aria-pressed="${this.quality === "low"}">low</button>
          </div>
          <button type="button" class="gbtn glass round sm" data-go="sound" aria-label="Sound on/off">${sfx.muted ? ICONS.mute : ICONS.sound}</button>
        </div>
      </div>
    </main>`);
    const card = el.querySelector<HTMLElement>(".mode-card")!;
    const current = el.querySelector<HTMLButtonElement>(".dp-current")!;
    const options = el.querySelector<HTMLElement>(".tier-tabs")!;
    // one line: the picked difficulty; tapping it swaps in all four
    const expand = (on: boolean) => {
      current.hidden = on;
      options.hidden = !on;
      current.setAttribute("aria-expanded", String(on));
      if (on) options.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    };
    const render = () => {
      const t = TIERS[this.tier]!;
      const s = this.trackStats(this.tier);
      card.style.setProperty("--tc", t.color);
      current.style.setProperty("--tc", t.color);
      current.style.setProperty("--tink", t.ink);
      current.setAttribute("aria-label", `Difficulty: ${t.name}. Change`);
      current.innerHTML = `<span class="dp-pill">${pips(this.tier)}<b>${t.name}</b></span><span class="dp-count">${s.done}/${s.total}</span><i class="dp-chev">${ICONS.chevron}</i>`;
      options.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => {
        const on = Number(b.dataset.track) === this.tier;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      });
      const idx = this.nextIndex(this.tier);
      const lvl = TRACKS[this.tier]![idx]!;
      el.querySelector(".mc-next")!.innerHTML = `
        <div class="mc-level">${s.done === s.total ? "All done!" : `Level ${idx + 1}`}</div>
        <div class="mc-meta">${mechChips(lvl, this.freshMechs(lvl))}</div>`;
    };
    render();
    current.addEventListener("click", () => expand(true));
    options.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        this.pickTier(Number(b.dataset.track));
        render();
        expand(false);
        current.focus();
      }),
    );
    el.querySelector('[data-go="play"]')!.addEventListener("click", () => {
      const s = this.trackStats(this.tier);
      if (s.done === s.total) this.map(this.tier);
      else this.play({ kind: "track", tier: this.tier, index: this.nextIndex(this.tier) });
    });
    el.querySelector('[data-go="map"]')!.addEventListener("click", () => this.map(this.tier));
    el.querySelector('[data-go="free"]')!.addEventListener("click", () => this.free());
    const snd = el.querySelector<HTMLButtonElement>('[data-go="sound"]')!;
    snd.addEventListener("click", () => {
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      snd.innerHTML = sfx.muted ? ICONS.mute : ICONS.sound;
      sfx.ui();
    });
    el.querySelectorAll<HTMLButtonElement>(".seg button").forEach((b) =>
      b.addEventListener("click", () => {
        this.quality = b.dataset.q as Quality;
        save("wsl-quality", this.quality);
        this.stage?.dispose();
        this.stage = null;
        el.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }),
    );
    this.wireButtons(el);
    this.show(el);
  }

  /** click sound + audio unlock on every button of a screen */
  private wireButtons(el: HTMLElement) {
    el.addEventListener(
      "pointerdown",
      (e) => {
        const b = (e.target as HTMLElement).closest("button");
        if (b) {
          sfx.unlock();
          if (!b.hasAttribute("data-silent")) sfx.ui();
        }
      },
      true,
    );
  }

  // ── track map ──
  map(tier = this.tier, focus?: number) {
    this.pickTier(tier);
    this.setHue(222);
    const t = TIERS[tier]!;
    const track = TRACKS[tier]!;
    const next = this.nextIndex(tier);
    const { stars } = this.trackStats(tier);
    const tabs = TIERS.map(
      (x, i) =>
        `<button type="button" class="tab ${i === tier ? "on" : ""}" role="radio" aria-checked="${i === tier}" data-track="${i}" style="--tc:${x.color};--tink:${x.ink}">${pips(i)}<span>${x.short}</span></button>`,
    ).join("");
    const el = h(`<main class="screen map">
      <header class="bar">
        <button type="button" class="gbtn glass round" data-go="home" aria-label="Back">${ICONS.back}</button>
        <h2 style="color:${t.color}">${t.name}</h2>
        <span class="bar-stars">${ICONS.star}<b>${stars}</b></span>
      </header>
      <div class="map-scroll">
        <div class="tier-tabs" role="radiogroup" aria-label="Difficulty">${tabs}</div>
        <section class="curve-card">
          <div class="curve-head"><b>Difficulty curve</b><span>how much searching it takes to find a solution</span></div>
          ${this.curveSvg(track, t.color)}
          <div class="legend"><span><i style="background:${t.color}"></i>level</span><span><i class="boss" style="background:${t.color}"></i>challenge</span><span><i class="line"></i>target</span></div>
        </section>
        <div class="path"></div>
      </div>
    </main>`);
    const path = el.querySelector<HTMLElement>(".path")!;
    const stepY = 104;
    const W = Math.min(420, window.innerWidth - 32);
    const pts = track.map((_, i) => ({ x: W / 2 + Math.sin(i * 0.95) * (W / 2 - 56), y: 70 + i * stepY }));
    const d = pts
      .map((p, i) => {
        if (i === 0) return `M${p.x},${p.y}`;
        const a = pts[i - 1]!;
        return `C${a.x},${a.y + stepY * 0.55} ${p.x},${p.y - stepY * 0.55} ${p.x},${p.y}`;
      })
      .join(" ");
    const hPath = pts[pts.length - 1]!.y + 90;
    path.style.height = `${hPath}px`;
    path.style.width = `${W}px`;
    path.innerHTML = `<svg class="trail" width="${W}" height="${hPath}" aria-hidden="true"><path class="trail-shadow" d="${d}"/><path d="${d}"/></svg>`;
    // where the player meets each mechanic they don't know yet
    const firstMeet = new Map<number, string>();
    const met = new Set<string>();
    track.forEach((lvl, i) => {
      for (const m of this.freshMechs(lvl)) {
        if (met.has(m)) continue;
        met.add(m);
        if (!firstMeet.has(i)) firstMeet.set(i, m);
      }
    });
    track.forEach((lvl, i) => {
      const st = this.progress.stars[lvl.id] ?? 0;
      const p = pts[i]!;
      const mech = mechList(lvl);
      const fresh = firstMeet.get(i);
      const badge = fresh
        ? `<span class="node-new">${ICONS[fresh]}</span>`
        : mech[0] !== "classic"
          ? `<span class="node-mech" style="--h:${MECHANICS[mech.length > 1 ? "mix" : mech[0]!]!.hue}">${ICONS[mech.length > 1 ? "mix" : mech[0]!]}</span>`
          : "";
      const cls = [st ? "done" : "", i === next ? "current" : "", i > next ? "ahead" : "", lvl.boss ? "boss" : ""].join(" ");
      const node = h(`<button type="button" class="node ${cls}" style="left:${p.x}px;top:${p.y}px;--tc:${t.color}" aria-label="Level ${i + 1}${lvl.boss ? ", challenge" : ""}: ${mech.map((m) => MECHANICS[m]!.name).join(", ")}">
        ${lvl.boss ? `<span class="node-crown">${ICONS.crown}</span>` : ""}
        <b>${i + 1}</b>
        ${st ? `<span class="node-stars">${[0, 1, 2].map((k) => `<i class="${k < st ? "on" : ""}">${ICONS.star}</i>`).join("")}</span>` : ""}
        ${badge}
      </button>`);
      node.addEventListener("click", () => this.play({ kind: "track", tier, index: i }));
      path.append(node);
      if (fresh) {
        const side = p.x > W / 2 ? "left" : "right";
        path.append(h(`<span class="node-label ${side}" style="left:${p.x}px;top:${p.y}px">New: ${MECHANICS[fresh]!.name}</span>`));
      }
    });
    el.querySelector('[data-go="home"]')!.addEventListener("click", () => this.home());
    el.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        const k = Number(b.dataset.track);
        if (k !== tier) this.map(k);
      }),
    );
    this.wireButtons(el);
    this.show(el);
    const target = pts[focus ?? next]!;
    requestAnimationFrame(() => {
      const sc = el.querySelector<HTMLElement>(".map-scroll")!;
      const y = target.y + path.offsetTop;
      // centre the level, unless it's already on screen with the map scrolled to the top
      if (y + 90 > sc.clientHeight) sc.scrollTop = y - sc.clientHeight / 2;
    });
  }

  /** Target vs measured difficulty along a track. */
  private curveSvg(track: LevelDef[], color: string) {
    const W = 340;
    const H = 132;
    const pad = { l: 30, r: 8, t: 10, b: 20 };
    const n = track.length;
    const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - Math.min(v, 0.8) / 0.8) * (H - pad.t - pad.b);
    const target = track.map((l, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(l.target ?? 0).toFixed(1)}`).join("");
    const grid = [0, 0.2, 0.4, 0.6, 0.8]
      .map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3.5}">${Math.round(v * 100)}</text>`)
      .join("");
    const dots = track
      .map(
        (l, i) =>
          `<circle class="${l.boss ? "boss" : ""}" cx="${x(i).toFixed(1)}" cy="${y(effortOf(l)).toFixed(1)}" r="${l.boss ? 5.2 : 3.6}" fill="${color}"><title>Level ${i + 1}${l.boss ? " (challenge)" : ""}: ${pct(effortOf(l))}</title></circle>`,
      )
      .join("");
    const ticks = [1, 5, 10, 15, 20, 25]
      .filter((i) => i <= n)
      .map((i) => `<text class="tx" x="${x(i - 1)}" y="${H - 5}">${i}</text>`)
      .join("");
    return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Difficulty curve of the track: target and measured value per level">
      <g class="grid">${grid}</g>${ticks}<path class="target" d="${target}"/>${dots}
    </svg>`;
  }

  // ── free mode ──
  free() {
    this.setHue(200);
    const pick = this.freePick;
    const el = h(`<main class="screen free">
      <header class="bar">
        <button type="button" class="gbtn glass round" data-go="home" aria-label="Back">${ICONS.back}</button>
        <h2>Free play</h2>
        <span></span>
      </header>
      <div class="free-scroll">
        <p class="free-lede">Pick a mechanic and a difficulty. Every level was measured by simulation.</p>
        <div class="mech-grid"></div>
        <div class="tier-pick" role="radiogroup" aria-label="Difficulty"></div>
        <button type="button" class="gbtn green big" data-go="play">${ICONS.play}<span>Play</span></button>
      </div>
    </main>`);
    const grid = el.querySelector(".mech-grid")!;
    for (const id of FREE_ORDER) {
      const m = MECHANICS[id]!;
      const b = h(`<button type="button" class="mech ${pick.bucket === id ? "on" : ""}" style="--h:${m.hue}" aria-pressed="${pick.bucket === id}">
        <span class="mech-icon">${ICONS[id]}</span><b>${m.name}</b><small>${m.blurb}</small>
      </button>`);
      b.addEventListener("click", () => {
        pick.bucket = id;
        grid.querySelectorAll(".mech").forEach((x) => {
          x.classList.toggle("on", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
      });
      grid.append(b);
    }
    const tp = el.querySelector(".tier-pick")!;
    TIERS.forEach((t, i) => {
      const b = h(`<button type="button" class="tier ${pick.tier === i ? "on" : ""}" style="--tc:${t.color};--ti:${t.ink}" role="radio" aria-checked="${pick.tier === i}">${pips(i)}<b>${t.name}</b></button>`);
      b.addEventListener("click", () => {
        pick.tier = i;
        tp.querySelectorAll(".tier").forEach((x) => {
          x.classList.toggle("on", x === b);
          x.setAttribute("aria-checked", String(x === b));
        });
      });
      tp.append(b);
    });
    el.querySelector('[data-go="home"]')!.addEventListener("click", () => this.home());
    el.querySelector('[data-go="play"]')!.addEventListener("click", () => {
      save("wsl2-freepick", pick);
      this.play({ kind: "free", bucket: pick.bucket, tier: pick.tier, index: 0 });
    });
    this.wireButtons(el);
    this.show(el);
  }

  // ── game ──
  levelFor(ctx: Ctx): LevelDef | null {
    if (ctx.kind === "track") return TRACKS[ctx.tier]?.[ctx.index] ?? null;
    const tiers = FREE[ctx.bucket] ?? [];
    // an empty cell falls back to the nearest difficulty that has levels
    for (const d of [0, -1, 1, -2, 2, -3, 3]) {
      const list = tiers[ctx.tier + d] ?? [];
      if (list.length) return list[ctx.index % list.length]!;
    }
    return null;
  }

  play(ctx: Ctx) {
    const level = this.levelFor(ctx);
    if (!level) return;
    if (ctx.kind === "track") this.pickTier(ctx.tier);
    const fresh = this.freshMechs(level);
    const mech = mechList(level);
    this.setHue(MECHANICS[fresh[0] ?? mech[mech.length - 1]!]?.hue ?? 215);
    const el = h(`<section class="screen game"><div class="stage-slot"></div></section>`);
    this.show(el);
    if (!this.stage) {
      try {
        this.stage = new Stage(this.quality);
      } catch {
        el.append(h(`<p class="webgl-error">Couldn't start WebGL in this browser.</p>`));
        return;
      }
    }
    this.stage.mount(el.querySelector(".stage-slot")!);
    this.session = new Session(this, this.stage, el, ctx, level);
    this.wireButtons(el);
    // the very first game explains the basics; any mechanic met for the first time gets its card
    const cards = [...(this.progress.seen.classic ? [] : ["classic"]), ...fresh];
    if (cards.length) {
      for (const m of cards) this.progress.seen[m] = true;
      this.saveProgress();
      this.session.showIntro(cards);
    }
  }

  nextOf(ctx: Ctx): Ctx | null {
    if (ctx.kind === "track") return ctx.index + 1 < TRACKS[ctx.tier]!.length ? { ...ctx, index: ctx.index + 1 } : null;
    return { ...ctx, index: ctx.index + 1 };
  }

  /** every level of the context's track has stars */
  trackDone(ctx: Ctx) {
    if (ctx.kind !== "track") return false;
    const s = this.trackStats(ctx.tier);
    return s.done === s.total;
  }

  /** the next harder track, for the end of a track */
  harderOf(ctx: Ctx): Ctx | null {
    if (ctx.kind !== "track" || ctx.tier + 1 >= TRACKS.length) return null;
    return { kind: "track", tier: ctx.tier + 1, index: this.nextIndex(ctx.tier + 1) };
  }

  record(level: LevelDef, stars: number) {
    if ((this.progress.stars[level.id] ?? 0) < stars) this.progress.stars[level.id] = stars;
    this.saveProgress();
  }

  leave(ctx: Ctx) {
    if (ctx.kind === "track") this.map(ctx.tier, ctx.index);
    else this.free();
  }
}

// ─── one level being played ─────────────────────────────────────────────────

class Session {
  private state: State;
  private history: State[] = [];
  private moves = 0;
  private selected: number | null = null;
  private pending = 0;
  private won = false;
  private epoch = 0;
  private disposed = false;
  private hud: HTMLElement;
  private toastTimer = 0;
  private overlay: HTMLElement | null = null;

  constructor(
    private app: App,
    private stage: Stage,
    private host: HTMLElement,
    private ctx: Ctx,
    private level: LevelDef,
  ) {
    this.state = initialState(level);
    const tier = level.tier ?? 0;
    const title = ctx.kind === "track" ? `Level ${ctx.index + 1}` : MECHANICS[ctx.bucket]!.name;
    const chips =
      (level.boss ? `<span class="chip boss"><i>${ICONS.crown}</i>Challenge</span>` : "") +
      mechList(level)
        .map((m) => `<button type="button" class="chip" data-mech="${m}" style="--h:${MECHANICS[m]!.hue}"><i>${ICONS[m]}</i>${MECHANICS[m]!.name}</button>`)
        .join("");
    this.hud = h(`<div class="hud">
      <header class="hud-top">
        <button type="button" class="gbtn glass round" data-act="menu" aria-label="Pause">${ICONS.menu}</button>
        <div class="plate"><strong>${title}</strong>${ribbon(tier, "sm")}</div>
        <div class="moves" aria-live="polite">
          <b class="mv">0</b><span>par ${level.par}</span>
          <span class="meter" aria-label="Stars at the current move count">${[0, 1, 2].map(() => `<i>${ICONS.star}</i>`).join("")}</span>
        </div>
      </header>
      <div class="hud-sub"><div class="chips">${chips}</div><div class="queue" hidden></div></div>
      <footer class="hud-bottom">
        <button type="button" class="gbtn blue act" data-act="undo">${ICONS.undo}<span>Undo</span></button>
        <button type="button" class="gbtn orange act" data-act="restart">${ICONS.restart}<span>Restart</span></button>
        <button type="button" class="gbtn purple act" data-act="hint">${ICONS.hint}<span>Hint</span></button>
      </footer>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>`);
    host.append(this.hud);
    this.hud.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => b.addEventListener("click", () => this.action(b.dataset.act!)));
    this.hud.querySelectorAll<HTMLButtonElement>("button.chip").forEach((b) => b.addEventListener("click", () => this.showRules(b.dataset.mech!, false)));
    this.stage.onTap = (i) => this.onTap(i);
    this.measureHud();
    this.stage.build(level, this.state);
    this.updateHud();
  }

  dispose() {
    this.disposed = true;
    this.epoch++;
    this.hud.remove();
    this.overlay?.remove();
    this.stage.onTap = null;
  }

  private measureHud() {
    const top = this.hud.querySelector(".hud-sub")!.getBoundingClientRect();
    const bottom = this.hud.querySelector(".hud-bottom")!.getBoundingClientRect();
    const H = this.host.clientHeight || window.innerHeight;
    this.stage.hudTop = Math.max(90, top.bottom + 10);
    this.stage.hudBottom = Math.max(100, H - bottom.top + 8);
  }

  private action(act: string) {
    sfx.unlock();
    if (act === "menu") this.pause();
    else if (act === "undo") this.undo();
    else if (act === "restart") this.restart();
    else if (act === "hint") this.hint();
  }

  private updateHud() {
    this.hud.querySelector(".mv")!.textContent = String(this.moves);
    const lit = starsFor(this.moves, this.level.par);
    this.hud.querySelectorAll(".meter i").forEach((s, i) => s.classList.toggle("on", i < lit));
    (this.hud.querySelector('[data-act="undo"]') as HTMLButtonElement).disabled = this.history.length === 0 || this.won;
    (this.hud.querySelector('[data-act="restart"]') as HTMLButtonElement).disabled = this.history.length === 0 && this.pending === 0;
    const q = this.hud.querySelector<HTMLElement>(".queue")!;
    if (this.level.mode === "orders") {
      const upcoming = this.level.queue.slice(this.state.qi, this.state.qi + 5);
      q.hidden = false;
      q.innerHTML = upcoming.length
        ? `<span>Next</span>${upcoming.map((o) => `<i class="q" style="--c:${css(o.color)}">${o.cap}</i>`).join("")}${this.level.queue.length - this.state.qi > 5 ? "<span>…</span>" : ""}`
        : `<span>Last orders</span>`;
    }
  }

  // ── overlays ──
  private openOverlay(html: string, cls = "") {
    this.overlay?.remove();
    const o = h(`<div class="overlay ${cls}">${html}</div>`);
    this.host.append(o);
    this.overlay = o;
    return o;
  }
  private closeOverlay() {
    this.overlay?.remove();
    this.overlay = null;
  }

  /** Rules cards shown one after another before the level starts. */
  showIntro(mechs: string[]) {
    const [first, ...rest] = mechs;
    if (first) this.showRules(first, true, rest.length > 0, () => this.showIntro(rest));
  }

  showRules(mech: string, isNew: boolean, more = false, then?: () => void) {
    const m = MECHANICS[mech]!;
    // the basics card for the very first game
    const basics = isNew && mech === "classic";
    const o = this.openOverlay(
      `<div class="card rules-card" style="--h:${m.hue}">
        ${isNew ? `<div class="card-ribbon"><span>${basics ? "Welcome" : "New mechanic"}</span></div>` : ""}
        <div class="rules-icon">${ICONS[mech]}</div>
        <h2>${basics ? "How to play" : m.name}</h2>
        <ul class="rules">${m.rules.map((r) => `<li>${r}</li>`).join("")}</ul>
        <button type="button" class="gbtn green big" data-close><span>${more ? "Next" : isNew ? "Got it!" : "Continue"}</span>${more ? ICONS.next : ""}</button>
      </div>`,
      "dim",
    );
    o.querySelector("[data-close]")!.addEventListener("click", () => {
      this.closeOverlay();
      then?.();
    });
  }

  private pause() {
    const l = this.level;
    const o = this.openOverlay(
      `<div class="card pause-card">
        <h2>Paused</h2>
        <div class="pause-meta">${ribbon(l.tier ?? 0)}<p class="meta">Difficulty ${pct(effortOf(l))} · par ${l.par}${l.stats.exact ? " (proven optimal)" : ""}</p></div>
        <button type="button" class="gbtn green big" data-close>${ICONS.play}<span>Resume</span></button>
        <div class="row">
          <button type="button" class="gbtn glass" data-go="leave">${ICONS.map}<span>${this.ctx.kind === "track" ? "Map" : "Change"}</span></button>
          <button type="button" class="gbtn glass" data-go="home">${ICONS.home}<span>Menu</span></button>
        </div>
        <button type="button" class="gbtn glass" data-go="sound">${sfx.muted ? ICONS.mute : ICONS.sound}<span>${sfx.muted ? "Sound off" : "Sound on"}</span></button>
      </div>`,
      "dim",
    );
    o.querySelector("[data-close]")!.addEventListener("click", () => this.closeOverlay());
    o.querySelector('[data-go="leave"]')!.addEventListener("click", () => this.app.leave(this.ctx));
    o.querySelector('[data-go="home"]')!.addEventListener("click", () => this.app.home());
    const snd = o.querySelector<HTMLButtonElement>('[data-go="sound"]')!;
    snd.addEventListener("click", () => {
      sfx.setMuted(!sfx.muted);
      snd.innerHTML = `${sfx.muted ? ICONS.mute : ICONS.sound}<span>${sfx.muted ? "Sound off" : "Sound on"}</span>`;
    });
  }

  private toast(html: string, ms = 1900) {
    const t = this.hud.querySelector<HTMLElement>(".toast")!;
    t.innerHTML = html;
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
  }

  // ── input ──
  private select(i: number | null) {
    const prev = this.selected;
    this.selected = i;
    this.stage.select(i, prev);
    if (i !== null) {
      const v = this.state.vessels[i]!;
      sfx.tap(v.layers.length / v.cap);
      buzz(8);
    }
  }

  private onTap(i: number) {
    sfx.unlock();
    if (this.disposed || this.won || this.overlay) return;
    const st = this.state;
    const n = st.vessels.length;
    const mode = this.level.mode;
    if (this.selected === null) {
      if (i >= n) {
        this.toast("First pick a bottle to pour from");
        return;
      }
      if (this.stage.isBusy(i)) return;
      const block = sourceBlock(st, mode, i);
      if (block) this.explainSource(i, block);
      else this.select(i);
      return;
    }
    const from = this.selected;
    if (i === from) {
      this.select(null);
      return;
    }
    if (this.stage.isBusy(i) || this.stage.isBusy(from)) return;
    if (canPour(st, mode, from, i)) {
      void this.pour(from, i);
      return;
    }
    if (i < n && sourceBlock(st, mode, i) === null) {
      this.select(i);
      return;
    }
    this.explainTarget(from, i);
    this.stage.shake(i);
    this.select(null);
    sfx.invalid();
    buzz([10, 40, 10]);
  }

  private explainSource(i: number, block: string) {
    const v = this.state.vessels[i]!;
    if (block === "locked") {
      this.toast(`Locked. Opens when you complete ${dot(v.lock!)}`);
      this.stage.shake(i);
      sfx.invalid();
    } else if (block === "jar") {
      this.toast("You can't pour out of a jar — only into it");
      this.stage.shake(i);
      sfx.invalid();
    } else if (block === "complete") {
      this.stage.shake(i);
    }
  }

  private explainTarget(from: number, to: number) {
    const st = this.state;
    const n = st.vessels.length;
    const run = sourceRun(st.vessels[from]!);
    if (!run) return;
    if (to >= n) {
      const slot = st.slots[to - n];
      if (slot && slot.color !== run.color) this.toast(`This cup wants ${dot(slot.color)}`);
      return;
    }
    const d = st.vessels[to]!;
    if (d.lock !== null) this.toast(`Locked. Opens when you complete ${dot(d.lock)}`);
    else if (d.kind === "jar" && d.accept !== null && d.accept !== run.color) this.toast(`This jar only takes ${dot(d.accept)}`);
  }

  private async pour(from: number, to: number) {
    const epoch = this.epoch;
    const prev = this.state;
    const r = applyPour(prev, this.level, from, to);
    this.history.push(prev);
    this.state = r.state;
    this.moves++;
    this.selected = null;
    this.pending++;
    this.updateHud();

    buzz(12);
    // the sound is scheduled for the moment the liquid leaves the lip
    await this.stage.pour(from, to, r.amount, r.color, (lead, dur) => sfx.pour(dur, lead));
    if (epoch !== this.epoch) return;
    const settle = this.stage.settle(this.state, from, to, r.revealed, r.completed, r.unlocked, r.orderDone);
    if (r.completed.length) {
      sfx.complete();
      buzz([15, 50, 25]);
    }
    if (r.unlocked.length) setTimeout(() => sfx.unlock2(), 140);
    if (r.orderDone >= 0) sfx.order();
    await settle;
    if (epoch !== this.epoch) return;
    this.pending--;
    this.updateHud();
    this.checkEnd();
  }

  private checkEnd() {
    if (this.pending > 0 || this.stage.anyBusy() || this.won) return;
    if (isWin(this.state, this.level.mode)) {
      this.won = true;
      void this.victory();
      return;
    }
    if (validMoves(this.state, this.level.mode).length === 0) this.stuck();
  }

  private stuck() {
    const o = this.openOverlay(
      `<div class="card stuck-card">
        <div class="rules-icon sad">${ICONS.classic}</div>
        <h2>No moves left</h2>
        <p class="meta">Undo a couple of moves or restart the level.</p>
        <div class="row">
          <button type="button" class="gbtn blue" data-go="undo">${ICONS.undo}<span>Undo</span></button>
          <button type="button" class="gbtn orange" data-go="restart">${ICONS.restart}<span>Restart</span></button>
        </div>
      </div>`,
      "dim",
    );
    o.querySelector('[data-go="undo"]')!.addEventListener("click", () => {
      this.closeOverlay();
      this.undo();
    });
    o.querySelector('[data-go="restart"]')!.addEventListener("click", () => {
      this.closeOverlay();
      this.restart();
    });
  }

  private async victory() {
    const epoch = this.epoch;
    this.updateHud();
    await this.stage.celebrateWin();
    if (epoch !== this.epoch) return;
    sfx.win();
    const l = this.level;
    const stars = starsFor(this.moves, l.par);
    this.app.record(l, stars);
    const next = this.app.nextOf(this.ctx);
    const harder = next ? null : this.app.harderOf(this.ctx);
    const tier = TIERS[l.tier ?? 0]!;
    const head = this.ctx.kind === "track" ? `Level ${this.ctx.index + 1}` : "Level";
    const praise = stars === 3 ? (this.moves < l.par ? "Better than par!" : "Perfect!") : stars === 2 ? "Great!" : "Complete!";
    const o = this.openOverlay(
      `<div class="rays" aria-hidden="true"></div>
      <div class="card win-card">
        <div class="card-ribbon big"><span>${head} complete</span></div>
        <div class="big-stars">${[0, 1, 2].map((i) => `<i class="${i < stars ? "on" : ""}" style="--d:${0.25 + i * 0.22}s">${ICONS.star}</i>`).join("")}</div>
        <div class="praise">${praise}</div>
        <div class="win-stats">
          <div><b>${this.moves}</b><span>${moveWord(this.moves)}</span></div>
          <div><b>${l.par}</b><span>par</span></div>
          <div><b style="color:${tier.color}">${pct(effortOf(l))}</b><span>${tier.name.toLowerCase()}</span></div>
        </div>
        ${
          next
            ? `<button type="button" class="gbtn green big" data-go="next"><span>${this.ctx.kind === "track" ? "Next level" : "Another level"}</span>${ICONS.next}</button>`
            : `<p class="meta center">${this.app.trackDone(this.ctx) ? `You've completed every ${tier.name} level!` : `That was the last ${tier.name} level.`}</p>${
                harder
                  ? `<button type="button" class="gbtn green big fit" data-go="harder"><span>Play ${TIERS[harder.tier]!.short}</span>${ICONS.next}</button>`
                  : ""
              }`
        }
        <div class="row">
          <button type="button" class="gbtn glass" data-go="again">${ICONS.restart}<span>Restart</span></button>
          <button type="button" class="gbtn glass" data-go="leave">${ICONS.map}<span>${this.ctx.kind === "track" ? "Map" : "Change"}</span></button>
        </div>
      </div>`,
      "win",
    );
    o.querySelectorAll<HTMLElement>(".big-stars i.on").forEach((_, i) => setTimeout(() => sfx.star(i), 280 + i * 220));
    o.querySelector('[data-go="next"]')?.addEventListener("click", () => this.app.play(next!));
    o.querySelector('[data-go="harder"]')?.addEventListener("click", () => this.app.play(harder!));
    o.querySelector('[data-go="again"]')!.addEventListener("click", () => {
      this.closeOverlay();
      this.restart(true);
    });
    o.querySelector('[data-go="leave"]')!.addEventListener("click", () => this.app.leave(this.ctx));
  }

  private undo() {
    if (!this.history.length || this.won) return;
    if (this.pending > 0 || this.stage.anyBusy()) {
      this.toast("One moment — still pouring");
      return;
    }
    this.state = this.history.pop()!;
    this.moves = Math.max(0, this.moves - 1);
    this.selected = null;
    this.stage.sync(this.state);
    sfx.undo();
    this.updateHud();
  }

  private restart(silent = false) {
    this.epoch++;
    this.state = initialState(this.level);
    this.history = [];
    this.moves = 0;
    this.pending = 0;
    this.won = false;
    this.selected = null;
    this.stage.build(this.level, this.state);
    if (!silent) sfx.undo();
    this.updateHud();
  }

  private hint() {
    if (this.won) return;
    if (this.pending > 0 || this.stage.anyBusy()) {
      this.toast("One moment — still pouring");
      return;
    }
    this.toast("Looking for a move…", 900);
    const epoch = this.epoch;
    setTimeout(() => {
      if (epoch !== this.epoch) return;
      let move: Move | undefined;
      const bfs = solveBfs(this.level, this.state, 60_000);
      if (bfs.solvable && bfs.path?.length) move = bfs.path[0];
      else if (!bfs.exact) move = solveBeam(this.level, this.state, 700)?.[0];
      if (!move) {
        this.toast(bfs.exact ? "No solution from here — undo a few moves" : "Couldn't find a move in time", 2600);
        return;
      }
      if (this.selected !== move.from) this.select(move.from);
      this.stage.flashHint(move.from, move.to);
      const left = bfs.path?.length ?? 0;
      this.toast(bfs.exact ? `${left} ${moveWord(left)} to go` : "Try this", 2200);
    }, 40);
  }

  /** dev helper: tap through a solution from the current state */
  async autoplay(delay = 650) {
    const epoch = this.epoch;
    const bfs = solveBfs(this.level, this.state, 120_000);
    const path = bfs.solvable && bfs.path ? bfs.path : solveBeam(this.level, this.state, 1500);
    const idle = async () => {
      while (this.pending > 0 || this.stage.anyBusy()) await new Promise((r) => setTimeout(r, 50));
    };
    for (const m of path ?? []) {
      await idle();
      if (epoch !== this.epoch || this.disposed) return;
      this.onTap(m.from);
      await new Promise((r) => setTimeout(r, 160));
      this.onTap(m.to);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
