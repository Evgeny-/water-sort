import * as THREE from "three";
import type { Kind } from "../engine/types";

/**
 * Vessel shapes are lathe profiles (radius as a function of height).
 * Liquid volume below an arbitrary tilted plane is integrated slice by slice
 * (each slice is a disk cut by a line — exact circular-segment area), which is
 * what lets the liquid surface stay horizontal while the bottle tilts.
 */

export type ShapeKind = Kind | "cup";

export interface Shape {
  kind: ShapeKind;
  cap: number;
  /** glass shell profile: outer surface bottom→lip, then inner surface lip→floor */
  glass: THREE.Vector2[];
  /** liquid mesh profile (inner cavity, slightly shrunk), floor centre → lip */
  cavity: THREE.Vector2[];
  /** sampled cavity radius for volume integration */
  sliceY: Float32Array;
  sliceR: Float32Array;
  sliceDy: number;
  /** inner floor height */
  yFloor: number;
  /** height of the liquid when the vessel is full (upright) */
  yFull: number;
  /** inner lip: where liquid spills */
  yLip: number;
  rLip: number;
  /** outer lip radius / height (where the stream leaves the glass) */
  rLipOuter: number;
  yTop: number;
  /** max outer radius */
  radius: number;
  neckR: number;
  /** cavity volume per game unit */
  unit: number;
  /** spill table: max retained volume (units) for tilt angle index (degrees) */
  spill: Float32Array;
  /** radius lookup for the shader (uniform steps from yFloor to yLip) */
  profile: Float32Array;
}

const PROFILE_SAMPLES = 24;

interface ProfileSpec {
  R: number;
  /** corner radius at the bottom */
  rc: number;
  /** top of the straight body */
  bodyTop: number;
  /** end of shoulder / start of neck */
  neckStart: number;
  neckR: number;
  /** top of the neck (start of lip) */
  lipStart: number;
  lipOut: number;
  yTop: number;
  wall: number;
  floor: number;
  /** straight-walled open cup */
  cup?: boolean;
  /** slight taper for cups: bottom radius factor */
  taper?: number;
}

/** Outer silhouette r(y) as a polyline, bottom centre → lip top. */
function outerPoints(s: ProfileSpec): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const Rb = s.cup ? s.R * (s.taper ?? 1) : s.R;
  pts.push(new THREE.Vector2(0, 0));
  // bottom corner
  const cornerSteps = 8;
  for (let i = 0; i <= cornerSteps; i++) {
    const a = -Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Rb - s.rc + Math.cos(a) * s.rc, s.rc + Math.sin(a) * s.rc));
  }
  if (s.cup) {
    // tapered straight wall up to the rim
    pts.push(new THREE.Vector2(s.R, s.yTop - 0.03));
    pts.push(new THREE.Vector2(s.R + 0.012, s.yTop));
    return pts;
  }
  pts.push(new THREE.Vector2(s.R, s.bodyTop));
  // shoulder: smooth S-curve with vertical tangents at both ends
  const shSteps = 14;
  for (let i = 1; i <= shSteps; i++) {
    const t = i / shSteps;
    const e = t * t * (3 - 2 * t);
    const y = s.bodyTop + (s.neckStart - s.bodyTop) * t;
    const r = s.R + (s.neckR - s.R) * e;
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(s.neckR, s.lipStart));
  // lip bead
  const lipSteps = 6;
  const lh = s.yTop - s.lipStart;
  for (let i = 1; i <= lipSteps; i++) {
    const a = (i / lipSteps) * Math.PI;
    pts.push(new THREE.Vector2(s.neckR + Math.sin(a) * s.lipOut, s.lipStart + (1 - Math.cos(a)) * 0.5 * lh));
  }
  return pts;
}

/** Inner radius at height y (polyline interpolation of an r(y) list sorted by y). */
function sampleR(pts: THREE.Vector2[], y: number): number {
  if (y <= pts[0]!.y) return pts[0]!.x;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (y <= b.y) {
      const t = b.y === a.y ? 1 : (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return pts[pts.length - 1]!.x;
}

function innerRofY(s: ProfileSpec): (y: number) => number {
  // inner surface = outer inset by wall thickness (horizontally), floor raised
  const outer = outerPoints(s).filter((p) => p.y > 0.0001);
  return (y: number) => {
    // the lip bead is solid glass: the opening keeps the neck's inner radius
    if (!s.cup && y >= s.lipStart) return s.neckR - s.wall;
    const inset = sampleR(outer, y) - s.wall;
    // rounded inner floor corner
    const yc = s.floor + s.rc * 0.8;
    if (y < yc) {
      const rb = (s.cup ? s.R * (s.taper ?? 1) : s.R) - s.wall;
      const dy = yc - y;
      const rr = s.rc * 0.8;
      return Math.max(0, rb - rr + Math.sqrt(Math.max(0, rr * rr - dy * dy)));
    }
    return Math.max(0.01, inset);
  };
}

export function buildShape(kind: ShapeKind, cap: number): Shape {
  let s: ProfileSpec;
  let yFullFrac: number; // fraction of straight body filled at capacity
  switch (kind) {
    case "flask":
      s = { R: 0.5, rc: 0.12, bodyTop: 0.98, neckStart: 1.3, neckR: 0.2, lipStart: 1.56, lipOut: 0.035, yTop: 1.66, wall: 0.03, floor: 0.07 };
      yFullFrac = 0.93;
      break;
    case "jar":
      s = { R: 0.98, rc: 0.2, bodyTop: 1.9, neckStart: 2.12, neckR: 0.72, lipStart: 2.26, lipOut: 0.05, yTop: 2.38, wall: 0.035, floor: 0.08 };
      yFullFrac = 0.95;
      break;
    case "cup":
      s = { R: 0.44, rc: 0.1, bodyTop: 0.95, neckStart: 0.95, neckR: 0.44, lipStart: 0.95, lipOut: 0, yTop: 1.0, wall: 0.025, floor: 0.06, cup: true, taper: 0.86 };
      yFullFrac = 0.92;
      break;
    default:
      s = { R: 0.5, rc: 0.12, bodyTop: 2.0, neckStart: 2.32, neckR: 0.2, lipStart: 2.6, lipOut: 0.035, yTop: 2.7, wall: 0.03, floor: 0.07 };
      yFullFrac = 0.965;
  }

  const outer = outerPoints(s);
  const rIn = innerRofY(s);
  const yLip = s.yTop - 0.02;
  const yFloor = s.floor;

  // glass shell: outer up, over the lip, inner down
  const glass: THREE.Vector2[] = outer.map((p) => p.clone());
  const innerDown: THREE.Vector2[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const y = yLip - (yLip - yFloor) * (i / steps);
    innerDown.push(new THREE.Vector2(rIn(y), y));
  }
  glass.push(new THREE.Vector2(rIn(yLip) + 0.004, s.yTop));
  glass.push(...innerDown);
  glass.push(new THREE.Vector2(0, yFloor));

  // liquid cavity (shrunk a hair to avoid z-fighting with the glass)
  const cavity: THREE.Vector2[] = [new THREE.Vector2(0, yFloor + 0.004)];
  for (let i = steps; i >= 0; i--) {
    const y = yLip - (yLip - yFloor) * (i / steps);
    cavity.push(new THREE.Vector2(Math.max(0.005, rIn(y) - 0.006), Math.max(y, yFloor + 0.004)));
  }

  // slices for volume integration
  const N = 110;
  const sliceY = new Float32Array(N);
  const sliceR = new Float32Array(N);
  const dy = (yLip - yFloor) / N;
  for (let i = 0; i < N; i++) {
    const y = yFloor + (i + 0.5) * dy;
    sliceY[i] = y;
    sliceR[i] = Math.max(0, rIn(y) - 0.006);
  }

  const profile = new Float32Array(PROFILE_SAMPLES);
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    profile[i] = Math.max(0, rIn(yFloor + ((yLip - yFloor) * i) / (PROFILE_SAMPLES - 1)) - 0.006);
  }

  const bodyTopInner = kind === "cup" ? yLip : s.bodyTop;
  const yFull = yFloor + (bodyTopInner - yFloor) * yFullFrac;

  const shape: Shape = {
    kind,
    cap,
    glass,
    cavity,
    sliceY,
    sliceR,
    sliceDy: dy,
    yFloor,
    yFull,
    yLip,
    rLip: rIn(yLip),
    rLipOuter: s.neckR + s.lipOut,
    yTop: s.yTop,
    radius: s.R + (s.lipOut > 0 && s.neckR + s.lipOut > s.R ? s.lipOut : 0),
    neckR: s.neckR,
    unit: 1,
    spill: new Float32Array(181),
    profile,
  };
  const fullVol = volumeBelow(shape, yFull, 1, 0);
  shape.unit = fullVol / cap;
  for (let deg = 0; deg <= 180; deg++) {
    const phi = (deg * Math.PI) / 180;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const dLip = shape.yLip * c - shape.rLip * sn;
    shape.spill[deg] = volumeBelow(shape, dLip, c, sn) / shape.unit;
  }
  return shape;
}

/** Area of the disk of radius r with x < x0. */
function segArea(r: number, x0: number): number {
  if (x0 >= r) return Math.PI * r * r;
  if (x0 <= -r) return 0;
  const q = x0 / r;
  return Math.PI * r * r - (r * r * Math.acos(q) - x0 * Math.sqrt(r * r - x0 * x0));
}

/**
 * Cavity volume below the plane {p : n·p < d}, where n makes angle φ with the
 * vessel axis (cos/sin given). Local coordinates, origin at the bottom centre.
 */
export function volumeBelow(shape: Shape, d: number, c: number, s: number): number {
  const { sliceY, sliceR, sliceDy } = shape;
  const h = sliceDy / 2;
  let v = 0;
  const as = Math.abs(s);
  if (as < 1e-3) {
    // (almost) upright: exact fractional slices
    const cut = d / (Math.abs(c) < 1e-6 ? 1e-6 : c);
    for (let i = 0; i < sliceY.length; i++) {
      const y0 = sliceY[i]! - h;
      const f = c > 0 ? (cut - y0) / sliceDy : (y0 + sliceDy - cut) / sliceDy;
      if (f <= 0) continue;
      const r = sliceR[i]!;
      v += Math.PI * r * r * (f >= 1 ? 1 : f);
    }
    return v * sliceDy;
  }
  // tilted: circular-segment area, Simpson rule across each slice
  for (let i = 0; i < sliceY.length; i++) {
    const r = sliceR[i]!;
    if (r <= 0) continue;
    const y = sliceY[i]!;
    const a0 = segArea(r, (d - (y - h) * c) / as);
    const a1 = segArea(r, (d - y * c) / as);
    const a2 = segArea(r, (d - (y + h) * c) / as);
    v += (a0 + 4 * a1 + a2) / 6;
  }
  return v * sliceDy;
}

/** Plane offset d such that the volume below equals `vol` (units). */
export function levelFor(shape: Shape, vol: number, c: number, s: number): number {
  const as = Math.abs(s);
  let lo = Infinity;
  let hi = -Infinity;
  const { sliceY, sliceR } = shape;
  for (let i = 0; i < sliceY.length; i++) {
    const a = sliceY[i]! * c;
    const b = sliceR[i]! * as;
    lo = Math.min(lo, a - b);
    hi = Math.max(hi, a + b);
  }
  lo -= shape.sliceDy;
  hi += shape.sliceDy;
  const target = vol * shape.unit;
  if (target <= 0) return lo;
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) * 0.5;
    if (volumeBelow(shape, mid, c, s) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** Tilt (radians) at which a vessel holding `vol` units starts to spill. */
export function spillAngle(shape: Shape, vol: number): number {
  const t = shape.spill;
  if (vol >= t[0]!) return 0;
  for (let deg = 1; deg <= 180; deg++) {
    if (t[deg]! <= vol) {
      const a = t[deg - 1]!;
      const b = t[deg]!;
      const f = a === b ? 0 : (a - vol) / (a - b);
      return ((deg - 1 + f) * Math.PI) / 180;
    }
  }
  return Math.PI;
}

const geoCache = new Map<string, { glass: THREE.BufferGeometry; liquid: THREE.BufferGeometry }>();

export function geometriesFor(shape: Shape, segments: number) {
  const key = shape.kind + shape.cap + ":" + segments;
  let g = geoCache.get(key);
  if (!g) {
    const glass = new THREE.LatheGeometry(shape.glass, segments);
    const liquid = new THREE.LatheGeometry(shape.cavity, segments);
    g = { glass, liquid };
    geoCache.set(key, g);
  }
  return g;
}

const shapeCache = new Map<string, Shape>();
export function shapeFor(kind: ShapeKind, cap: number): Shape {
  const key = kind + cap;
  let s = shapeCache.get(key);
  if (!s) {
    s = buildShape(kind, cap);
    shapeCache.set(key, s);
  }
  return s;
}
