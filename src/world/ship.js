// Contact: the research vessel moored beside the berg. Built entirely in code: a lofted
// hull (flare, sheer, raked stem, bulwarks), a two-level deckhouse with a raked bridge,
// mast and radar, deck gear, lights, a rescue boat, and the running gear below the water.
// Static parts are merged per material, so all this detail costs only a few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COMMON_CHUNK, WATER_CHUNK, FLAT_NORMAL_CHUNK, waterHeight } from './glsl.js';

export const SHIP = { L: 15, B: 4.3 };
const { L, B } = SHIP;

// ───────────── Hull lines ─────────────
const U = (x) => (x + L / 2) / L; // 0 at the transom, 1 at the stem
export function deckY(x) {
  const u = U(x);
  return 1.45 + 0.95 * Math.pow(Math.max(0, u - 0.55) / 0.45, 2);
}
export function halfDeck(x) {
  const u = U(x);
  if (u < 0.06) return (B / 2) * (0.9 + u * 1.6);
  if (u > 0.58) return (B / 2) * Math.pow(Math.max(0, Math.cos(((u - 0.58) / 0.42) * (Math.PI / 2))), 0.5);
  return B / 2;
}
function halfWL(u) {
  let k = 1;
  if (u < 0.06) k = 0.82 + u * 2.4;
  else if (u > 0.5) k = Math.pow(Math.max(0, Math.cos(((u - 0.5) / 0.5) * (Math.PI / 2))), 0.95);
  return (B / 2) * 0.97 * k;
}
function keelY(u) {
  let k = -1.35;
  if (u > 0.8) k *= 1 - ((u - 0.8) / 0.2) * 0.85;
  if (u < 0.14) k *= 0.5 + (u / 0.14) * 0.5;
  return k;
}

/** Lofted from stations: deck edge, knuckle, waterline, bilge, keel; the stem rakes forward above the water. */
function hullGeometry() {
  // Eight points per station, deck edge to keel: sheer strake, topside, waterline, a round
  // bilge, then the keel. The stem rakes forward above the water.
  const S = 72;
  const st = [];
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    const x = -L / 2 + u * L;
    const t = Math.max(0, (u - 0.8) / 0.2);
    const hd = halfDeck(x);
    const d = deckY(x);
    const wl = halfWL(u);
    const kl = keelY(u);
    st.push([
      [x, d, hd],
      [x, d - 0.5, hd * 0.995],
      [x - 0.22 * t, 0.55, hd * 0.5 + wl * 0.5],
      [x - 0.45 * t, 0.12, wl],
      [x - 0.72 * t, -0.36, wl * 0.95],
      [x - 0.95 * t, -0.72, wl * 0.8],
      [x - 1.25 * t, (-0.72 + kl) * 0.5 - 0.06, wl * 0.48],
      [x - 1.5 * t, kl, 0],
    ]);
  }
  const P = st[0].length;
  const m = (p) => [p[0], p[1], -p[2]];

  // Sides: indexed, so the shell shades as one smooth curve.
  const side = (mirror) => {
    const pos = [];
    const idx = [];
    for (const ring of st) for (const p of ring) pos.push(...(mirror ? m(p) : p));
    for (let i = 0; i < S; i++)
      for (let k = 0; k < P - 1; k++) {
        const a = i * P + k, b = (i + 1) * P + k, c = (i + 1) * P + k + 1, d = i * P + k + 1;
        if (mirror) idx.push(a, d, c, a, c, b);
        else idx.push(a, b, c, a, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };

  // Deck and transom: their own vertices, so the deck edge and stern corners stay crisp.
  const flatPos = [];
  const quad = (a, b, c, d) => flatPos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < S; i++) quad(st[i][0], m(st[i][0]), m(st[i + 1][0]), st[i + 1][0]);
  const t0 = st[0];
  for (let k = 0; k < P - 1; k++) quad(t0[k], t0[k + 1], m(t0[k + 1]), m(t0[k]));
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.Float32BufferAttribute(flatPos, 3));
  flat.computeVertexNormals();

  return mergeGeometries([side(false), side(true), flat]);
}

/** Forecastle bulwarks: a low wall following the deck edge forward of amidships, meeting at the stem. */
function bulwarkGeometry() {
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const S = 20;
  const x0 = 0.3;
  const pts = [];
  for (let i = 0; i <= S; i++) {
    const x = x0 + (i / S) * (L / 2 - x0);
    pts.push([x, deckY(x), halfDeck(x) * 1.005]);
  }
  for (let i = 0; i < S; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const h = 0.55;
    quad(a, b, [b[0], b[1] + h, b[2] + 0.04], [a[0], a[1] + h, a[2] + 0.04]);
    quad([a[0], a[1], -a[2]], [a[0], a[1] + h, -a[2] - 0.04], [b[0], b[1] + h, -b[2] - 0.04], [b[0], b[1], -b[2]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ───────────── Materials ─────────────
const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/** Painted steel for blue hour above the water; a dark, fogged silhouette below it. */
function shipMaterial(uniforms, color, { emissive = 0, hull = false, windows = false, flat = false, spec = 0.35, double = false, paint = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: new THREE.Color(color) }, uEmissive: { value: emissive } },
    defines: { HULL: hull ? 1 : 0, WINDOWS: windows ? 1 : 0, FLAT: flat ? 1 : 0, PAINT: paint ? 1 : 0 },
    side: double ? THREE.DoubleSide : THREE.FrontSide,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      ${WATER_CHUNK}
      ${FLAT_NORMAL_CHUNK}
      uniform vec3 uColor;
      uniform float uEmissive;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;

      // A thin seam line every 'period' along s, antialiased and faded out with distance.
      float seam(float s, float period, float fade) {
        float f = abs(fract(s / period + 0.5) - 0.5) * period;
        float w = fwidth(s) * 1.2 + 0.004;
        return (1.0 - smoothstep(w, w * 2.0, f)) * fade;
      }

      void main() {
        vec3 wp = vWorld;
        #if FLAT
          vec3 n = flatNormal(wp);
        #else
          vec3 n = normalize(vN);
        #endif
        vec3 V = normalize(cameraPosition - wp);
        if (dot(n, V) < 0.0) n = -n;
        float dist = length(cameraPosition - wp);
        float depth = waterHeight(wp.xz, uTime) - wp.y;
        float near = smoothstep(45.0, 12.0, dist); // close-up detail only
        float wet = 0.0;

        vec3 base = uColor;
        #if HULL
          // Antifouling below the boot-top, a white boot-top band, grime run down from the deck.
          if (vLocal.y < 0.1) base = vec3(0.12, 0.04, 0.035);
          else if (vLocal.y < 0.32) base = vec3(0.8, 0.82, 0.83);
          float streak = vnoise(vec2(vLocal.x * 3.1, vLocal.y * 0.35 + 7.0)) * vnoise(vec2(vLocal.x * 9.0, 1.3));
          base *= 0.78 + 0.22 * (1.0 - streak);
          // Welded plating: horizontal strakes and vertical butts.
          base *= 1.0 - 0.28 * max(seam(vLocal.y, 0.46, near), seam(vLocal.x, 1.85, near));
          // Rust weeping down from the deck edge and the scuppers.
          float rust = smoothstep(0.62, 0.92, vnoise(vec2(vLocal.x * 5.5, vLocal.y * 0.22 + 3.0))) * smoothstep(0.35, 1.3, vLocal.y);
          base = mix(base, vec3(0.3, 0.13, 0.06), rust * 0.55);
          // Wet just above the waterline: darker and glossier where the swell washes it.
          wet = (1.0 - smoothstep(0.0, 0.4, -depth)) * step(depth, 0.0);
          base *= 1.0 - 0.38 * wet;
        #endif
        #if PAINT
          // Painted steel at sea: darker where walls meet the deck, panel seams, grime run-down.
          base *= mix(0.55, 1.0, smoothstep(1.45, 2.6, vLocal.y));
          float along = vLocal.x + vLocal.z;
          base *= 1.0 - 0.24 * max(seam(vLocal.y, 0.62, near), seam(along, 1.1, near));
          float grime = smoothstep(0.6, 0.9, vnoise(vec2(along * 4.2, vLocal.y * 0.5 + 11.0)));
          base = mix(base, base * vec3(0.66, 0.6, 0.54), grime * 0.75);
        #endif

        vec3 col;
        #if WINDOWS
          // Lit rooms: each pane its own warmth.
          float cell = hash12(floor(vLocal.xz * 2.4) + floor(vLocal.y * 3.0) * 7.0);
          col = uColor * uEmissive * (0.45 + 0.75 * cell);
        #else
          if (uEmissive > 0.0) {
            col = uColor * uEmissive;
          } else if (depth < 0.0) {
            float ndl = max(dot(n, uSunDir), 0.0);
            float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 sky = mix(vec3(0.045, 0.065, 0.11), vec3(0.25, 0.32, 0.44), hemi);
            col = base * (sky + vec3(1.0, 0.58, 0.36) * pow(ndl, 1.2) * 1.05);
            vec3 R = reflect(-V, n);
            float fres = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 4.0);
            col += skyColor(R) * (0.05 + fres * 0.35) * ${spec.toFixed(2)};
            col += vec3(1.0, 0.72, 0.48) * pow(max(dot(R, uSunDir), 0.0), 48.0) * 0.7 * ${spec.toFixed(2)};
            col += skyColor(R) * fres * 0.6 * wet; // wet steel mirrors the sky
          } else {
            col = base * 0.035 * absorb(depth) + torchLight(wp, n) * base * 0.9;
            col += vec3(0.35, 0.95, 1.0) * pingRing(wp) * 0.5;
          }
        #endif

        if (depth > 0.0) {
          if (uUnder > 0.5) col = mix(col, uwWater(-V, cameraPosition.y), uwFog(dist));
          else col = mix(col * vec3(0.3, 0.6, 0.6), vec3(0.005, 0.03, 0.045), 1.0 - exp(-depth * 0.35));
        } else if (uUnder < 0.5) {
          col = mix(col, skyColor(normalize(vec3(-V.x, 0.03, -V.z))), smoothstep(80.0, 360.0, dist) * 0.5);
        } else {
          col *= 0.25;
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nameTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (lines.length === 1) {
    g.font = '700 58px "Hanken Grotesk", Arial, sans-serif';
    g.fillText(lines[0], 256, 50);
  } else {
    g.font = '700 40px "Hanken Grotesk", Arial, sans-serif';
    g.fillText(lines[0], 256, 30);
    g.font = '600 26px "Hanken Grotesk", Arial, sans-serif';
    g.fillText(lines[1], 256, 72);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────── Kit: collect parts per material, merge once ─────────────
class Kit {
  constructor() {
    this.parts = new Map();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }
  add(key, geo, pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
    this.e.set(rot[0], rot[1], rot[2], 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(...pos), this.q, this.s.set(...scale));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(this.m);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return g;
  }
  box(key, size, pos, rot) {
    return this.add(key, new THREE.BoxGeometry(...size), pos, rot);
  }
  /** A box with radiused edges, like welded plate: the edges catch the light. */
  rbox(key, size, pos, rot, r = 0.07) {
    return this.add(key, new RoundedBoxGeometry(...size, 2, r), pos, rot);
  }
  cyl(key, rt, rb, h, pos, rot, seg = 12) {
    return this.add(key, new THREE.CylinderGeometry(rt, rb, h, seg), pos, rot);
  }
  /** A rod between two points. */
  rod(key, a, b, r = 0.035, seg = 6) {
    const A = new THREE.Vector3(...a);
    const Bv = new THREE.Vector3(...b);
    const dir = Bv.clone().sub(A);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(A.clone().addScaledVector(dir, len / 2), q, new THREE.Vector3(1, 1, 1));
    const ng = g.toNonIndexed();
    ng.applyMatrix4(m);
    ng.deleteAttribute('uv');
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(ng);
  }
  /** Stanchions and a top rail along a straight run. */
  rail(key, a, b, y0, h = 0.9, spacing = 0.55) {
    const A = new THREE.Vector3(a[0], y0, a[1]);
    const Bv = new THREE.Vector3(b[0], y0, b[1]);
    const n = Math.max(1, Math.round(A.distanceTo(Bv) / spacing));
    for (let i = 0; i <= n; i++) {
      const p = A.clone().lerp(Bv, i / n);
      this.rod(key, [p.x, p.y, p.z], [p.x, p.y + h, p.z], 0.025, 5);
    }
    this.rod(key, [A.x, y0 + h, A.z], [Bv.x, y0 + h, Bv.z], 0.03, 5);
    this.rod(key, [A.x, y0 + h * 0.5, A.z], [Bv.x, y0 + h * 0.5, Bv.z], 0.02, 5);
  }
  build(materials, parent) {
    for (const [key, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), materials[key]);
      parent.add(mesh);
    }
  }
}

// ───────────── The ship ─────────────
export function buildShip(uniforms) {
  const group = new THREE.Group();
  const M = {
    // Kept just under the bloom threshold, so the walls hold their detail instead of haloing.
    white: shipMaterial(uniforms, '#bcc3c8', { spec: 0.45, paint: true }),
    red: shipMaterial(uniforms, '#9e1c16', { spec: 0.4, paint: true }),
    deck: shipMaterial(uniforms, '#4a5753', { spec: 0.15 }),
    dark: shipMaterial(uniforms, '#2a2f35', { spec: 0.3 }),
    black: shipMaterial(uniforms, '#141618', { spec: 0.2 }),
    yellow: shipMaterial(uniforms, '#d69a1a', { spec: 0.35 }),
    orange: shipMaterial(uniforms, '#ff6a1a', { spec: 0.3 }),
    blue: shipMaterial(uniforms, '#2d5a86', { spec: 0.3 }),
    grey: shipMaterial(uniforms, '#8a9199', { spec: 0.5 }),
    windows: shipMaterial(uniforms, '#ffc778', { emissive: 1.25, windows: true }),
    lampWhite: shipMaterial(uniforms, '#fff4dc', { emissive: 5 }),
    lampRed: shipMaterial(uniforms, '#ff2a1a', { emissive: 5 }),
    lampGreen: shipMaterial(uniforms, '#2aff7a', { emissive: 5 }),
    glass: shipMaterial(uniforms, '#0d1720', { spec: 1.0 }),
  };
  const k = new Kit();

  // Hull, deck and bulwarks.
  const hullMat = shipMaterial(uniforms, '#9e1c16', { hull: true, double: true, spec: 0.4 });
  const hull = new THREE.Mesh(hullGeometry(), hullMat);
  group.add(hull);
  // Bulbous bow, under the stem (seen from below on the way up the chain).
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), hullMat);
  bulb.position.set(6.15, -0.6, 0);
  bulb.scale.set(1.0, 0.3, 0.32);
  group.add(bulb);
  const bulwark = new THREE.Mesh(bulwarkGeometry(), shipMaterial(uniforms, '#9e1c16', { double: true, spec: 0.3, paint: true }));
  group.add(bulwark);
  // Deck plating strips (slightly lifted over the hull's deck).
  for (let i = 0; i < 12; i++) {
    const x = -7.1 + i * 1.2;
    k.box('deck', [1.16, 0.02, halfDeck(x) * 1.9], [x, deckY(x) + 0.012, 0]);
  }

  // ── Superstructure ──
  const D0 = 1.45;
  k.rbox('white', [5.6, 1.45, 3.5], [-0.2, D0 + 0.725, 0]);
  k.rbox('white', [4.0, 1.15, 3.0], [-0.4, D0 + 1.45 + 0.575, 0]);
  // Bridge with a raked front.
  const bridge = new THREE.BoxGeometry(2.4, 1.1, 3.0);
  {
    const p = bridge.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getX(i) > 0) p.setX(i, p.getX(i) + (p.getY(i) + 0.55) * 0.28);
  }
  k.add('white', bridge, [1.1, 4.6, 0]);
  k.box('white', [3.0, 0.1, 3.5], [1.25, 5.2, 0]); // roof / sun visor
  // Bridge wings.
  k.box('white', [1.4, 0.1, 0.62], [1.5, 4.08, 1.8]);
  k.box('white', [1.4, 0.1, 0.62], [1.5, 4.08, -1.8]);
  k.rail('white', [0.8, 2.1], [2.2, 2.1], 4.13, 0.8, 0.45);
  k.rail('white', [0.8, -2.1], [2.2, -2.1], 4.13, 0.8, 0.45);
  // Bridge windows: raked front panes, side panes; mullions are the gaps.
  for (let i = 0; i < 5; i++) {
    const z = -1.2 + i * 0.6;
    k.box('windows', [0.04, 0.5, 0.52], [2.47, 4.66, z], [0, 0, -Math.atan(0.28)]);
  }
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) k.box('windows', [0.5, 0.42, 0.04], [0.3 + i * 0.62, 4.66, s * 1.52]);
    for (let i = 0; i < 5; i++) k.box('windows', [0.42, 0.34, 0.04], [-2.0 + i * 0.72, 3.55, s * 1.52]);
    // Portholes on the main deckhouse.
    for (let i = 0; i < 7; i++) {
      k.add('windows', new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14), [-2.6 + i * 0.72, 2.35, s * 1.76], [Math.PI / 2, 0, 0]);
    }
    // Life rings.
    k.add('orange', new THREE.TorusGeometry(0.26, 0.07, 8, 20), [2.05, 2.25, s * 1.8]);
  }
  for (let i = 0; i < 3; i++) k.box('windows', [0.04, 0.34, 0.5], [2.62, 2.35, -0.8 + i * 0.8]);
  for (let i = 0; i < 2; i++) k.box('windows', [0.04, 0.34, 0.5], [-2.42, 3.55, -0.5 + i * 1.0]);
  // Railings around the upper decks.
  k.rail('grey', [-3.0, 1.72], [2.55, 1.72], 2.9, 0.85);
  k.rail('grey', [-3.0, -1.72], [2.55, -1.72], 2.9, 0.85);
  k.rail('grey', [-3.0, -1.72], [-3.0, 1.72], 2.9, 0.85);
  k.rail('grey', [0.0, 1.62], [2.7, 1.62], 5.25, 0.7, 0.5);
  k.rail('grey', [0.0, -1.62], [2.7, -1.62], 5.25, 0.7, 0.5);
  // Aft deck railings following the deck edge.
  k.rail('grey', [-7.3, halfDeck(-7.3) - 0.08], [-3.0, halfDeck(-3.0) - 0.08], D0, 0.9);
  k.rail('grey', [-7.3, -(halfDeck(-7.3) - 0.08)], [-3.0, -(halfDeck(-3.0) - 0.08)], D0, 0.9);
  k.rail('grey', [-7.35, -1.6], [-7.35, 1.6], D0, 0.9);

  // Funnel, raked aft, with a black top.
  k.add('red', new THREE.CylinderGeometry(0.55, 0.72, 1.7, 16), [-1.8, 4.9, 0], [0, 0, 0.1], [1, 1, 0.7]);
  k.add('black', new THREE.CylinderGeometry(0.57, 0.57, 0.3, 16), [-1.89, 5.85, 0], [0, 0, 0.1], [1, 1, 0.7]);
  k.add('white', new THREE.CylinderGeometry(0.635, 0.66, 0.22, 16), [-1.84, 5.25, 0], [0, 0, 0.1], [1, 1, 0.7]); // company band
  for (const z of [-0.14, 0.14]) k.cyl('black', 0.07, 0.07, 0.5, [-1.95, 6.15, z], [0, 0, 0.1], 10); // exhausts

  // Mast: pole, yard, radar platform, lights, radome, antennas.
  k.cyl('grey', 0.06, 0.09, 4.2, [1.3, 7.35, 0], undefined, 8);
  k.box('grey', [0.08, 0.08, 2.4], [1.3, 7.9, 0]);
  k.box('grey', [0.9, 0.06, 0.9], [1.3, 6.5, 0]);
  k.cyl('dark', 0.1, 0.12, 0.2, [1.3, 6.62, 0]);
  k.box('lampWhite', [0.14, 0.14, 0.14], [1.3, 9.5, 0]);
  k.box('lampWhite', [0.12, 0.12, 0.12], [1.42, 8.4, 0]);
  k.cyl('white', 0.08, 0.08, 0.35, [0.2, 5.4, 0.9]);
  k.add('white', new THREE.SphereGeometry(0.34, 16, 10), [0.2, 5.75, 0.9]);
  for (const [x, z] of [
    [0.1, -1.3],
    [0.5, -1.35],
    [2.5, 1.35],
  ])
    k.rod('grey', [x, 5.25, z], [x, 6.8, z], 0.015, 4);
  // Stays from the masthead down to the roof.
  for (const [x, z] of [[-0.25, 1.45], [-0.25, -1.45], [2.55, 0]]) k.rod('grey', [1.3, 9.1, 0], [x, 5.25, z], 0.009, 4);
  // Searchlight on the roof.
  k.add('dark', new THREE.CylinderGeometry(0.13, 0.15, 0.24, 12), [2.4, 5.42, -0.95], [0, 0, Math.PI / 2]);
  k.add('lampWhite', new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), [2.53, 5.42, -0.95], [0, 0, Math.PI / 2]);
  // Navigation lights on the wings, stern light, and a floodlight on the mast facing aft.
  k.box('lampRed', [0.12, 0.14, 0.12], [2.05, 4.3, -2.08]);
  k.box('lampGreen', [0.12, 0.14, 0.12], [2.05, 4.3, 2.08]);
  k.box('lampWhite', [0.12, 0.12, 0.12], [-7.45, D0 + 0.95, 0]);
  k.box('lampWhite', [0.06, 0.12, 0.26], [1.18, 6.3, 0]);

  // ── Foredeck ──
  const wx = 5.0;
  const wy = deckY(wx);
  k.box('dark', [0.9, 0.35, 1.3], [wx, wy + 0.18, 0]);
  for (const s of [1, -1]) {
    k.add('dark', new THREE.CylinderGeometry(0.24, 0.24, 0.28, 14), [wx, wy + 0.5, s * 0.42], [Math.PI / 2, 0, 0]);
    k.add('grey', new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), [wx, wy + 0.5, s * 0.6], [Math.PI / 2, 0, 0]);
  }
  // Chain from the windlass to the hawse.
  k.rod('dark', [wx + 0.2, wy + 0.5, 0.42], [6.35, deckY(6.35) + 0.05, 0.8], 0.06, 6);
  // Bollards.
  for (const bx of [3.3, 5.9]) {
    const hz = halfDeck(bx) - 0.4;
    for (const s of [1, -1]) {
      k.cyl('dark', 0.1, 0.12, 0.3, [bx - 0.15, deckY(bx) + 0.15, s * hz]);
      k.cyl('dark', 0.1, 0.12, 0.3, [bx + 0.15, deckY(bx) + 0.15, s * hz]);
    }
  }
  // Bow flagstaff with its anchor light.
  k.rod('grey', [7.05, deckY(7.05), 0], [7.05, deckY(7.05) + 1.7, 0], 0.03, 5);
  k.box('lampWhite', [0.1, 0.1, 0.1], [7.05, deckY(7.05) + 1.75, 0]);
  // Foredeck crane: column and a boom stowed along the deck.
  k.cyl('yellow', 0.2, 0.24, 1.3, [3.1, deckY(3.1) + 0.65, -0.85]);
  k.rod('yellow', [3.1, deckY(3.1) + 1.2, -0.85], [5.6, deckY(5.6) + 0.95, -0.55], 0.09, 6);
  k.rod('grey', [5.6, deckY(5.6) + 0.95, -0.55], [5.6, deckY(5.6) + 0.35, -0.55], 0.012, 4);

  // ── Aft deck ──
  // A-frame for launching instruments, raked over the stern.
  for (const s of [1, -1]) k.rod('yellow', [-6.7, D0, s * 1.75], [-7.35, D0 + 3.4, s * 1.75], 0.13, 8);
  k.box('yellow', [0.3, 0.3, 3.8], [-7.35, D0 + 3.45, 0]);
  k.add('dark', new THREE.CylinderGeometry(0.26, 0.26, 0.16, 16), [-7.35, D0 + 3.0, 0], [Math.PI / 2, 0, 0]);
  // Winch drum and its wire up to the sheave.
  k.box('dark', [0.9, 0.3, 1.5], [-5.0, D0 + 0.15, 0]);
  k.add('dark', new THREE.CylinderGeometry(0.4, 0.4, 1.2, 18), [-5.0, D0 + 0.62, 0], [Math.PI / 2, 0, 0]);
  k.rod('orange', [-5.0, D0 + 1.02, 0], [-7.3, D0 + 3.25, 0], 0.025, 5);
  k.rod('orange', [-7.35, D0 + 2.75, 0], [-7.35, D0 + 1.2, 0], 0.02, 5);
  // A lab container, with a door and a lit window.
  k.rbox('blue', [2.3, 1.25, 1.35], [-3.95, D0 + 0.63, -1.05], undefined, 0.05);
  k.box('dark', [0.04, 0.95, 0.6], [-2.79, D0 + 0.5, -1.05]);
  k.box('windows', [0.5, 0.3, 0.04], [-4.3, D0 + 0.85, -0.37]);
  // Rescue boat on its cradle, and the davit that launches it.
  const rb = [-4.2, D0 + 0.7, 1.1];
  for (const s of [1, -1]) k.add('orange', new THREE.CapsuleGeometry(0.2, 1.9, 4, 10), [rb[0], rb[1], rb[2] + s * 0.38], [0, 0, Math.PI / 2]);
  k.box('dark', [2.1, 0.12, 0.62], [rb[0], rb[1] - 0.1, rb[2]]);
  k.box('dark', [0.3, 0.35, 0.3], [rb[0] - 0.4, rb[1] + 0.15, rb[2]]);
  k.box('dark', [1.6, 0.5, 0.12], [rb[0], rb[1] - 0.45, rb[2] - 0.35]);
  k.box('dark', [1.6, 0.5, 0.12], [rb[0], rb[1] - 0.45, rb[2] + 0.35]);
  k.rod('yellow', [-2.95, D0, 1.75], [-2.95, D0 + 2.4, 1.75], 0.09, 6);
  k.rod('yellow', [-2.95, D0 + 2.4, 1.75], [-4.1, D0 + 2.2, 1.2], 0.07, 6);
  k.rod('grey', [-4.1, D0 + 2.2, 1.2], [-4.1, D0 + 1.1, 1.15], 0.012, 4);
  // Life-raft canisters racked aft of the upper deckhouse.
  for (let i = 0; i < 3; i++) k.add('white', new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), [-2.72, 3.12, -1.1 + i * 0.55], [Math.PI / 2, 0, 0]);

  // Rubbing strake: a fender belt along each side just below the deck edge.
  for (const sgn of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const x = -7.35 + (i / 28) * 14.2;
      pts.push([x, deckY(x) - 0.6, sgn * (halfDeck(x) * 0.99 + 0.035)]);
    }
    for (let i = 0; i < pts.length - 1; i++) k.rod('dark', pts[i], pts[i + 1], 0.045, 6);
  }
  // Hawse pipes: where the anchor chains leave the bow.
  {
    const x = 6.35;
    const slope = Math.atan2(halfDeck(x + 0.3) - halfDeck(x - 0.3), 0.6);
    for (const sgn of [1, -1])
      k.add('dark', new THREE.TorusGeometry(0.15, 0.045, 6, 14), [x, deckY(x) - 0.35, sgn * (halfDeck(x) * 0.99 + 0.02)], [0, sgn > 0 ? -slope : slope, 0]);
  }

  // ── Below the water ──
  k.box('black', [0.12, 1.15, 0.9], [-7.3, -0.6, 0]);
  const prop = new THREE.Group();
  prop.position.set(-6.8, -0.72, 0);
  const propMat = M.dark;
  prop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.36, 12).rotateZ(Math.PI / 2), propMat));
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.26), propMat);
    blade.position.set(0, Math.cos((i * Math.PI) / 2) * 0.3, Math.sin((i * Math.PI) / 2) * 0.3);
    blade.rotation.x = (i * Math.PI) / 2;
    blade.rotation.y = 0.35;
    prop.add(blade);
  }
  group.add(prop);

  k.build(M, group);

  // Rotating radar scanner.
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 1.9), M.dark);
  radar.position.set(1.3, 6.78, 0);
  group.add(radar);

  // Names on the bows and the stern.
  const bowTex = nameTexture(['SIGNAL HILL']);
  const sternTex = nameTexture(['SIGNAL HILL', "ST. JOHN'S"]);
  const nameMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: '#b9bec4', depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  {
    const x = 4.3;
    const slope = Math.atan2(halfDeck(x + 0.3) - halfDeck(x - 0.3), 0.6);
    const sheer = Math.atan2(deckY(x + 1) - deckY(x - 1), 2); // follow the rising deck line
    for (const s of [1, -1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.43), nameMat(bowTex));
      plane.position.set(x, deckY(x) - 0.26, s * (halfDeck(x) + 0.015));
      plane.rotation.order = 'YXZ';
      plane.rotation.y = s > 0 ? -slope : Math.PI + slope;
      plane.rotation.z = s > 0 ? sheer : -sheer;
      group.add(plane);
    }
    const stern = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), nameMat(sternTex));
    stern.position.set(-L / 2 - 0.02, D0 - 0.3, 0);
    stern.rotation.y = -Math.PI / 2;
    group.add(stern);
  }

  // Glows: deck floodlight pools, window light on the water, and the exhaust haze.
  const dot = softDot();
  const sprite = (color, opacity, scale, pos) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    s.scale.set(...scale);
    s.position.set(...pos);
    group.add(s);
    return s;
  };
  const glows = [
    sprite('#ffb566', 0.22, [3.2, 2.0, 1], [-4.8, D0 + 0.7, 0]),
    sprite('#ffcf8a', 0.1, [1.2, 0.9, 1], [1.0, 6.3, 0]),
    sprite('#fff0d0', 0.35, [0.9, 0.9, 1], [1.3, 9.5, 0]),
    sprite('#ff3322', 0.55, [0.9, 0.9, 1], [2.05, 4.3, -2.1]),
    sprite('#33ff88', 0.55, [0.9, 0.9, 1], [2.05, 4.3, 2.1]),
  ];
  for (const s of [1, -1])
    for (const x of [-1.8, 0.0, 1.6]) glows.push(sprite('#ffb060', 0.08, [0.35, 2.0, 1], [x, 0.2, s * (B / 2 + 1.1)]));
  const smoke = [];
  for (let i = 0; i < 10; i++) {
    smoke.push(sprite('#9fb0c0', 0, [1, 1, 1], [-1.9, 6, 0]));
    smoke[i].material.blending = THREE.NormalBlending;
  }

  const bowLocal = new THREE.Vector3(6.35, deckY(6.35) - 0.35, 0.95);
  group.userData = {
    bowLocal,
    windows: M.windows,
    glow: glows[0],
    base: new THREE.Vector3(),
    heading: 0,
    /** Heave and roll with the swell; turn the radar; let the exhaust drift. */
    update(t) {
      const b = this.base;
      const h = waterHeight(b.x, b.z, t);
      const hx = waterHeight(b.x + 3, b.z, t) - waterHeight(b.x - 3, b.z, t);
      const hz = waterHeight(b.x, b.z + 1.5, t) - waterHeight(b.x, b.z - 1.5, t);
      group.position.set(b.x, b.y + h * 0.8, b.z);
      group.rotation.set(hz * 0.18, this.heading, -hx * 0.08, 'YXZ');
      radar.rotation.y = t * 1.6;
      prop.rotation.x = t * 0.4;
      for (let i = 0; i < smoke.length; i++) {
        const k2 = (t * 0.12 + i / smoke.length) % 1;
        const sp = smoke[i];
        sp.position.set(-1.95 - k2 * 2.6, 6.1 + k2 * 3.2, Math.sin(k2 * 5 + i) * 0.3);
        const sc = 0.6 + k2 * 2.4;
        sp.scale.set(sc, sc, 1);
        sp.material.opacity = 0.16 * Math.sin(Math.PI * k2) * (1 - k2 * 0.4);
      }
    },
  };
  return group;
}
