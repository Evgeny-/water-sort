import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { LevelDef, State } from "../engine/types";
import { PALETTE } from "../palette";
import { Particles, Stream } from "./fx";
import { hexToVec3, makeShadowTexture, SUN } from "./materials";
import { levelFor, spillAngle } from "./shapes";
import { LIFT, VesselView } from "./vessel";

export type Quality = "high" | "low";

const SLOT_W = 1.34;
const ROW_H = 3.6;
const FOV = 24;
const CAM_TILT = (8 * Math.PI) / 180;
const Z_FRONT = 1.25;
/** never draw a bottle taller than this many CSS px (desktop screens) */
const MAX_PX_PER_UNIT = 88;

interface Tween {
  t: number;
  dur: number;
  fn: (k: number) => void;
  done: () => void;
}

const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t,
  outBack: (t: number) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Owns the WebGL scene: builds vessel views for a level, lays them out,
 * fits the camera, runs an on-demand render loop and choreographs pours.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  views: VesselView[] = [];
  cups: (VesselView | null)[] = [];
  private cupBase: THREE.Vector3[] = [];
  private readonly particles: Particles;
  private readonly shadowTex = makeShadowTexture();
  private tweens: Tween[] = [];
  private running = false;
  private last = 0;
  private time = 0;
  private keepAlive = 0;
  private boardCenter = new THREE.Vector3();
  private boardSize = new THREE.Vector2(1, 1);
  private level: LevelDef | null = null;
  private segments: number;
  hudTop = 70;
  hudBottom = 110;
  onTap: ((index: number) => void) | null = null;
  /** set by the app so the stage can show upcoming orders */
  queuePreview: HTMLElement | null = null;

  /** the stage owns its element; the app mounts it wherever the game screen is */
  readonly container: HTMLElement;

  /**
   * In high quality the reflections drift all the time, so the loop keeps running
   * at ~30 fps when nothing else moves; in low quality it sleeps as before.
   */
  private readonly ambient: boolean;
  private disposed = false;

  constructor(readonly quality: Quality) {
    this.ambient = quality === "high";
    this.container = document.createElement("div");
    this.container.className = "stage-root";
    this.container.style.cssText = "position:absolute;inset:0;";
    // MSAA when the browser gives it; liquid edges are smoothed in the shader either way
    let noAA = false;
    try {
      noAA = import.meta.env.DEV && localStorage.getItem("wsl-noaa") === "1";
    } catch {
      /* storage unavailable */
    }
    this.renderer = new THREE.WebGLRenderer({ antialias: !noAA, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.segments = quality === "high" ? 48 : 28;
    const el = this.renderer.domElement;
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.touchAction = "none";
    this.container.appendChild(el);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f2e, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 6);
    this.scene.add(key);

    this.particles = new Particles(this.scene);

    el.addEventListener("pointerdown", (e) => {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit !== null) this.onTap?.(hit);
    });
    new ResizeObserver(() => this.resize()).observe(this.container);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  /** Attach the canvas to a (new) parent and re-measure. */
  mount(parent: HTMLElement) {
    if (this.container.parentElement !== parent) parent.appendChild(this.container);
    this.resize();
  }

  // ─── building & layout ────────────────────────────────────────────────

  build(level: LevelDef, state: State) {
    for (const v of this.views) this.removeView(v);
    for (const c of this.cups) if (c) this.removeView(c);
    this.views = [];
    this.cups = [];
    this.tweens = [];
    this.particles.clear();
    this.level = level;

    for (const v of state.vessels) {
      const view = new VesselView(v.kind, v.cap, this.segments, this.shadowTex);
      view.corkable = level.mode === "sort";
      view.setContents(v);
      this.addView(view);
      this.views.push(view);
    }
    for (const slot of state.slots) {
      if (!slot) {
        this.cups.push(null);
        continue;
      }
      this.cups.push(this.makeCup(slot.color, slot.cap, slot.fill));
    }
    this.layout();
    for (const v of [...this.views, ...this.cups]) {
      if (!v) continue;
      v.pos.copy(v.base);
      v.update(0, 0);
      v.resetMotion();
    }
    this.wake();
  }

  private makeCup(color: number, cap: number, fill: number) {
    const cup = new VesselView("cup", cap, this.segments, this.shadowTex);
    cup.setOrderLook(color);
    cup.layers = fill > 0 ? [{ color, rgb: hexToVec3(PALETTE[color]!.hex), vol: fill, hidden: 0 }] : [];
    this.addView(cup);
    return cup;
  }

  private addView(v: VesselView) {
    this.scene.add(v.group, v.shadow);
  }

  private removeView(v: VesselView) {
    this.scene.remove(v.group, v.shadow);
    v.dispose();
  }

  private layout() {
    const level = this.level!;
    const widths = this.views.map((v) => (v.kind === "jar" ? 2 : 1));
    const total = widths.reduce((a, b) => a + b, 0);
    const hasCups = level.mode === "orders";
    const cupArea = hasCups ? 3.3 : 0;
    const w = this.container.clientWidth || 390;
    const h = Math.max(200, (this.container.clientHeight || 700) - this.hudTop - this.hudBottom);

    let best: number[][] = [];
    let bestScore = -1;
    for (let rows = 1; rows <= 5; rows++) {
      const target = Math.ceil(total / rows);
      const out: number[][] = [];
      let cur: number[] = [];
      let curW = 0;
      widths.forEach((wd, i) => {
        const remainingRows = rows - out.length;
        if (curW + wd > target && cur.length && remainingRows > 1) {
          out.push(cur);
          cur = [];
          curW = 0;
        }
        cur.push(i);
        curW += wd;
      });
      if (cur.length) out.push(cur);
      const rowW = Math.max(...out.map((r) => r.reduce((a, i) => a + widths[i]!, 0)));
      if (out.some((r) => r.length === 1 && widths[r[0]!] === 1) && out.length > 1 && total > 3) continue;
      const bw = rowW * SLOT_W + 0.4;
      const bh = out.length * ROW_H + cupArea + 0.6;
      const score = Math.min(w / bw, h / bh);
      if (score > bestScore * 1.04) {
        bestScore = score;
        best = out;
      }
    }

    const rows = best;
    let maxRowW = 0;
    rows.forEach((row, ri) => {
      const rw = row.reduce((a, i) => a + widths[i]!, 0) * SLOT_W;
      maxRowW = Math.max(maxRowW, rw);
      let x = -rw / 2;
      for (const i of row) {
        const wd = widths[i]! * SLOT_W;
        this.views[i]!.base.set(x + wd / 2, -ri * ROW_H, 0);
        x += wd;
      }
    });
    const topY = 2.75;
    const bottomY = -(rows.length - 1) * ROW_H - 0.25;
    let top = topY + 0.5;
    this.cupBase = [];
    if (hasCups) {
      const n = this.cups.length;
      const cupY = topY + 0.95;
      for (let s = 0; s < n; s++) {
        const x = (s - (n - 1) / 2) * 1.6;
        this.cupBase.push(new THREE.Vector3(x, cupY, 0));
        const cup = this.cups[s];
        if (cup) {
          cup.base.copy(this.cupBase[s]!);
          cup.pos.copy(cup.base);
        }
      }
      top = cupY + 1.0 + 1.6;
      maxRowW = Math.max(maxRowW, n * 1.6);
    }
    this.boardCenter.set(0, (top + bottomY) / 2, 0);
    this.boardSize.set(maxRowW + 0.5, top - bottomY);
    this.fitCamera();
    for (const v of [...this.views, ...this.cups]) {
      if (!v || v.animated) continue;
      v.pos.copy(v.base);
      v.resetMotion();
    }
  }

  private fitCamera() {
    const w = this.container.clientWidth || 390;
    const h = this.container.clientHeight || 700;
    const availH = Math.max(100, h - this.hudTop - this.hudBottom);
    const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
    const aspect = w / h;
    const dH = (this.boardSize.y * h) / (2 * tanHalf * availH);
    const dW = this.boardSize.x / (2 * tanHalf * aspect);
    // big screens: keep bottles a sensible size instead of filling the whole window
    const dMin = h / (2 * tanHalf * MAX_PX_PER_UNIT);
    const D = Math.max(dH, dW, dMin) * 1.04;
    const worldPerPx = (2 * D * tanHalf) / h;
    const target = this.boardCenter.clone();
    target.y += ((this.hudTop - this.hudBottom) / 2) * worldPerPx;
    this.camera.aspect = aspect;
    this.camera.position.set(target.x, target.y + D * Math.sin(CAM_TILT), D * Math.cos(CAM_TILT));
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (this.level) this.layout();
    else this.fitCamera();
    this.wake();
  }

  // ─── input ─────────────────────────────────────────────────────────────

  private screenRect(v: VesselView, base: THREE.Vector3) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const r = Math.max(v.radius, 0.5) + 0.17;
    const pts = [
      _v.set(base.x - r, base.y - 0.15, 0),
      _w.set(base.x + r, base.y + v.height + LIFT + 0.2, 0),
    ].map((p) => p.clone().project(this.camera));
    const x0 = rect.left + ((pts[0]!.x + 1) / 2) * rect.width;
    const x1 = rect.left + ((pts[1]!.x + 1) / 2) * rect.width;
    const y0 = rect.top + ((1 - pts[1]!.y) / 2) * rect.height;
    const y1 = rect.top + ((1 - pts[0]!.y) / 2) * rect.height;
    return { x0, x1, y0, y1 };
  }

  pick(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    const test = (v: VesselView, base: THREE.Vector3, idx: number) => {
      const r = this.screenRect(v, base);
      if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return;
      const d = Math.hypot(x - (r.x0 + r.x1) / 2, y - (r.y0 + r.y1) / 2);
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    };
    this.views.forEach((v, i) => test(v, v.base, i));
    this.cups.forEach((c, s) => {
      if (c) test(c, this.cupBase[s]!, this.views.length + s);
    });
    return best;
  }

  // ─── loop ──────────────────────────────────────────────────────────────

  wake(hold = 0.4) {
    this.keepAlive = Math.max(this.keepAlive, hold);
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (this.disposed) {
      this.running = false;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    for (const tw of this.tweens.slice()) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    let active = this.tweens.length > 0 || this.particles.alive;
    for (const v of this.views) {
      v.update(dt, this.time);
      active ||= v.active;
    }
    for (const c of this.cups) {
      if (!c) continue;
      c.update(dt, this.time);
      active ||= c.active;
    }
    for (const s of this.streams) (s.mat.uniforms.uTime!.value as number) = this.time;
    // the "sun" wanders slowly, so the highlights on the glass are never quite still
    const sun = 0.55 * Math.sin(this.time * 0.12) + 0.22 * Math.sin(this.time * 0.29 + 1.3);
    SUN.value = sun;
    for (const v of this.views) v.setSun(sun, this.time);
    for (const c of this.cups) c?.setSun(sun, this.time);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.keepAlive -= dt;
    if (active || this.keepAlive > 0) {
      requestAnimationFrame(this.frame);
    } else if (this.ambient && this.views.length > 0 && this.container.isConnected) {
      setTimeout(() => requestAnimationFrame(this.frame), 30);
    } else {
      this.running = false;
    }
  };

  tween(dur: number, fn: (k: number) => void): Promise<void> {
    this.wake();
    return new Promise((resolve) => this.tweens.push({ t: 0, dur, fn, done: resolve }));
  }

  wait(sec: number) {
    return this.tween(sec, () => {});
  }

  // ─── simple feedback ───────────────────────────────────────────────────

  select(i: number | null, prev: number | null) {
    if (prev !== null && this.views[prev]) {
      this.views[prev]!.liftTarget = 0;
      this.views[prev]!.glowTarget = 0;
    }
    if (i !== null && this.views[i]) {
      this.views[i]!.liftTarget = LIFT;
      this.views[i]!.glowTarget = 0.55;
      this.views[i]!.kick(0, 1.2);
    }
    this.wake();
  }

  shake(i: number) {
    const v = i < this.views.length ? this.views[i] : this.cups[i - this.views.length];
    v?.shake();
    this.wake();
  }

  isBusy(i: number) {
    const v = i < this.views.length ? this.views[i] : this.cups[i - this.views.length];
    return !v || v.busy;
  }

  anyBusy() {
    return this.views.some((v) => v.busy) || this.cups.some((c) => c?.busy);
  }

  /** Snap every view to a logical state (undo / restart). */
  sync(state: State) {
    this.views.forEach((v, i) => {
      v.setContents(state.vessels[i]!);
      v.liftTarget = 0;
      v.glowTarget = 0;
    });
    state.slots.forEach((slot, s) => {
      const cur = this.cups[s];
      if (cur) this.removeView(cur);
      this.cups[s] = slot ? this.makeCup(slot.color, slot.cap, slot.fill) : null;
      if (this.cups[s]) {
        this.cups[s]!.base.copy(this.cupBase[s]!);
        this.cups[s]!.pos.copy(this.cupBase[s]!);
        this.cups[s]!.resetMotion();
      }
    });
    this.wake();
  }

  // ─── pouring ───────────────────────────────────────────────────────────

  private streams: Stream[] = [];
  private getStream(): Stream {
    const s = this.streams.find((x) => !x.mesh.visible && !(x as unknown as { taken?: boolean }).taken);
    if (s) {
      (s as unknown as { taken?: boolean }).taken = true;
      return s;
    }
    const n = new Stream(this.scene);
    (n as unknown as { taken?: boolean }).taken = true;
    this.streams.push(n);
    return n;
  }
  private releaseStream(s: Stream) {
    s.hide();
    (s as unknown as { taken?: boolean }).taken = false;
  }

  /** Point on the camera ray through `p` that lies at depth z (so it projects onto p). */
  private onRayAtZ(p: THREE.Vector3, z: number, out: THREE.Vector3) {
    const c = this.camera.position;
    const t = (z - c.z) / (p.z - c.z);
    return out.set(c.x + (p.x - c.x) * t, c.y + (p.y - c.y) * t, z);
  }

  /** Surface centre (world) of an upright target holding `vol` units. */
  private surfacePoint(t: VesselView, vol: number, out: THREE.Vector3) {
    return out.set(t.pos.x, t.pos.y + levelFor(t.shape, Math.max(vol, 0.02), 1, 0), t.pos.z);
  }

  /**
   * Animate a pour of `amount` units of `color` from vessel `from` into
   * vessel/cup `to`. The liquid physics does the rest: the bottle tilts until
   * its contents reach the lip, then keeps tilting as it empties.
   */
  /** `onPlan(lead, dur)` fires at once: the liquid starts to flow in `lead` seconds and flows for `dur`. */
  async pour(from: number, to: number, amount: number, color: number, onPlan?: (lead: number, dur: number) => void): Promise<void> {
    const src = this.views[from]!;
    const dst = to < this.views.length ? this.views[to]! : this.cups[to - this.views.length]!;
    src.busy = true;
    dst.busy = true;
    src.animated = true;
    src.glowTarget = 0;
    this.wake(1);
    const rgb = hexToVec3(PALETTE[color]!.hex);
    const threeColor = new THREE.Color(PALETTE[color]!.hex);
    const valve = src.kind === "valve";

    const dstVol0 = dst.totalVolume;
    const mouth = new THREE.Vector3(dst.base.x, dst.base.y + dst.height, dst.base.z);
    const dir = dst.base.x > src.base.x + 0.01 ? 1 : dst.base.x < src.base.x - 0.01 ? -1 : src.base.x <= 0 ? 1 : -1;
    const L = this.onRayAtZ(_v.set(mouth.x, mouth.y + (valve ? 0.45 : 0.3), mouth.z), Z_FRONT, new THREE.Vector3());

    // local point that must sit at L: the lip (tilting bottles) or the tap outlet (valve)
    const shape = src.shape;
    const lipLocal = valve
      ? src.tapOutletLocal(new THREE.Vector3())
      : new THREE.Vector3(dir * shape.rLipOuter * 0.92, shape.yTop - 0.005, 0);
    const poseFor = (phi: number, outPos: THREE.Vector3) => {
      const rot = valve ? 0 : -dir * phi;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      outPos.set(L.x - (lipLocal.x * c - lipLocal.y * s), L.y - (lipLocal.x * s + lipLocal.y * c), L.z);
      return rot;
    };

    const v0 = src.totalVolume;
    const startPos = src.pos.clone();
    const startRot = src.rot;
    const phiStart = valve ? 0 : spillAngle(shape, v0) - 0.02;
    const approachPos = new THREE.Vector3();
    const approachRot = poseFor(phiStart, approachPos);

    // Phase A: fly over and tilt until the liquid reaches the lip
    const approachDur = 0.3 + Math.min(0.12, startPos.distanceTo(approachPos) * 0.012);
    const pourDur = 0.26 + 0.13 * amount;
    onPlan?.(approachDur, pourDur);
    await this.tween(approachDur, (k) => {
      const e = ease.inOut(k);
      src.pos.lerpVectors(startPos, approachPos, e);
      src.pos.y += Math.sin(Math.PI * k) * 0.25;
      src.rot = startRot + (approachRot - startRot) * ease.inOut(Math.min(1, k * 1.08));
    });

    // Phase B: pour
    const stream = this.getStream();
    const srcLayer = valve ? src.layers[0]! : src.layers[src.layers.length - 1]!;
    const srcLayerVol0 = srcLayer.vol;
    let dstLayer: ReturnType<VesselView["ensureTopLayer"]> | null = null;
    let dstLayerVol0 = 0;
    const travel = 0.07;
    const top = new THREE.Vector3();
    const bottom = new THREE.Vector3();
    const handle = src.tap?.getObjectByName("handle");
    let splashAcc = 0;
    let bubbleAcc = 0;
    await this.tween(pourDur + travel, (k) => {
      const t = k * (pourDur + travel);
      const pk = Math.min(1, t / pourDur);
      const flowed = amount * ease.inOut(pk);
      srcLayer.vol = Math.max(0, srcLayerVol0 - flowed);
      if (!valve) {
        const phi = spillAngle(shape, v0 - flowed) + 0.05 + 0.04 * Math.sin(Math.PI * pk);
        src.rot = poseFor(phi, src.pos);
      } else if (handle) {
        handle.rotation.y = Math.min(1, pk * 4) * (Math.PI / 2) * (pk < 0.92 ? 1 : (1 - pk) / 0.08);
      }
      src.update(0, this.time);
      if (valve) src.tapOutlet(top);
      else top.set(dir * shape.rLipOuter * 0.92, shape.yTop - 0.005, 0).applyMatrix4(src.group.matrixWorld);

      const arrived = Math.max(0, Math.min(1, (t - travel) / pourDur));
      const inDst = amount * ease.inOut(arrived);
      if (t >= travel && !dstLayer) {
        dstLayer = dst.ensureTopLayer(color);
        dstLayerVol0 = dstLayer.vol;
      }
      if (dstLayer) dstLayer.vol = dstLayerVol0 + inDst;
      this.surfacePoint(dst, dstVol0 + inDst, bottom);
      // stream: head falls first, tail falls at the end
      const headK = Math.min(1, t / travel);
      const tailK = Math.max(0, (t - pourDur) / travel);
      const a = new THREE.Vector3().lerpVectors(top, bottom, tailK);
      const b = new THREE.Vector3().lerpVectors(top, bottom, headK);
      const radius = (valve ? 0.05 : 0.055) * (1 - tailK * 0.5) * Math.min(1, headK * 3);
      stream.set(a, b, radius, rgb);
      if (headK >= 1 && tailK < 1) {
        splashAcc += 1;
        if (splashAcc >= 2) {
          splashAcc = 0;
          this.particles.splash(bottom.x, bottom.y + 0.01, bottom.z, threeColor, 2);
        }
        dst.agit = Math.min(0.05, dst.agit + 0.004);
        bubbleAcc += amount;
        if (bubbleAcc > 2.2 && dst.kind !== "cup") {
          bubbleAcc = 0;
          const r = dst.shape.radius * 0.7;
          const bx = dst.pos.x + (Math.random() - 0.5) * r * 1.4;
          this.particles.bubble(bx, dst.pos.y + dst.shape.yFloor + 0.08, dst.pos.z + Math.sqrt(Math.max(0, r * r - (bx - dst.pos.x) ** 2)), bottom.y - 0.03);
        }
      }
    });
    this.releaseStream(stream);
    if (srcLayer.vol <= 0.001) src.layers.splice(src.layers.indexOf(srcLayer), 1);
    dst.kick((Math.random() - 0.5) * 2, 1.5);

    // Phase C: return
    const retPos = src.pos.clone();
    const retRot = src.rot;
    src.lift = 0;
    await this.tween(0.34, (k) => {
      const e = ease.out(k);
      src.pos.lerpVectors(retPos, src.base, e);
      src.pos.y += Math.sin(Math.PI * k) * 0.18;
      src.rot = retRot * (1 - ease.inOut(Math.min(1, k * 1.25)));
    });
    src.rot = 0;
    src.animated = false;
    src.liftTarget = 0;
    src.kick(-dir * 1.2, 0.3);
    src.busy = false;
    dst.busy = false;
    this.wake();
  }

  /** After a pour: sync exact contents, then play reveal / complete / unlock / order effects. */
  async settle(state: State, from: number, to: number, revealed: number[], completed: number[], unlocked: number[], orderDone: number) {
    const src = this.views[from]!;
    src.setContents(state.vessels[from]!);
    const nV = this.views.length;
    if (to < nV) this.views[to]!.setContents(state.vessels[to]!);
    // setContents already reflects revealed layers; animate them from murky
    if (revealed.length) {
      const segs = src.layers.filter((l) => l.hidden === 0);
      const topSeg = src.kind === "valve" ? segs[0] : segs[segs.length - 1];
      if (topSeg) {
        topSeg.hidden = 1;
        this.tween(0.55, (k) => (topSeg.hidden = 1 - ease.inOut(k)));
      }
    }
    for (const i of completed) {
      const v = this.views[i]!;
      v.showCork(true);
      v.hopBy(3.2);
      const c = new THREE.Color(PALETTE[state.vessels[i]!.layers[0]!]!.hex);
      this.particles.burst(v.base.x, v.base.y + v.height + 0.1, 0.6, [c, new THREE.Color(0xffffff)], 26);
      v.glow = 1;
      v.glowTarget = 0;
    }
    for (const i of unlocked) {
      const v = this.views[i]!;
      this.tween(0.9, (k) => v.unlockAnim(k)).then(() => v.setLock(null));
      v.hopBy(2.4);
      this.particles.burst(v.base.x, v.base.y + v.height * 0.5, 0.8, [new THREE.Color(0xffe27a), new THREE.Color(0xffffff)], 18, 0.8);
    }
    if (to >= nV) {
      const s = to - nV;
      const cup = this.cups[s]!;
      if (orderDone === s) {
        cup.busy = true;
        const c = new THREE.Color(PALETTE[cup.layers[0]?.color ?? 0]!.hex);
        cup.hopBy(3);
        this.particles.burst(cup.base.x, cup.base.y + 1.1, 0.6, [c, new THREE.Color(0xffffff)], 22);
        await this.wait(0.25);
        const start = cup.base.clone();
        cup.animated = true;
        await this.tween(0.4, (k) => {
          cup.pos.set(start.x + ease.in(k) * 4.5, start.y + Math.sin(k * Math.PI) * 0.3, start.z);
          cup.glassMat.uniforms.uAlpha!.value = 1 - k;
          cup.dimTarget = cup.dim = 1 - k;
        });
        this.removeView(cup);
        const next = state.slots[s];
        if (next) {
          const nc = this.makeCup(next.color, next.cap, next.fill);
          this.cups[s] = nc;
          nc.base.copy(this.cupBase[s]!);
          nc.pos.set(nc.base.x - 4.5, nc.base.y, nc.base.z);
          nc.resetMotion();
          nc.animated = true;
          nc.busy = true;
          const b = this.cupBase[s]!;
          await this.tween(0.42, (k) => {
            const e = ease.outBack(k);
            nc.pos.set(b.x - 4.5 * (1 - e), b.y, b.z);
            nc.glassMat.uniforms.uAlpha!.value = Math.min(1, k * 2);
          });
          nc.animated = false;
          nc.busy = false;
          nc.kick(2);
        } else {
          this.cups[s] = null;
        }
      }
    }
    this.wake();
  }

  async celebrateWin() {
    const colors = PALETTE.slice(0, 8).map((p) => new THREE.Color(p.hex));
    const all = [...this.views];
    all.sort((a, b) => a.base.x - b.base.x || b.base.y - a.base.y);
    all.forEach((v, i) => {
      setTimeout(() => {
        v.hopBy(4.2);
        v.kick(0, 2);
        this.wake();
      }, i * 70);
    });
    const top = this.boardCenter.y + this.boardSize.y / 2 + 1;
    this.particles.confettiRain(this.boardCenter.x, top, this.boardSize.x + 2, colors, 220);
    await this.wait(1.1);
  }

  /** Idle nudge: light runs up a vessel twice, pointing at it without selecting it. */
  glint(i: number) {
    this.views[i]?.glint(2);
    this.wake();
  }

  stopGlints() {
    for (const v of this.views) v.stopGlint();
  }

  /** Hint helper: brief glow on two vessels. */
  flashHint(from: number, to: number) {
    const a = this.views[from];
    const b = to < this.views.length ? this.views[to] : this.cups[to - this.views.length];
    for (const v of [a, b]) {
      if (!v) continue;
      v.glow = 1.2;
      v.glowTarget = 0;
      v.kick(0, 1.5);
    }
    this.wake(1.2);
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
    this.container.remove();
  }
}
