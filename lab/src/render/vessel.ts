import * as THREE from "three";
import type { Color, Vessel } from "../engine/types";
import { isComplete } from "../engine/rules";
import { PALETTE, css } from "../palette";
import { geometriesFor, levelFor, shapeFor, type Shape, type ShapeKind } from "./shapes";
import { hexToVec3, makeGlassMaterial, makeLiquidMaterials, MAX_LAYERS } from "./materials";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { jarBadgeTexture, questionTexture } from "./fx";

export interface ViewLayer {
  color: Color;
  rgb: THREE.Vector3;
  vol: number;
  /** 1 = murky "?" look, animates to 0 on reveal */
  hidden: number;
}

export const LIFT = 0.42;
const TAP_SCALE = 1.25;

const _n = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _acc = new THREE.Vector3();

let corkGeo: THREE.BufferGeometry | null = null;
let corkMat: THREE.Material | null = null;
let chromeMat: THREE.Material | null = null;
let knobMat: THREE.Material | null = null;
let steelMat: THREE.MeshStandardMaterial | null = null;
let linkGeo: THREE.BufferGeometry | null = null;
let padBodyGeo: THREE.BufferGeometry | null = null;
let shackleGeo: THREE.BufferGeometry | null = null;
let legGeo: THREE.BufferGeometry | null = null;
let holeGeo: THREE.BufferGeometry | null = null;
let slotGeo: THREE.BufferGeometry | null = null;
let holeMat: THREE.Material | null = null;

interface LinkState {
  m: THREE.Matrix4;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();

function spring(x: number, v: number, target: number, k: number, c: number, dt: number): [number, number] {
  const a = -k * (x - target) - c * v;
  v += a * dt;
  x += v * dt;
  return [x, v];
}

/**
 * One glass vessel: meshes, liquid layers (in units, animatable), springs for
 * lift / shake / slosh, and all the per-frame uniform plumbing.
 */
export class VesselView {
  readonly group = new THREE.Group();
  readonly shape: Shape;
  readonly glass: THREE.Mesh;
  readonly liquid: THREE.Mesh;
  readonly liquidFringe: THREE.Mesh;
  readonly glassMat: THREE.ShaderMaterial;
  readonly liquidMat: THREE.ShaderMaterial;
  private readonly liquidFringeMat: THREE.ShaderMaterial;
  readonly shadow: THREE.Mesh;
  layers: ViewLayer[] = [];

  /** slot position (bottom centre, world) */
  readonly base = new THREE.Vector3();
  /** when true, pos/rot are driven by a choreographed animation */
  animated = false;
  readonly pos = new THREE.Vector3();
  rot = 0;
  lift = 0;
  private liftV = 0;
  liftTarget = 0;
  private shakeX = 0;
  private shakeV = 0;
  private hop = 0;
  private hopV = 0;
  private wx = 0;
  private wz = 0;
  private wvx = 0;
  private wvz = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private prevRot = 0;
  private prevRotV = 0;
  glow = 0;
  glowTarget = 0;
  agit = 0;
  dim = 1;
  dimTarget = 1;
  busy = false;
  complete = false;
  /** false in orders mode: full bottles are still sources, no corks */
  corkable = true;
  lock: Color | null = null;

  private qSprites: THREE.Sprite[] = [];
  private lockGroup: THREE.Group | null = null;
  private links: THREE.InstancedMesh | null = null;
  private linkState: LinkState[] = [];
  private padlock: THREE.Group | null = null;
  private shackle: THREE.Group | null = null;
  private padBase = new THREE.Vector3();
  private badge: THREE.Sprite | null = null;
  private cork: THREE.Mesh | null = null;
  private corkDrop = 0;
  private corkV = 0;
  tap: THREE.Group | null = null;
  tapOpen = 0;
  /** this bottle's own offset and wobble of the drifting reflections, so no two look alike */
  private readonly sunBias = (Math.random() - 0.5) * 0.5;
  private readonly sunPhase = Math.random() * Math.PI * 2;
  /** progress of a light sweep over the glass, idle below 0 */
  private glintT = -1;
  private coaster: THREE.Mesh | null = null;
  private lastKey = "";

  constructor(
    readonly kind: ShapeKind,
    readonly cap: number,
    segments: number,
    shadowTex: THREE.Texture,
  ) {
    this.shape = shapeFor(kind, cap);
    const geos = geometriesFor(this.shape, segments);
    const liquidMats = makeLiquidMaterials(this.shape.profile, this.shape.yFloor, this.shape.yLip);
    this.liquidMat = liquidMats.solid;
    this.liquidFringeMat = liquidMats.fringe;
    this.glassMat = makeGlassMaterial();
    this.liquid = new THREE.Mesh(geos.liquid, this.liquidMat);
    this.liquidFringe = new THREE.Mesh(geos.liquid, this.liquidFringeMat);
    this.glass = new THREE.Mesh(geos.glass, this.glassMat);
    this.glassMat.uniforms.uGlintH!.value = this.shape.yTop;
    this.liquid.renderOrder = 1;
    this.liquidFringe.renderOrder = 2;
    this.glass.renderOrder = 3;
    this.group.add(this.liquid, this.liquidFringe, this.glass);

    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 0;

    if (kind === "valve") this.buildTap();
  }

  get radius() {
    return this.shape.radius;
  }

  get height() {
    return this.shape.yTop;
  }

  /**
   * A chrome faucet: a flange on the glass, a short pipe curving down into a
   * flared nozzle, and a red four-arm knob on top that turns while it pours.
   */
  private buildTap() {
    chromeMat ??= new THREE.MeshStandardMaterial({ color: 0xd6deea, metalness: 1, roughness: 0.12 });
    knobMat ??= new THREE.MeshPhysicalMaterial({ color: 0xff3d57, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
    const g = new THREE.Group();
    const along = (m: THREE.Mesh, x: number) => {
      m.rotation.z = Math.PI / 2;
      m.position.x = x;
      return m;
    };
    const flange = along(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 24), chromeMat), 0);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.016, 10, 24), chromeMat);
    collar.rotation.y = Math.PI / 2;
    collar.position.x = 0.03;
    const pipe = along(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.15, 20), chromeMat), 0.105);
    // quarter torus from the pipe end (0.18, 0) down to the nozzle (0.25, -0.07)
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.05, 12, 16, Math.PI / 2), chromeMat);
    elbow.position.set(0.18, -0.07, 0);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 20), chromeMat);
    nozzle.position.set(0.25, -0.105, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.012, 8, 24), chromeMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0.25, -0.14, 0);

    const handle = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.08, 12), chromeMat);
    stem.position.y = 0.04;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), knobMat);
    hub.position.y = 0.1;
    handle.add(stem, hub);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.075, 8), knobMat);
      arm.rotation.set(0, -a, Math.PI / 2);
      arm.position.set(Math.cos(a) * 0.045, 0.1, Math.sin(a) * 0.045);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), knobMat);
      ball.position.set(Math.cos(a) * 0.088, 0.1, Math.sin(a) * 0.088);
      handle.add(arm, ball);
    }
    handle.position.set(0.1, 0.045, 0);
    handle.name = "handle";
    g.add(flange, collar, pipe, elbow, nozzle, rim, handle);
    g.position.set(this.shape.radius - 0.02, 0.24, 0);
    g.scale.setScalar(TAP_SCALE);
    this.tap = g;
    this.group.add(g);
  }

  /** Valve outlet in the vessel's own frame: the bottom of the tap's nozzle. */
  tapOutletLocal(out: THREE.Vector3) {
    return out.set(0.25, -0.15, 0).multiplyScalar(TAP_SCALE).add(this.tap!.position);
  }

  /** World position of the valve outlet (for streams). */
  tapOutlet(out: THREE.Vector3) {
    return this.tapOutletLocal(out).applyMatrix4(this.group.matrixWorld);
  }

  /** Point the reflections at the drifting "sun", with this bottle's own offset. */
  setSun(sun: number, time: number) {
    const s = sun + this.sunBias + 0.1 * Math.sin(time * 0.45 + this.sunPhase);
    this.glassMat.uniforms.uSun!.value = s;
    this.liquidMat.uniforms.uSun!.value = s;
  }

  /** Start a soft band of light sweeping up the glass. */
  glint() {
    if (this.glintT < 0) this.glintT = 0;
  }

  setOrderLook(color: Color) {
    const rgb = hexToVec3(PALETTE[color]!.hex);
    (this.glassMat.uniforms.uTint!.value as THREE.Vector3).copy(rgb);
    this.glassMat.uniforms.uTintAmt!.value = 0.2;
    if (!this.coaster) {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1, emissive: 0x000000 });
      this.coaster = new THREE.Mesh(new THREE.CylinderGeometry(this.shape.radius + 0.12, this.shape.radius + 0.14, 0.06, 32), m);
      this.coaster.position.y = -0.03;
      this.group.add(this.coaster);
    }
    const m = this.coaster.material as THREE.MeshStandardMaterial;
    m.color.setHex(PALETTE[color]!.hex);
    m.emissive.setHex(PALETTE[color]!.hex).multiplyScalar(0.35);
  }

  /** Snap liquid + decorations to a logical vessel. */
  setContents(v: Vessel) {
    const segs: ViewLayer[] = [];
    for (let i = 0; i < v.layers.length; i++) {
      const c = v.layers[i]!;
      const h = v.hidden[i]!;
      const last = segs[segs.length - 1];
      if (last && !h && last.hidden === 0 && last.color === c) last.vol += 1;
      else segs.push({ color: c, rgb: hexToVec3(PALETTE[c]!.hex), vol: 1, hidden: h ? 1 : 0 });
    }
    this.layers = segs;
    this.setLock(v.lock);
    if (v.kind === "jar") this.setJarBadge(v.accept, v.cap);
    const done = this.corkable && isComplete(v);
    if (done && !this.complete) this.showCork(false);
    if (!done && this.complete) this.hideCork();
    this.complete = done;
    this.lastKey = "";
    this.syncQuestionMarks();
  }

  setLock(color: Color | null) {
    this.lock = color;
    const tint = this.glassMat.uniforms;
    if (color === null) {
      if (this.lockGroup) {
        this.group.remove(this.lockGroup);
        this.lockGroup = null;
      }
      this.dimTarget = 1;
      if (this.kind !== "cup") tint.uTintAmt!.value = 0.04;
      return;
    }
    if (!this.lockGroup) this.buildLock(color);
    this.dimTarget = 0.62;
    (tint.uTint!.value as THREE.Vector3).set(0.78, 0.84, 0.95);
    tint.uTintAmt!.value = 0.09;
  }

  /** Two steel chains crossing over the bottle's front and a padlock in the key colour. */
  private buildLock(color: Color) {
    steelMat ??= new THREE.MeshStandardMaterial({ color: 0xcfd6e2, metalness: 0.92, roughness: 0.26 });
    linkGeo ??= new THREE.TorusGeometry(0.058, 0.016, 8, 18);
    padBodyGeo ??= new RoundedBoxGeometry(0.44, 0.36, 0.15, 4, 0.07);
    shackleGeo ??= new THREE.TorusGeometry(0.125, 0.03, 12, 28, Math.PI);
    legGeo ??= new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12);
    holeGeo ??= new THREE.CylinderGeometry(0.038, 0.038, 0.02, 20);
    slotGeo ??= new THREE.BoxGeometry(0.03, 0.08, 0.02);
    holeMat ??= new THREE.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.6 });

    const g = new THREE.Group();
    const R = this.shape.radius + 0.035;
    const yA = this.shape.yTop * 0.74;
    const yB = this.shape.yTop * 0.18;
    const n = 13;
    const links = new THREE.InstancedMesh(linkGeo, steelMat, n * 2);
    this.linkState = [];
    for (let c = 0; c < 2; c++) {
      for (let k = 0; k < n; k++) {
        const t = 0.06 + (0.88 * k) / (n - 1);
        const phi = c === 0 ? Math.PI * (1 - t) : Math.PI * t;
        const dphi = c === 0 ? -Math.PI : Math.PI;
        const y = yA + (yB - yA) * t;
        _p.set(R * Math.cos(phi), y, R * Math.sin(phi));
        // basis: x along the chain, z out of the bottle surface
        _bx.set(-R * Math.sin(phi) * dphi, yB - yA, R * Math.cos(phi) * dphi).normalize();
        _bz.set(Math.cos(phi), 0, Math.sin(phi));
        _bz.addScaledVector(_bx, -_bz.dot(_bx)).normalize();
        _by.crossVectors(_bz, _bx);
        if (k % 2) {
          // every other link stands on edge
          const tmp = _by.clone();
          _by.copy(_bz);
          _bz.copy(tmp).negate();
        }
        _m.makeBasis(_bx, _by, _bz);
        _m.scale(_s.set(1.45, 1, 1));
        _m.setPosition(_p);
        const idx = c * n + k;
        links.setMatrixAt(idx, _m);
        this.linkState.push({
          m: _m.clone(),
          vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 0.8 + Math.random() * 1.6, 0.6 + Math.random() * 1.4),
          spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        });
      }
    }
    links.instanceMatrix.needsUpdate = true;
    g.add(links);
    this.links = links;

    const pad = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE[color]!.hex, metalness: 0.3, roughness: 0.24 });
    bodyMat.emissive.setHex(PALETTE[color]!.hex).multiplyScalar(0.12);
    const body = new THREE.Mesh(padBodyGeo, bodyMat);
    const shackle = new THREE.Group();
    const arc = new THREE.Mesh(shackleGeo, steelMat);
    arc.position.y = 0.23;
    const l1 = new THREE.Mesh(legGeo, steelMat);
    l1.position.set(-0.125, 0.19, 0);
    const l2 = new THREE.Mesh(legGeo, steelMat);
    l2.position.set(0.125, 0.19, 0);
    shackle.add(arc, l1, l2);
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, 0.02, 0.078);
    const slot = new THREE.Mesh(slotGeo, holeMat);
    slot.position.set(0, -0.035, 0.078);
    pad.add(shackle, body, hole, slot);
    const cy = (yA + yB) / 2;
    this.padBase.set(0, cy - 0.22, R + 0.13);
    pad.position.copy(this.padBase);
    pad.rotation.x = -0.12;
    pad.scale.setScalar(1.35);
    g.add(pad);
    this.padlock = pad;
    this.shackle = shackle;

    this.lockGroup = g;
    this.group.add(g);
  }

  /** Padlock opening: shackle pops, padlock drops, chain links scatter. t = 0..1 (linear). */
  unlockAnim(t: number) {
    if (!this.lockGroup) return;
    const T = t * 0.9;
    if (this.shackle) {
      const k = Math.min(1, t * 5);
      this.shackle.position.y = 0.09 * k;
      this.shackle.rotation.y = 1.1 * k;
    }
    if (this.padlock) {
      const fall = Math.max(0, T - 0.12);
      this.padlock.position.set(this.padBase.x + fall * 0.4, this.padBase.y - 5.5 * fall * fall, this.padBase.z + fall * 0.8);
      this.padlock.rotation.z = -fall * 2.2;
      const sc = 1 - Math.max(0, (t - 0.6) / 0.4);
      this.padlock.scale.setScalar(Math.max(0.001, sc * 1.35));
    }
    if (this.links) {
      const sc = 1 - Math.max(0, (t - 0.55) / 0.45);
      this.linkState.forEach((ls, i) => {
        _p.setFromMatrixPosition(ls.m);
        _p.addScaledVector(ls.vel, T).add(_s.set(0, -6 * T * T, 0));
        _q.setFromRotationMatrix(ls.m);
        _e.set(ls.spin.x * T, ls.spin.y * T, ls.spin.z * T);
        _q.multiply(new THREE.Quaternion().setFromEuler(_e));
        _m.compose(_p, _q, _s.set(1.45 * sc, sc, sc).max(new THREE.Vector3(0.001, 0.001, 0.001)));
        this.links!.setMatrixAt(i, _m);
      });
      this.links.instanceMatrix.needsUpdate = true;
    }
  }

  private setJarBadge(accept: Color | null, cap: number) {
    const tex = jarBadgeTexture(accept === null ? null : css(accept), cap);
    if (!this.badge) {
      this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      this.badge.renderOrder = 6;
      this.badge.scale.set(0.8, 0.8, 1);
      this.badge.position.set(0, 1.05, this.shape.radius + 0.08);
      this.group.add(this.badge);
    } else {
      (this.badge.material as THREE.SpriteMaterial).map = tex;
    }
    this.badge.visible = true;
  }

  private syncQuestionMarks() {
    const want = this.layers.filter((l) => l.hidden > 0.02).length;
    while (this.qSprites.length < want) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: questionTexture(), transparent: true, depthWrite: false }));
      s.renderOrder = 4;
      s.scale.set(0.34, 0.34, 1);
      this.group.add(s);
      this.qSprites.push(s);
    }
    while (this.qSprites.length > want) this.group.remove(this.qSprites.pop()!);
    let cum = 0;
    let k = 0;
    for (const l of this.layers) {
      const lo = levelFor(this.shape, cum, 1, 0);
      cum += l.vol;
      const hi = levelFor(this.shape, cum, 1, 0);
      if (l.hidden > 0.02) {
        const s = this.qSprites[k++]!;
        s.position.set(0, (lo + hi) / 2, this.shape.radius + 0.02);
        (s.material as THREE.SpriteMaterial).opacity = Math.min(1, l.hidden * 1.4);
      }
    }
  }

  showCork(animate: boolean) {
    corkGeo ??= new THREE.CylinderGeometry(1.08, 0.94, 0.32, 20);
    corkMat ??= new THREE.MeshStandardMaterial({ color: 0xc89b69, roughness: 0.85, metalness: 0 });
    if (!this.cork) {
      this.cork = new THREE.Mesh(corkGeo, corkMat);
      const r = this.shape.neckR;
      this.cork.scale.set(r, 1, r);
      this.group.add(this.cork);
    }
    this.cork.visible = true;
    this.corkDrop = animate ? 1.6 : 0;
    this.corkV = 0;
    this.placeCork();
  }

  hideCork() {
    if (this.cork) this.cork.visible = false;
  }

  private placeCork() {
    if (!this.cork) return;
    const inset = this.kind === "jar" ? 0.02 : 0.1;
    this.cork.position.set(0, this.shape.yTop - inset + 0.16 + this.corkDrop, 0);
  }

  /** Forget motion history (after teleporting the vessel) so nothing sloshes. */
  resetMotion() {
    this.prevPos.copy(this.pos);
    this.prevVel.set(0, 0, 0);
    this.prevRot = this.rot;
    this.prevRotV = 0;
    this.wx = this.wz = this.wvx = this.wvz = 0;
    this.agit = 0;
  }

  /** Give the liquid a push (sloshing). */
  kick(x: number, z = 0) {
    this.wvx += x;
    this.wvz += z;
  }

  shake() {
    this.shakeV = 7;
    this.kick(2.5);
  }

  hopBy(v: number) {
    this.hopV = v;
  }

  get totalVolume() {
    let s = 0;
    for (const l of this.layers) s += l.vol;
    return s;
  }

  /** Top (or bottom for valves) segment that gains/loses liquid. */
  ensureTopLayer(color: Color): ViewLayer {
    const top = this.layers[this.layers.length - 1];
    if (top && top.color === color && top.hidden === 0) return top;
    const l: ViewLayer = { color, rgb: hexToVec3(PALETTE[color]!.hex), vol: 0, hidden: 0 };
    this.layers.push(l);
    return l;
  }

  /** Is anything still moving? */
  get active(): boolean {
    const e =
      Math.abs(this.liftV) + Math.abs(this.lift - this.liftTarget) + Math.abs(this.shakeX) + Math.abs(this.shakeV) +
      Math.abs(this.hop) + Math.abs(this.hopV) + Math.abs(this.wx) + Math.abs(this.wz) + Math.abs(this.wvx) + Math.abs(this.wvz) +
      Math.abs(this.glow - this.glowTarget) + Math.abs(this.dim - this.dimTarget) + this.corkDrop + Math.abs(this.corkV) + this.agit;
    return this.animated || this.busy || e > 0.004 || this.layers.some((l) => l.hidden > 0 && l.hidden < 1);
  }

  update(dt: number, time: number) {
    if (this.glintT >= 0) {
      this.glintT += dt / 0.9;
      if (this.glintT >= 1) this.glintT = -1;
    }
    this.glassMat.uniforms.uGlint!.value = this.glintT;
    if (!this.animated) {
      [this.lift, this.liftV] = spring(this.lift, this.liftV, this.liftTarget, 320, 20, dt);
      [this.shakeX, this.shakeV] = spring(this.shakeX, this.shakeV, 0, 900, 14, dt);
      [this.hop, this.hopV] = spring(this.hop, this.hopV, 0, 160, 9, dt);
      this.pos.set(this.base.x + this.shakeX * 0.06, this.base.y + this.lift + this.hop, this.base.z);
      this.rot += (0 - this.rot) * Math.min(1, dt * 20);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.z = this.rot;
    this.group.updateMatrixWorld();

    // slosh: the liquid surface normal leans towards the acceleration
    if (dt > 0) {
      _vel.subVectors(this.pos, this.prevPos).divideScalar(dt);
      _acc.subVectors(_vel, this.prevVel).divideScalar(dt);
      const rotV = (this.rot - this.prevRot) / dt;
      const rotA = (rotV - this.prevRotV) / dt;
      this.prevPos.copy(this.pos);
      this.prevVel.copy(_vel);
      this.prevRot = this.rot;
      this.prevRotV = rotV;
      const ax = THREE.MathUtils.clamp(_acc.x * 0.0024 + rotA * 0.0003, -0.4, 0.4);
      const ay = THREE.MathUtils.clamp(_acc.y * 0.0012, -0.3, 0.3);
      const k = 190;
      const c = 5.5;
      [this.wx, this.wvx] = spring(this.wx, this.wvx, ax, k, c, dt);
      [this.wz, this.wvz] = spring(this.wz, this.wvz, 0, k, c, dt);
      this.wvz += ay * 0.2 * Math.sin(time * 7);
      this.wx = THREE.MathUtils.clamp(this.wx, -0.22, 0.22);
      this.wz = THREE.MathUtils.clamp(this.wz, -0.22, 0.22);
      this.agit = Math.min(0.05, this.agit * Math.exp(-dt * 2.5) + (Math.abs(this.wvx) + Math.abs(this.wvz)) * 0.0004);
      if (this.agit < 0.0008) this.agit = 0;
    }
    this.glow += (this.glowTarget - this.glow) * Math.min(1, dt * 10);
    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 6);
    if (this.cork && this.cork.visible && (this.corkDrop > 0 || Math.abs(this.corkV) > 0.001)) {
      this.corkV -= 22 * dt;
      this.corkDrop += this.corkV * dt;
      if (this.corkDrop < 0) {
        this.corkDrop = 0;
        this.corkV = Math.abs(this.corkV) > 1.2 ? -this.corkV * 0.28 : 0;
      }
      this.placeCork();
    }

    // shadow follows the vessel on the floor
    const lifted = Math.max(0, this.pos.y - this.base.y);
    const r = this.shape.radius;
    this.shadow.position.set(this.pos.x, this.base.y + 0.004, this.base.z);
    const spread = 1 + lifted * 0.35;
    this.shadow.scale.set(r * 2.7 * spread, r * 1.25 * spread, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - lifted * 1.1);

    this.updateLiquid(time);
  }

  private updateLiquid(time: number) {
    const u = this.liquidMat.uniforms;
    u.uTime!.value = time;
    u.uAgit!.value = this.agit;
    u.uDim!.value = this.dim;
    this.glassMat.uniforms.uGlow!.value = this.glow;
    (u.uO!.value as THREE.Vector3).setFromMatrixPosition(this.group.matrixWorld);
    (u.uInvModel!.value as THREE.Matrix4).copy(this.group.matrixWorld).invert();

    _n.set(this.wx, 1, this.wz).normalize();
    _axis.set(-Math.sin(this.rot), Math.cos(this.rot), 0);
    (u.uN!.value as THREE.Vector3).copy(_n);
    const c = THREE.MathUtils.clamp(_n.dot(_axis), -1, 1);
    const s = Math.sqrt(Math.max(0, 1 - c * c));

    const layers = this.layers.filter((l) => l.vol > 0.0005);
    let key = c.toFixed(4) + "|";
    for (const l of layers) key += l.vol.toFixed(4) + l.color + (l.hidden > 0 ? "h" + l.hidden.toFixed(2) : "") + ",";
    if (key === this.lastKey) return;
    this.lastKey = key;

    const count = Math.min(layers.length, MAX_LAYERS);
    const B = u.uB!.value as number[];
    const C = u.uC!.value as THREE.Vector3[];
    const H = u.uHid!.value as number[];
    let cum = 0;
    for (let i = 0; i < count; i++) {
      const l = layers[i]!;
      cum += l.vol;
      B[i] = levelFor(this.shape, cum, c, s);
      C[i]!.copy(l.rgb);
      H[i] = l.hidden;
    }
    u.uCount!.value = count;
    if (this.qSprites.length) this.syncQuestionMarks();
  }

  dispose() {
    this.glassMat.dispose();
    this.liquidMat.dispose();
    this.liquidFringeMat.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.shadow.geometry.dispose();
  }
}
