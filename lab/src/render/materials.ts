import * as THREE from "three";

export const MAX_LAYERS = 8;
export const PROFILE_SAMPLES = 24;

/** Procedural studio environment: dark gradient + two softboxes + a top light. */
const ENV = /* glsl */ `
vec3 envColor(vec3 r) {
  float y = r.y;
  vec3 col = mix(vec3(0.03, 0.04, 0.08), vec3(0.20, 0.25, 0.36), smoothstep(-0.4, 0.9, y));
  float az = atan(r.x, r.z);
  // vertical softboxes span the horizon: a vertical cylinder reflects R.y ≈ -view.y
  float k1 = smoothstep(0.34, 0.1, abs(az + 1.22)) * smoothstep(-0.75, -0.45, y) * smoothstep(0.75, 0.45, y);
  float k2 = smoothstep(0.14, 0.04, abs(az - 1.38)) * smoothstep(-0.7, -0.4, y) * smoothstep(0.7, 0.4, y);
  float k3 = smoothstep(0.78, 0.97, y);
  col += vec3(1.0, 0.97, 0.92) * k1 * 2.4;
  col += vec3(0.65, 0.82, 1.0) * k2 * 1.8;
  col += vec3(0.95, 0.97, 1.0) * k3 * 1.4;
  return col;
}
`;

const NOISE = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const BASIC_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const LIQUID_FRAG = /* glsl */ `
uniform mat4 projectionMatrix;
uniform vec3 uN;
uniform vec3 uO;
uniform float uB[${MAX_LAYERS}];
uniform vec3 uC[${MAX_LAYERS}];
uniform float uHid[${MAX_LAYERS}];
uniform int uCount;
uniform float uTime;
uniform float uProf[${PROFILE_SAMPLES}];
uniform float uProfY0;
uniform float uProfY1;
uniform mat4 uInvModel;
uniform float uAgit;
uniform float uDim;
varying vec3 vWorld;
varying vec3 vNormalW;
${ENV}
${NOISE}
float profR(float y) {
  float t = clamp((y - uProfY0) / (uProfY1 - uProfY0), 0.0, 1.0) * float(${PROFILE_SAMPLES - 1});
  int i = int(floor(t));
  int j = min(i + 1, ${PROFILE_SAMPLES - 1});
  return mix(uProf[i], uProf[j], t - float(i));
}
vec3 layerColor(int i, vec3 wp) {
  vec3 c = uC[i];
  float h = uHid[i];
  if (h > 0.001) {
    vec3 lp = (uInvModel * vec4(wp, 1.0)).xyz;
    float n = vnoise(lp.xy * 7.0 + vec2(uTime * 0.35, -uTime * 0.22)) * 0.65
            + vnoise(vec2(atan(lp.x, lp.z) * 2.0, lp.y * 9.0) - uTime * 0.3) * 0.35;
    vec3 murk = mix(vec3(0.15, 0.17, 0.22), vec3(0.34, 0.37, 0.45), n);
    c = mix(c, murk, h);
  }
  return c;
}
void main() {
  if (uCount <= 0) discard;
  float d = dot(vWorld - uO, uN);
  float top = uB[uCount - 1];
  // screen-space width of one pixel in "height along the surface normal"
  float w = max(fwidth(d), 1e-4);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col;
  float a;
  if (gl_FrontFacing) {
    if (d > top + w) discard;
    // layers blend over ~1px at each boundary (no stair-stepping)
    vec3 base = layerColor(0, vWorld);
    float line = 0.0;
    for (int i = 0; i < ${MAX_LAYERS - 1}; i++) {
      if (i >= uCount - 1) break;
      float b = uB[i];
      base = mix(base, layerColor(i + 1, vWorld), smoothstep(b - w, b + w, d));
      line = max(line, 1.0 - smoothstep(0.0, 0.016 + w, abs(d - b)));
    }
    vec3 N = normalize(vNormalW);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
    float diff = clamp(dot(N, L), 0.0, 1.0);
    col = base * (0.66 + 0.40 * diff);
    col *= mix(0.58, 1.0, pow(ndv, 0.5));
    col += base * 0.20 * pow(ndv, 3.0);
    col = mix(col, col * 0.74, line * 0.7);
    float men = 1.0 - smoothstep(0.0, 0.04 + w, top - d);
    col += men * 0.2 * (0.6 + 0.4 * ndv);
    vec3 R = reflect(-V, N);
    col += envColor(R) * 0.045 * (1.0 - 0.4 * ndv);
    // coverage of the surface cut, ~1px wide
    a = clamp((top - d) / w + 0.5, 0.0, 1.0);
    gl_FragDepth = gl_FragCoord.z;
  } else {
    // back faces below the surface stand in for the surface itself (a flat cap):
    // its rim is where the plane meets the wall, found analytically -> soft edge
    vec3 rd = normalize(vWorld - cameraPosition);
    float denom = dot(rd, uN);
    if (denom > -0.0005) discard;
    float t = (top - dot(cameraPosition - uO, uN)) / denom;
    vec3 P = cameraPosition + rd * t;
    vec3 lp = (uInvModel * vec4(P, 1.0)).xyz;
    float rad = length(lp.xz);
    float rmax = profR(lp.y);
    float wr = max(fwidth(rad), 1e-4);
    a = clamp((rmax - rad) / wr + 0.5, 0.0, 1.0);
    if (a <= 0.004) discard;
    vec4 clip = projectionMatrix * viewMatrix * vec4(P, 1.0);
    gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = layerColor(uCount - 1, P);
    float rip = sin(rad * 34.0 - uTime * 10.0) * uAgit;
    vec3 N = normalize(uN + vec3(lp.x, 0.0, lp.z) * rip * 0.9);
    float fres = pow(1.0 - clamp(dot(N, -rd), 0.0, 1.0), 4.0);
    col = base * 1.1 + 0.035;
    float ring = smoothstep(rmax - 0.08, rmax - wr, rad);
    col = mix(col, base * 1.22 + 0.06, ring * 0.55);
    col += envColor(reflect(rd, N)) * (0.06 + 0.5 * fres);
  }
#ifdef FRINGE
  // second pass: only the partially covered 1px fringe, alpha-blended
  if (a >= 0.996 || a <= 0.004) discard;
  gl_FragColor = vec4(col * uDim, a);
#else
  // first pass: fully covered pixels, opaque, writes depth
  if (a < 0.996) discard;
  gl_FragColor = vec4(col * uDim, 1.0);
#endif
}
`;

const GLASS_FRAG = /* glsl */ `
uniform float uGlow;
uniform vec3 uGlowColor;
uniform float uAlpha;
uniform vec3 uTint;
uniform float uTintAmt;
varying vec3 vWorld;
varying vec3 vNormalW;
${ENV}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(N, V));
  float fres = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 col = envColor(R) * (0.07 + 1.0 * fres);
  float a = 0.045 + 0.55 * fres + 0.12 * clamp(dot(col, vec3(0.33)) - 0.3, 0.0, 1.0);
  float rim = smoothstep(0.38, 0.0, ndv);
  col += vec3(0.55, 0.66, 0.82) * rim * 0.22 + uTint * uTintAmt;
  a += rim * 0.16 + uTintAmt * 0.6;
  col += uGlowColor * uGlow * (0.18 + 0.9 * rim);
  a += uGlow * 0.12 * rim;
  a = clamp(a, 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(col * uAlpha, a);
}
`;

const STREAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
${ENV}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  vec3 col = uColor * mix(0.62, 1.12, pow(ndv, 0.6));
  float flow = sin(vUv.y * 55.0 + uTime * 38.0 + sin(vUv.x * 6.283) * 2.0) * 0.5 + 0.5;
  col += 0.07 * flow * ndv;
  col += envColor(reflect(-V, N)) * 0.09;
  gl_FragColor = vec4(col, 1.0);
}
`;

const BUBBLE_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BUBBLE_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float ring = pow(1.0 - ndv, 2.2);
  float spec = smoothstep(0.92, 1.0, dot(N, normalize(vec3(-0.5, 0.6, 0.6))));
  float a = 0.12 + 0.75 * ring + spec;
  gl_FragColor = vec4(vec3(1.0) * a, a * 0.9);
}
`;

/**
 * Liquid is drawn in two passes sharing uniforms: an opaque pass for fully
 * covered pixels and an alpha-blended pass for the 1px fringe of the surface
 * cut. Edges stay smooth without relying on MSAA (e.g. Firefox).
 */
export function makeLiquidMaterials(profile: Float32Array, y0: number, y1: number) {
  const solid = new THREE.ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: LIQUID_FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uN: { value: new THREE.Vector3(0, 1, 0) },
      uO: { value: new THREE.Vector3() },
      uB: { value: new Array(MAX_LAYERS).fill(0) },
      uC: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector3()) },
      uHid: { value: new Array(MAX_LAYERS).fill(0) },
      uCount: { value: 0 },
      uTime: { value: 0 },
      uProf: { value: Array.from(profile) },
      uProfY0: { value: y0 },
      uProfY1: { value: y1 },
      uInvModel: { value: new THREE.Matrix4() },
      uAgit: { value: 0 },
      uDim: { value: 1 },
    },
  });
  const fringe = new THREE.ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: LIQUID_FRAG,
    side: THREE.DoubleSide,
    defines: { FRINGE: "" },
    transparent: true,
    depthWrite: false,
    uniforms: solid.uniforms,
  });
  return { solid, fringe };
}

export function makeGlassMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: GLASS_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Vector3(0.45, 0.7, 1.0) },
      uAlpha: { value: 1 },
      uTint: { value: new THREE.Vector3(0.6, 0.75, 1.0) },
      uTintAmt: { value: 0.04 },
    },
  });
}

export function makeStreamMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: STREAM_FRAG,
    uniforms: { uColor: { value: new THREE.Vector3(1, 1, 1) }, uTime: { value: 0 } },
  });
}

export function makeBubbleMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
}

/** Soft radial blob for contact shadows. */
export function makeShadowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(0.45, "rgba(0,0,0,0.28)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** sRGB hex → raw vec3 (custom shaders work in display space). */
export function hexToVec3(hex: number, out = new THREE.Vector3()) {
  return out.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}
