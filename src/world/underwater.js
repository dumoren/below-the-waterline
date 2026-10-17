// Everything below the surface that isn't ice: marine snow, light shafts, bubbles,
// and the seabed.
import * as THREE from 'three';
import { COMMON_CHUNK, WATER_CHUNK } from './glsl.js';
import { mulberry32, simplex3, fbm } from './noise.js';

export const SEABED_Y = -66;

// Match the actual terrain triangles, including dunes and the iceberg's scour trench.
export function seabedHeightSampler(geometry) {
  const { width, height, widthSegments: cols, heightSegments: rows } = geometry.parameters;
  const p = geometry.attributes.position;
  return (x, z) => {
    const gx = THREE.MathUtils.clamp((x / width + 0.5) * cols, 0, cols - 1e-7);
    const gz = THREE.MathUtils.clamp((z / height + 0.5) * rows, 0, rows - 1e-7);
    const col = Math.floor(gx), row = Math.floor(gz), u = gx - col, v = gz - row;
    const a = row * (cols + 1) + col, b = a + cols + 1, d = a + 1, c = b + 1;
    return u + v <= 1
      ? p.getY(a) * (1 - u - v) + p.getY(b) * v + p.getY(d) * u
      : p.getY(c) * (u + v - 1) + p.getY(b) * (1 - u) + p.getY(d) * (1 - v);
  };
}

export function buildSnow(uniforms, count) {
  const rnd = mulberry32(5);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < seed.length; i++) seed[i] = rnd();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uPixelRatio: uniforms.uPixelRatio },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${COMMON_CHUNK}
      uniform float uPixelRatio;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec3 box = vec3(46.0, 34.0, 46.0);
        vec3 p = position * box;
        float influence = waterWeatherInfluence(cameraPosition.y);
        float motion = uWaterMotion * influence;
        p.y -= uWaterTime * (0.25 + position.x * 0.3);
        p.x += sin(uWaterTime * 0.3 + position.z * 6.28) * (0.35 + motion * 2.5);
        p.z += cos(uWaterTime * 0.23 + position.x * 6.28) * (0.35 + motion * 1.8);
        p.xz += uCurrentOffset * mix(0.2, 1.0, influence);
        vec3 rel = mod(p - cameraPosition + box * 0.5, box) - box * 0.5;
        vec3 wp = cameraPosition + rel;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = length(rel);
        gl_PointSize = (1.2 + position.y * 1.6) * uPixelRatio * (14.0 / max(-mv.z, 1.0));
        float below = step(wp.y, -0.5);
        float density = 0.25 + uWaterParticles * influence * 0.65;
        float presence = 1.0 - smoothstep(density - 0.03, density + 0.03, position.z);
        vA = below * uUnder * presence * smoothstep(23.0, 6.0, d) * smoothstep(0.5, 2.0, d);
        // An invisible flake adds nothing to the additive blend; clip it before it rasterises.
        if (vA <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec3 tl = torchLight(wp, -normalize(rel + vec3(0.0, 1e-4, 0.0)));
        float ring = pingRing(wp);
        vC = vec3(0.35, 0.55, 0.6) * uwAmbientColor(wp.y) * 0.5 * absorb(-wp.y * 0.5) + tl * 1.4 + vec3(0.4, 1.0, 1.0) * ring * 1.6;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vC;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vC * vA * (1.0 - d * 2.0), 1.0);
      }
    `,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

export function buildShafts(uniforms, count = 16) {
  const rnd = mulberry32(9);
  const pos = [];
  const uv = [];
  const seed = [];
  const index = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 14 + rnd() * 30;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 1.5 + rnd() * 4;
    const len = 30 + rnd() * 30;
    const s = rnd();
    const base = i * 4;
    // Corners are expanded in the vertex shader into a camera-facing (around Y) strip.
    for (const [u, v] of [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ]) {
      pos.push(x, -v * len, z);
      uv.push(u, v);
      seed.push(w, s, len);
    }
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 3));
  g.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON_CHUNK}
      attribute vec3 aSeed;
      varying vec2 vUv;
      varying float vS;
      varying float vY;
      void main() {
        vec3 p = position;
        vec3 toCam = cameraPosition - p;
        vec3 side = normalize(vec3(-toCam.z, 0.0, toCam.x) + vec3(1e-4, 0.0, 0.0));
        // Shafts lean away from the sun and sway with the surface.
        p.xz -= underwaterLightDirection().xz * uv.y * aSeed.z * 0.5;
        p.x += sin(uWaterTime * 0.2 + aSeed.y * 9.0) * uv.y * (0.5 + uWaterMotion * 1.5);
        p += side * uv.x * aSeed.x * (1.0 + uv.y * 0.8) * (0.7 + uWaterTurbidity * 0.8);
        vUv = uv;
        vS = aSeed.y;
        vY = p.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      varying vec2 vUv;
      varying float vS;
      varying float vY;
      void main() {
        float across = clamp(1.0 - abs(vUv.x), 0.0, 1.0);
        across = pow(across, 1.6);
        float along = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.8) * smoothstep(0.0, 0.06, vUv.y);
        float flick = 0.55 + 0.45 * sin(uWaterTime * (0.5 + vS) + vS * 20.0) * sin(uWaterTime * 0.37 + vS * 7.0);
        float camFade = smoothstep(-58.0, -8.0, cameraPosition.y);
        float extinction = exp(min(vY, 0.0) * (0.02 + uWaterTurbidity * 0.035));
        vec3 col = vec3(0.45, 0.72, 0.85) * waterTintAt(vY) * across * along * flick * 0.15 * camFade * uUnder * uWaterShafts * extinction;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

export function buildSeabed(uniforms, { mobile }) {
  const noise = simplex3(21);
  const seg = mobile ? 120 : 200;
  const g = new THREE.PlaneGeometry(420, 420, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const dunes = Math.sin(x * 0.18 + fbm(noise, x * 0.02, 0, z * 0.02, 2) * 3) * 0.45;
    const h = fbm(noise, x * 0.012, 1.3, z * 0.012, 4) * 7 + dunes;
    // A scour trench where the berg once dragged.
    const trench = -2.2 * Math.exp(-((z * 0.9 + x * 0.3 - 4) ** 2) / 40);
    p.setY(i, SEABED_Y + h + trench);
  }
  g.computeVertexNormals();
  const heightAt = seabedHeightSampler(g);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      uniform vec3 uAnchorPos;
      uniform vec4 uFloorShade[3];
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vec3 wp = vWorld;
        vec3 n = normalize(vN);
        float grain = vnoise(wp.xz * 3.0) * 0.5 + vnoise(wp.xz * 11.0) * 0.5;
        vec3 sand = mix(vec3(0.16, 0.15, 0.13), vec3(0.24, 0.22, 0.18), grain);
        // Current-built sand waves: lit crests and shaded troughs, faded out with distance (no shimmer).
        float dist = length(cameraPosition - wp);
        float waveK = smoothstep(40.0, 8.0, dist);
        if (waveK > 0.0) {
          vec2 wd = normalize(vec2(0.8, 0.6));
          float ph = dot(wp.xz, wd) * 3.9 + vnoise(wp.xz * 0.25) * 5.0 + vnoise(wp.xz * 0.9) * 0.8;
          float wave = 0.5 + 0.5 * sin(ph);
          float lit = 0.5 + 0.5 * cos(ph);
          sand *= mix(1.0, 0.72 + 0.28 * wave + 0.22 * lit, waveK);
          n = normalize(n + vec3(wd.x, 0.0, wd.y) * cos(ph) * 0.35 * waveK);
        }
        vec3 col = (sand * (0.05 + 0.08 * n.y) * absorb(-wp.y * 0.5) + vec3(0.008, 0.022, 0.03) * max(n.y, 0.0)) * uwAmbientColor(wp.y) * 2.0;
        col += sand * torchLight(wp, n) * 1.1;
        col += vec3(0.35, 0.95, 1.0) * pingRing(wp) * 0.7;
        col += contactGlow(wp) * sand * 4.0;
        // The anchor clearing: a soft pool of light, with contact shadows under what sits in it.
        float ad = length(wp.xz - uAnchorPos.xz);
        float pool = exp(-ad * ad / 70.0);
        if (pool > 0.002) {
          float occ = 1.0;
          for (int i = 0; i < 3; i++) {
            float d = length(wp.xz - uFloorShade[i].xy) / uFloorShade[i].z;
            occ *= 1.0 - uFloorShade[i].w * exp(-d * d * 1.6);
          }
          col += sand * vec3(0.45, 0.75, 0.8) * pool * 0.32 * (0.7 + 0.3 * grain);
          col *= mix(1.0, occ, smoothstep(0.0, 0.15, pool));
        }
        col = mix(col, uwWater(normalize(wp - cameraPosition), cameraPosition.y), uwFog(dist) * uUnder + (1.0 - uUnder));
        // A faint silt layer over the far floor, so the floor's edge reads against open water.
        col += vec3(0.005, 0.016, 0.02) * smoothstep(12.0, 60.0, dist) * (1.0 - smoothstep(110.0, 200.0, dist)) * uUnder;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;

  // Scattered glacial erratics.
  const rnd = mulberry32(33);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat, 90);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 6 + Math.pow(rnd(), 0.7) * 60;
    const s = 0.3 + Math.pow(rnd(), 3) * 2.2;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    m4.compose(new THREE.Vector3(x, heightAt(x, z) - s * 0.3, z), q, new THREE.Vector3(s, s * 0.7, s));
    rocks.setMatrixAt(i, m4);
  }
  // Rocks need the per-instance transform in the shader.
  const rockMat = mat.clone();
  rockMat.uniforms = uniforms;
  rockMat.vertexShader = /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vN;
    void main() {
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;
  rocks.material = rockMat;
  rocks.frustumCulled = false;

  const group = new THREE.Group();
  group.userData.heightAt = heightAt;
  group.add(mesh, rocks, buildFloorGlow(uniforms, heightAt, mobile ? 180 : 300));
  return group;
}

/** Faint living specks on the floor: they show through the dark from far above it, before the seabed itself does. */
function buildFloorGlow(uniforms, heightAt, count) {
  const rnd = mulberry32(71);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, r = 8 + Math.pow(rnd(), 0.8) * 150;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.set([x, heightAt(x, z) + 0.12, z], i * 3);
    seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uUnder;
      uniform float uPixelRatio;
      attribute float aSeed;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        // Emissive, so it carries further through the water than reflected light does.
        float twinkle = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed * 0.9) + aSeed * 40.0);
        vA = uUnder * twinkle * exp(-d * 0.009) * smoothstep(1.0, 6.0, d);
        if (vA <= 0.003) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        gl_PointSize = (2.6 + aSeed * 2.4) * uPixelRatio * clamp(18.0 / d, 0.75, 1.6);
        vC = mix(vec3(0.25, 0.85, 0.8), vec3(0.45, 0.7, 1.0), aSeed);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vC * vA * 1.2 * pow(1.0 - d * 2.0, 1.5), 1.0);
      }
    `,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}

/** Bubbles that stream past the camera while diving or resurfacing. */
export function buildBubbles(uniforms, count) {
  const rnd = mulberry32(12);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < seed.length; i++) seed[i] = rnd();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uWaterTime;
      uniform float uWaterMotion;
      uniform vec2 uCurrentOffset;
      uniform float uUnder;
      uniform float uPixelRatio;
      uniform float uBubbles;
      uniform vec3 uCamFwd;
      varying float vA;
      void main() {
        vec3 box = vec3(14.0, 18.0, 14.0);
        vec3 p = position * box;
        float motion = uWaterMotion * exp(-max(-cameraPosition.y, 0.0) * 0.055);
        p.y += uWaterTime * (2.0 + position.x * 3.0);
        p.x += sin(uWaterTime * 3.0 + position.z * 30.0) * (0.15 + motion * 0.2);
        p.xz += uCurrentOffset * exp(-max(-cameraPosition.y, 0.0) * 0.055);
        vec3 centre = cameraPosition + uCamFwd * 7.0;
        vec3 rel = mod(p - centre + box * 0.5, box) - box * 0.5;
        vec3 wp = centre + rel;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + position.z * 5.0) * uPixelRatio * (10.0 / max(-mv.z, 1.0));
        float churn = uWaterMotion * exp(-max(-wp.y, 0.0) * 0.35) * 0.35;
        vA = max(uBubbles, churn) * uUnder * step(wp.y, -0.3) * smoothstep(9.0, 3.0, length(rel));
        if (vA <= 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // invisible: clip, skip the fill
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float ring = smoothstep(0.5, 0.38, d) * smoothstep(0.2, 0.42, d) + smoothstep(0.2, 0.0, length(c - vec2(-0.14, 0.14))) * 0.8;
        gl_FragColor = vec4(vec3(0.6, 0.9, 1.0) * ring * vA * 0.6, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}
