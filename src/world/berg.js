// The iceberg: an icosphere remapped onto a hand-shaped profile (a leaning pinnacle
// above water, a lobed belly five times deeper below), then broken up with noise.
// Facets come from screen-space derivatives in the shader, so no normals are stored.
import * as THREE from 'three';
import { simplex3, fbm } from './noise.js';
import { COMMON_CHUNK, WATER_CHUNK, FLAT_NORMAL_CHUNK } from './glsl.js';

export const BERG = { H: 10.5, D: 62 };
const V0 = 0.55; // sphere latitude that maps to the waterline

export function profile(y) {
  if (y >= 0) {
    const s = Math.min(1, y / BERG.H);
    return 9 * Math.pow(Math.max(0, 1 - s), 0.72) * (1 + 0.1 * Math.sin(s * 6));
  }
  const t = Math.min(1, -y / BERG.D);
  return (9 + 7.5 * Math.sin(Math.PI * Math.pow(t, 0.75))) * Math.pow(Math.max(0, 1 - Math.pow(t, 4)), 0.5);
}

function lobes(th, y) {
  const above = y >= 0;
  const s = above ? Math.min(1, y / BERG.H) : 0;
  const t = above ? 0 : Math.min(1, -y / BERG.D);
  const k = Math.min(1, t * 4);
  const a1 = above ? 0.18 + 0.3 * s : 0.18 * (1 - t) + 0.04;
  const a2 = above ? 0.12 : 0.12 + 0.1 * k;
  const a3 = above ? 0.03 : 0.03 + 0.09 * k;
  const a4 = above ? 0.02 : 0.02 + 0.05 * k;
  const ph = above ? s * 2 : t * 2.5;
  return 1 + a1 * Math.sin(2 * th + 0.6) + a2 * Math.sin(3 * th - 0.4 + ph) + a3 * Math.sin(5 * th - 1.1 + t * 4) + a4 * Math.sin(7 * th + t * 7);
}

export function buildBergGeometry(detail = 5, seed = 11) {
  const noise = simplex3(seed);
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    const v = p.y;
    const th = Math.atan2(p.z, p.x);
    const Y = v >= V0 ? BERG.H * ((v - V0) / (1 - V0)) : -BERG.D * ((V0 - v) / (1 + V0));
    const notch = 1 - 0.06 * Math.exp(-(Y * Y) / 1.5);
    const R = profile(Y) * lobes(th, Y) * notch;
    const s = Math.max(0, Y / BERG.H);
    let x = Math.cos(th) * R + 1.9 * s * s;
    let z = Math.sin(th) * R - 0.9 * s;
    let y = Y;
    // Break it up: big lumps, then crisp chips. Scaled down near the thin tip.
    const amp = (1.5 + 0.08 * R) * Math.min(1, R / 3.5 + 0.25);
    const n1 = fbm(noise, x * 0.07, y * 0.05, z * 0.07, 4) * amp * 1.4;
    const n2 = noise(x * 0.26 + 7.1, y * 0.2, z * 0.26) * amp * 0.35;
    const h = Math.sqrt(Math.max(0, 1 - v * v));
    const dx = Math.cos(th) * h;
    const dy = v * 0.8;
    const dz = Math.sin(th) * h;
    x += dx * (n1 + n2);
    y += dy * (n1 + n2) * 0.6;
    z += dz * (n1 + n2);
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Every point where the mesh crosses the horizontal plane at height y, with face normals. */
export function slice(geo, y) {
  const pos = geo.attributes.position;
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tri = [a, b, c];
  const count = geo.index ? geo.index.count : pos.count;
  const idx = (k) => (geo.index ? geo.index.getX(k) : k);
  for (let f = 0; f < count; f += 3) {
    a.fromBufferAttribute(pos, idx(f));
    b.fromBufferAttribute(pos, idx(f + 1));
    c.fromBufferAttribute(pos, idx(f + 2));
    const lo = Math.min(a.y, b.y, c.y);
    const hi = Math.max(a.y, b.y, c.y);
    if (y < lo || y > hi) continue;
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    for (let k = 0; k < 3; k++) {
      const p = tri[k];
      const q = tri[(k + 1) % 3];
      if ((p.y - y) * (q.y - y) > 0 || p.y === q.y) continue;
      const t = (y - p.y) / (q.y - p.y);
      const x = p.x + (q.x - p.x) * t;
      const z = p.z + (q.z - p.z) * t;
      out.push({ x, y, z, th: Math.atan2(z, x), r: Math.hypot(x, z), n: n.clone() });
    }
  }
  return out;
}

/** Outermost surface point near angle th at height y. */
export function surfacePoint(geo, y, th) {
  const pts = slice(geo, y);
  let best = null;
  let bestScore = -Infinity;
  for (const p of pts) {
    const TAU = Math.PI * 2;
    let d = (((p.th - th) % TAU) + TAU) % TAU;
    if (d > Math.PI) d = TAU - d;
    if (d > 0.12) continue;
    const score = p.r - d * 20;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Waterline radius per angle, packed into a 1D texture for the foam. */
export function waterlineTexture(geo, bins = 256) {
  const data = new Float32Array(bins * 4);
  const r = new Float32Array(bins);
  for (const p of slice(geo, 0)) {
    const i = Math.floor(((p.th / (Math.PI * 2) + 0.5) * bins + bins) % bins);
    r[i] = Math.max(r[i], p.r);
  }
  // Fill gaps from neighbours.
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < bins; i++) if (!r[i]) r[i] = Math.max(r[(i + 1) % bins], r[(i + bins - 1) % bins]);
  for (let i = 0; i < bins; i++) data[i * 4] = r[i];
  const tex = new THREE.DataTexture(data, bins, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function bergMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      ${WATER_CHUNK}
      ${FLAT_NORMAL_CHUNK}
      uniform float uDistant;
      uniform float uStrataY;    // education: the berg's glowing foundation layer
      uniform vec3 uStrataCol;
      uniform float uStrataPow;
      varying vec3 vWorld;

      // Vertical melt streaks, projected onto whichever wall the facet faces (no atan seam).
      float streaks(vec3 p, vec3 n) {
        float a = vnoise(vec2(p.x * 1.1, p.y * 0.14));
        float b = vnoise(vec2(p.z * 1.1 + 17.0, p.y * 0.14));
        float wa = abs(n.z), wb = abs(n.x);
        return (a * wa + b * wb) / (wa + wb + 1e-3);
      }

      // The facet's own plane, so 2D patterns sit flat on each face.
      vec2 facePlane(vec3 p, vec3 n) {
        vec3 a = abs(n);
        return a.y > max(a.x, a.z) ? p.xz : (a.x > a.z ? p.zy : p.xy);
      }

      // Cellular noise: distance to the nearest scattered point (melt scallops).
      float cells(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float d = 8.0;
        for (int y = -1; y <= 1; y++)
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            float h = hash12(i + g);
            vec2 o = vec2(h, fract(h * 37.17)); // one hash per cell
            vec2 r = g + o - f;
            d = min(d, dot(r, r));
          }
        return sqrt(d);
      }

      void main() {
        vec3 wp = vWorld;
        vec3 n = flatNormal(wp);
        vec3 V = normalize(cameraPosition - wp);
        if (dot(n, V) < 0.0) n = -n;
        float dist = length(cameraPosition - wp);
        float fres = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 3.0);
        float depth = waterHeight(wp.xz, uTime) - wp.y;
        if (uDistant > 0.5 && depth > 0.0) discard;
        vec3 col;

        if (depth < 0.0) {
          // Above water: a low warm sun, cold sky fill, glacial blue in the shadows.
          float ndl = max(dot(n, uSunDir), 0.0);
          float facet = 0.82 + 0.26 * hash12(floor(n.xz * 23.0 + n.y * 11.0));
          vec3 sky = mix(vec3(0.1, 0.17, 0.28), vec3(0.42, 0.52, 0.66), pow(clamp(n.y * 0.5 + 0.5, 0.0, 1.0), 1.4));
          // Snow settles on the upward faces; steep walls show older, bluer compressed ice.
          float snow = smoothstep(0.15, 0.6, n.y + (vnoise(wp.xz * 0.7) - 0.5) * 0.35);
          float st = smoothstep(0.2, 0.8, streaks(wp, n));
          vec3 iceWall = mix(vec3(0.56, 0.78, 0.9), vec3(0.88, 0.94, 0.98), st);
          // Close-up detail fades out with distance, so far pixels (and the horizon bergs) skip it.
          float near = smoothstep(140.0, 50.0, dist);
          float bands = 0.0, crack = 0.0;
          if (near > 0.0) {
            // Tilted compression layers: the berg's history, banded in bluer ice.
            float h = dot(wp, vec3(0.28, 0.95, 0.12)) + vnoise(wp.xz * 0.3) * 0.7;
            bands = smoothstep(0.78, 0.96, sin(h * 2.4) * 0.5 + 0.5) * (1.0 - snow * 0.5) * near;
            // Fine cracks running down the walls.
            vec2 fp = facePlane(wp, n);
            float c = vnoise(vec2(fp.x * 0.75, fp.y * 0.09) + 3.7);
            crack = (1.0 - smoothstep(0.0, 0.035, abs(c - 0.5))) * (1.0 - snow * 0.8) * near;
          }
          vec3 albedo = mix(iceWall, vec3(0.95, 0.97, 1.0), snow);
          col = albedo * (sky * 0.8 * facet + vec3(1.0, 0.62, 0.42) * pow(ndl, 1.3) * 1.0);
          float shade = smoothstep(0.3, -0.5, dot(n, uSunDir));
          col = mix(col, vec3(0.04, 0.24, 0.42) * facet * 0.85, shade * 0.58);
          // Light leaking through the shaded ice: a cold cyan glow from inside.
          col += vec3(0.03, 0.2, 0.26) * shade * (1.0 - snow) * (0.6 + 0.4 * st);
          // Bands and cracks tint the lit result, so they read on the shaded (backlit) faces too.
          col = mix(col, col * vec3(0.5, 0.78, 1.0), bands * 0.75);
          col = mix(col, col * vec3(0.3, 0.6, 0.9), crack * 0.7);
          vec3 R = reflect(-V, n);
          col += vec3(1.0, 0.78, 0.58) * pow(max(dot(R, uSunDir), 0.0), 36.0) * 0.9;
          col += skyColor(R) * fres * 0.35;
          col += vec3(1.0, 0.6, 0.35) * pow(fres, 2.0) * pow(max(dot(-V, uSunDir), 0.0), 6.0) * 1.4;
          col *= 1.0 - 0.35 * exp(depth * 2.2);
          // Wave-cut band at the waterline: wet, turquoise ice lit from below.
          col = mix(col, vec3(0.1, 0.5, 0.55), exp(depth * 1.4) * 0.3);
          col = mix(col, skyColor(normalize(vec3(-V.x, 0.03, -V.z))), smoothstep(60.0, 320.0, dist) * (0.35 + 0.65 * uDistant));
        } else {
          // Below: sunlight filtered by depth, caustics, contacts glowing from inside.
          vec3 at = absorb(depth);
          float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
          float facet = 0.75 + 0.4 * hash12(floor(n.xz * 19.0 + n.y * 7.0));
          col = vec3(0.32, 0.7, 0.9) * at * (0.025 + 0.75 * pow(up, 2.2)) * facet;
          col *= 0.82 + 0.36 * streaks(wp, n);
          // Melt scallops: shallow dishes with bright rims, as on real submerged ice.
          float scNear = smoothstep(55.0, 12.0, dist);
          if (scNear > 0.0) {
            float d = cells(facePlane(wp, n) * 1.5);
            float dish = 0.86 + 0.14 * smoothstep(0.0, 0.6, d);
            float rim = smoothstep(0.55, 0.78, d);
            col *= mix(1.0, dish + 0.32 * rim, scNear * 0.85);
          }
          // The ice glows turquoise from within near the surface, fading with depth.
          col += vec3(0.02, 0.2, 0.22) * exp(-depth * 0.1) * (0.15 + 0.85 * fres);
          float c = caustic(wp.xz + wp.y * 0.35, uTime * 0.55);
          col += vec3(0.55, 0.92, 1.0) * c * at * (0.25 + 0.75 * max(n.y, 0.0)) * 1.3 * smoothstep(45.0, 0.0, depth);
          col += vec3(0.008, 0.028, 0.05) * (0.6 + fres);
          col += uwFogColor(wp.y) * fres * 0.5;
          col += contactGlow(wp);
          float sy = (wp.y - uStrataY) / 1.5;
          float band = exp(-sy * sy);
          float layers = 0.5 + 0.5 * sin(wp.y * 7.0 + vnoise(wp.xz * 0.5) * 5.0);
          col += uStrataCol * band * (0.35 + 0.65 * layers) * uStrataPow * (0.6 + 0.4 * facet);
          col += torchLight(wp, n) * vec3(0.7, 0.92, 1.0) * (0.8 + facet * 0.6);
          col += vec3(0.35, 0.95, 1.0) * pingRing(wp) * 1.6;
          if (uUnder > 0.5) {
            col = mix(col, uwWater(-V, cameraPosition.y), uwFog(dist));
          } else {
            // Seen from above through the surface: turquoise near the top, lost to the dark below.
            col = col * vec3(0.22, 0.62, 0.66) + vec3(0.012, 0.085, 0.095) * exp(-depth * 0.3);
            col = mix(col, vec3(0.005, 0.024, 0.036), 1.0 - exp(-depth * 0.2));
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
