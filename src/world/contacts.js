// The forms each résumé section takes in the water. Every one exposes the same
// userData contract ({ mat with uFlare/uHover, sprite, update(t, dt) }) so main.js can treat them alike.
//   Experience → crystals grown out of the ice
//   Projects   → instrument probes tethered to the berg
//   Education  → an ice-core sample drilled from the berg's glowing base stratum
// Their light also leaks into the berg itself via the uCPos/uCCol/uCPow uniforms.
import * as THREE from 'three';
import { COMMON_CHUNK, FLAT_NORMAL_CHUNK } from './glsl.js';
import { mulberry32 } from './noise.js';

const PASS_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/** Self-lit parts (ring lights, lamps, core layers), fogged like everything else. */
function glowMaterial(uniforms, color) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: new THREE.Color(color) }, uFlare: { value: 0 }, uHover: { value: 0 } },
    vertexShader: PASS_VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      uniform vec3 uColor;
      uniform float uFlare;
      uniform float uHover;
      varying vec3 vWorld;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float pulse = 0.8 + 0.2 * sin(uTime * 2.4);
        vec3 col = uColor * 1.5 * pulse * (1.0 + uFlare * 1.3 + uHover * 0.5);
        col = mix(col, uwWater(-V, cameraPosition.y), uwFog(length(cameraPosition - vWorld)) * 0.6 * uUnder);
        col *= mix(0.12, 1.0, uUnder);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Painted metal: dark, lit by the torch, rimmed with the probe's own colour. */
function hullMaterial(uniforms, color) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: new THREE.Color(color) } },
    vertexShader: PASS_VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      uniform vec3 uColor;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 3.0);
        vec3 at = absorb(-vWorld.y);
        vec3 col = vec3(0.1, 0.12, 0.14) * (0.25 + 0.75 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0)) * (0.2 + at);
        col *= uwAmbientColor(vWorld.y);
        col += torchLight(vWorld, n) * vec3(0.9, 0.95, 1.0) * 1.4;
        col += uColor * fres * 0.35;
        col += vec3(0.35, 0.95, 1.0) * pingRing(vWorld);
        col = mix(col, uwWater(-V, cameraPosition.y), uwFog(length(cameraPosition - vWorld)) * uUnder);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCrystal(uniforms, color, seed) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uColor: { value: new THREE.Color(color) },
      uFlare: { value: 0 },
      uHover: { value: 0 },
    },
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
      ${FLAT_NORMAL_CHUNK}
      uniform vec3 uColor;
      uniform float uFlare;
      uniform float uHover;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vec3 n = flatNormal(vWorld);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(n, V) < 0.0) n = -n;
        float fres = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 2.0);
        float facet = 0.55 + 0.45 * abs(dot(n, normalize(vec3(0.3, 1.0, 0.5))));
        float pulse = 0.85 + 0.15 * sin(uTime * 1.7 + vWorld.y);
        vec3 col = uColor * (0.6 * facet + fres * 1.1) * pulse * (1.0 + uFlare * 1.3 + uHover * 0.45);
        col += vec3(1.0) * pow(fres, 3.0) * 0.6;
        float dist = length(cameraPosition - vWorld);
        col = mix(col, uwWater(-V, cameraPosition.y), uwFog(dist) * 0.6 * uUnder);
        // Seen from the air, the crystals are only a faint glow deep in the water.
        col *= mix(exp(max(-vWorld.y, 0.0) * -0.3) * 0.35, 1.0, uUnder);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const len = 0.9 + rnd() * 1.6;
    const g = new THREE.OctahedronGeometry(0.28 + rnd() * 0.18, 0);
    g.scale(1, len, 1);
    g.translate(0, len * 0.35, 0);
    const m = new THREE.Mesh(g, mat);
    m.rotation.set((rnd() - 0.5) * 1.3, rnd() * Math.PI, (rnd() - 0.5) * 1.3);
    group.add(m);
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture(),
      color: new THREE.Color(color),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    }),
  );
  sprite.scale.setScalar(5);
  sprite.position.y = 0.6;
  group.add(sprite);
  group.userData = { mat, sprite };
  return group;
}

function halo(color, scale) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture(),
      color: new THREE.Color(color),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

/** Projects: an instrument probe, bobbing on its tether, ring light turning. */
export function buildProbe(uniforms, color, seed) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  const hull = hullMaterial(uniforms, color);
  const glow = glowMaterial(uniforms, color);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.25, 6, 20), hull);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.14, 32, 1, true), glow);
  band.position.y = 0.18;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.045, 8, 72), glow);
  ring.rotation.x = Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.022, 6, 72), glow);
  ring2.rotation.x = Math.PI / 2 + 0.35;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), hull);
  mast.position.y = 1.25;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glow);
  lamp.position.y = 1.62;
  // Three stabiliser fins.
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.36), hull);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.5, -0.7, Math.sin(a) * 0.5);
    fin.rotation.y = -a;
    group.add(fin);
  }
  const sprite = halo(color, 4.2);
  group.add(body, band, ring, ring2, mast, lamp, sprite);

  const phase = rnd() * Math.PI * 2;
  group.userData = {
    mat: glow,
    sprite,
    base: new THREE.Vector3(),
    update(t, dt) {
      group.position.y = this.base.y + Math.sin(t * 0.7 + phase) * 0.22;
      group.rotation.z = Math.sin(t * 0.5 + phase) * 0.05;
      ring.rotation.z += dt * 0.5;
      ring2.rotation.z -= dt * 0.3;
      lamp.scale.setScalar(Math.sin(t * 3 + phase) > 0.6 ? 1.4 : 0.8);
    },
  };
  return group;
}

/** The line from an ice screw in the berg to a probe. */
export function buildTether(uniforms, from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6, 1, true), hullMaterial(uniforms, '#445566'));
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const screw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 16), hullMaterial(uniforms, '#8899aa'));
  screw.position.copy(from);
  screw.quaternion.copy(mesh.quaternion);
  const g = new THREE.Group();
  g.add(mesh, screw);
  return g;
}

/** Education: an ice core drawn out of the base stratum, its layers glowing like years. */
export function buildCore(uniforms, color) {
  const group = new THREE.Group();
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: new THREE.Color(color) }, uFlare: { value: 0 }, uHover: { value: 0 } },
    vertexShader: PASS_VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      uniform vec3 uColor;
      uniform float uFlare;
      uniform float uHover;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 2.0);
        // Annual layers along the core: thin bright bands of uneven spacing.
        float y = vUv.y * 11.0;
        float l = fract(y + 0.35 * sin(floor(y) * 2.3));
        float layer = smoothstep(0.0, 0.08, l) * smoothstep(0.26, 0.12, l);
        vec3 ice = vec3(0.4, 0.66, 0.78) * (0.25 + 0.5 * fres);
        vec3 col = ice + uColor * layer * 1.4 * (1.0 + uFlare * 1.2 + uHover * 0.5);
        col += torchLight(vWorld, n) * 0.8;
        col = mix(col, uwWater(-V, cameraPosition.y), uwFog(length(cameraPosition - vWorld)) * 0.7 * uUnder);
        col *= mix(0.12, 1.0, uUnder);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 3.6, 28, 1, false), coreMat);
  core.position.y = 1.6;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 8, 48), glowMaterial(uniforms, color));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.1;
  const sprite = halo(color, 5);
  sprite.position.y = 2.2;
  group.add(core, collar, sprite);
  group.userData = { mat: coreMat, sprite, update() {} };
  return group;
}
