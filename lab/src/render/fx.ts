import * as THREE from "three";
import { makeBubbleMaterial, makeStreamMaterial } from "./materials";

// ─── Canvas-drawn sprite textures ────────────────────────────────────────────

const texCache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

export function questionTexture() {
  return canvasTexture("q", 96, 96, (g) => {
    g.font = "800 72px system-ui, -apple-system, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.5)";
    g.shadowBlur = 8;
    g.fillStyle = "rgba(255,255,255,0.82)";
    g.fillText("?", 48, 52);
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Chains across the bottle + padlock in the key colour. */
export function lockTexture(colorCss: string) {
  return canvasTexture("lock" + colorCss, 256, 512, (g) => {
    // chains
    g.lineCap = "round";
    const chain = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.floor(len / 26);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        g.save();
        g.translate(x, y);
        g.rotate(Math.atan2(y2 - y1, x2 - x1) + (i % 2 ? Math.PI / 2 : 0));
        g.strokeStyle = "rgba(20,24,32,0.55)";
        g.lineWidth = 10;
        g.beginPath();
        g.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = i % 2 ? "#aeb6c4" : "#d9dee8";
        g.lineWidth = 6;
        g.stroke();
        g.restore();
      }
    };
    chain(10, 150, 246, 330);
    chain(246, 150, 10, 330);
    // padlock
    const cx = 128;
    const cy = 262;
    g.lineWidth = 16;
    g.strokeStyle = "#1c2230";
    g.beginPath();
    g.arc(cx, cy - 34, 32, Math.PI, 0);
    g.stroke();
    g.lineWidth = 10;
    g.strokeStyle = "#dfe4ee";
    g.stroke();
    g.shadowColor = "rgba(0,0,0,0.45)";
    g.shadowBlur = 14;
    roundRect(g, cx - 50, cy - 36, 100, 84, 16);
    g.fillStyle = colorCss;
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 5;
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.stroke();
    // keyhole
    g.fillStyle = "rgba(10,12,20,0.75)";
    g.beginPath();
    g.arc(cx, cy, 11, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 5, cy, 10, 26);
  });
}

/** Badge for the big jar: coloured drop (or rainbow drop with "?") and capacity. */
export function jarBadgeTexture(colorCss: string | null, cap: number) {
  return canvasTexture("jar" + colorCss + cap, 256, 256, (g) => {
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowBlur = 12;
    roundRect(g, 38, 58, 180, 140, 34);
    g.fillStyle = "rgba(245,246,250,0.92)";
    g.fill();
    g.shadowBlur = 0;
    // drop
    const dx = 96;
    const dy = 128;
    g.beginPath();
    g.moveTo(dx, dy - 44);
    g.bezierCurveTo(dx + 12, dy - 20, dx + 34, dy - 2, dx + 34, dy + 16);
    g.arc(dx, dy + 16, 34, 0, Math.PI);
    g.bezierCurveTo(dx - 34, dy - 2, dx - 12, dy - 20, dx, dy - 44);
    if (colorCss) {
      g.fillStyle = colorCss;
    } else {
      const grd = g.createLinearGradient(dx - 34, dy - 40, dx + 34, dy + 50);
      ["#e8384f", "#ffcc1c", "#27b44f", "#2d72f5", "#9147f0"].forEach((c, i) => grd.addColorStop(i / 4, c));
      g.fillStyle = grd;
    }
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.ellipse(dx - 12, dy + 8, 7, 12, 0.4, 0, Math.PI * 2);
    g.fill();
    g.font = "800 58px system-ui, -apple-system, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#1b2233";
    g.fillText(colorCss ? `×${cap}` : "?", 168, 132);
  });
}

// ─── Particles ────────────────────────────────────────────────────────────────

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number;
  rx: number; ry: number; spin: number;
  color: THREE.Color;
  /** bubbles: owner surface height (world y) they pop at */
  popY?: number;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly ps: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number, readonly gravity: number, readonly drag: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (!(mat instanceof THREE.ShaderMaterial)) {
      this.mesh.setColorAt(0, new THREE.Color());
    }
  }

  add(p: P) {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push(p);
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i]!;
      p.life += dt;
      if (p.life >= p.max || (p.popY !== undefined && p.y >= p.popY)) {
        this.ps.splice(i, 1);
        continue;
      }
    }
    for (const p of this.ps) {
      p.vy -= this.gravity * dt;
      const k = Math.exp(-this.drag * dt);
      p.vx *= k;
      p.vz *= k;
      if (this.gravity < 0) p.vx += Math.sin(p.life * 9 + p.spin * 10) * 0.25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
      const f = 1 - p.life / p.max;
      const sc = p.size * (this.gravity < 0 ? Math.min(1, p.life * 8) : Math.min(1, f * 1.6));
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      this.s.set(sc, sc, sc);
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      if (this.mesh.instanceColor) this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get alive() {
    return this.ps.length > 0;
  }
}

export class Particles {
  readonly drops: Pool;
  readonly confetti: Pool;
  readonly bubbles: Pool;
  readonly sparks: Pool;

  constructor(scene: THREE.Scene) {
    this.drops = new Pool(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160, 9, 0.5);
    const conf = new THREE.PlaneGeometry(1, 0.6);
    this.confetti = new Pool(conf, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 360, 3.2, 1.6);
    this.bubbles = new Pool(new THREE.SphereGeometry(1, 10, 8), makeBubbleMaterial(), 120, -1.2, 2.5);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new Pool(new THREE.OctahedronGeometry(1, 0), sparkMat, 200, 1.5, 2.2);
    for (const p of [this.drops, this.confetti, this.bubbles, this.sparks]) scene.add(p.mesh);
    this.bubbles.mesh.renderOrder = 2;
    this.sparks.mesh.renderOrder = 5;
  }

  splash(x: number, y: number, z: number, color: THREE.Color, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.1;
      this.drops.add({
        x: x + Math.cos(a) * 0.04, y, z: z + Math.sin(a) * 0.04,
        vx: Math.cos(a) * sp * 0.55, vy: 1.3 + Math.random() * 1.4, vz: Math.sin(a) * sp * 0.35,
        life: 0, max: 0.35 + Math.random() * 0.25, size: 0.018 + Math.random() * 0.02,
        rx: 0, ry: 0, spin: 0, color,
      });
    }
  }

  bubble(x: number, y: number, z: number, popY: number) {
    this.bubbles.add({
      x, y, z,
      vx: 0, vy: 0.25 + Math.random() * 0.35, vz: 0,
      life: 0, max: 3, size: 0.012 + Math.random() * 0.022,
      rx: 0, ry: 0, spin: Math.random(), color: new THREE.Color(1, 1, 1), popY,
    });
  }

  burst(x: number, y: number, z: number, colors: THREE.Color[], n: number, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = (1.2 + Math.random() * 2.2) * power;
      this.sparks.add({
        x, y, z,
        vx: Math.cos(a) * sp * (1 - up * 0.5), vy: sp * (0.4 + up), vz: Math.sin(a) * sp * 0.5,
        life: 0, max: 0.55 + Math.random() * 0.5, size: 0.035 + Math.random() * 0.045,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: 6 + Math.random() * 10,
        color: colors[i % colors.length]!,
      });
    }
  }

  confettiRain(cx: number, top: number, width: number, colors: THREE.Color[], n: number) {
    for (let i = 0; i < n; i++) {
      this.confetti.add({
        x: cx + (Math.random() - 0.5) * width, y: top + Math.random() * 2.5, z: 1.2 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 1.5, vy: -0.5 - Math.random() * 1.5, vz: 0,
        life: 0, max: 3 + Math.random() * 1.5, size: 0.09 + Math.random() * 0.07,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: 3 + Math.random() * 6,
        color: colors[i % colors.length]!,
      });
    }
  }

  update(dt: number) {
    this.drops.update(dt);
    this.confetti.update(dt);
    this.bubbles.update(dt);
    this.sparks.update(dt);
  }

  get alive() {
    return this.drops.alive || this.confetti.alive || this.bubbles.alive || this.sparks.alive;
  }

  clear() {
    for (const p of [this.drops, this.confetti, this.bubbles, this.sparks]) {
      p.ps.length = 0;
      p.update(0);
    }
  }
}

// ─── Pour stream ─────────────────────────────────────────────────────────────

export class Stream {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private up = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(1, 0.8, 1, 14, 1, true);
    geo.translate(0, 0.5, 0); // base at origin, extends +y
    this.mat = makeStreamMaterial();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Draw the stream as a tube from a (top) to b (bottom). */
  set(a: THREE.Vector3, b: THREE.Vector3, radius: number, rgb: THREE.Vector3) {
    this.dir.subVectors(a, b);
    const len = this.dir.length();
    if (len < 0.002 || radius <= 0.001) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.copy(b);
    this.mesh.quaternion.setFromUnitVectors(this.up, this.dir.divideScalar(len));
    this.mesh.scale.set(radius, len, radius);
    (this.mat.uniforms.uColor!.value as THREE.Vector3).copy(rgb);
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
