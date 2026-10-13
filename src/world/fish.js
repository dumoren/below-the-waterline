// A capelin school, and the Toolkit section: the tools that swim with you at every depth.
// Each fish is an instance whose motion is a pure function of time, its seed and the
// school centre (which drifts after the diver), so there's no per-fish simulation state.
// Fish bend away from the torch ray under the cursor.
import * as THREE from 'three';
import { COMMON_CHUNK } from './glsl.js';
import { mulberry32 } from './noise.js';

function fishGeometry(kind = 'capelin') {
  // Side-on silhouette along +x: nose, body, forked tail.
  const v = [
    0.5, 0, 0,  0.05, 0.075, 0,  -0.3, 0, 0,
    0.5, 0, 0,  -0.3, 0, 0,  0.05, -0.065, 0,
    -0.28, 0, 0,  -0.48, 0.08, 0,  -0.42, 0, 0,
    -0.28, 0, 0,  -0.42, 0, 0,  -0.48, -0.08, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  if (kind === 'herring') g.scale(1.25, 2.1, 1);
  if (kind === 'cod') g.scale(1.8, 3, 1);
  if (kind === 'skate') {
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0.7,0,0, -0.2,0.05,1, -0.45,0,0,
      0.7,0,0, -0.45,0,0, -0.2,0.05,-1,
      -0.4,0,0, -1.4,0,0.035, -1.4,0,-0.035,
    ], 3));
  } else if (kind !== 'capelin') {
    const body = [...g.attributes.position.array];
    body.push(0.12,0.1,0, -0.12,0.3,0, -0.25,0.1,0);
    g.setAttribute('position', new THREE.Float32BufferAttribute(body, 3));
  }
  return g;
}

export function buildFish(uniforms, count, { toolkit = true, kind = 'capelin', seed: randomSeed = 77 } = {}) {
  const geo = new THREE.InstancedBufferGeometry().copy(fishGeometry(kind));
  geo.instanceCount = count;
  const rnd = mulberry32(randomSeed);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = rnd();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));

  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uToolkit: { value: toolkit ? 1 : 0 }, uSpecies: { value: kind === 'skate' ? 3 : kind === 'cod' ? 2 : kind === 'herring' ? 1 : 0 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON_CHUNK}
      attribute vec4 aSeed;
      varying vec3 vCol;
      varying float vFog;

      uniform vec3 uSchoolC;   // the school's centre, which follows the diver (set from main.js)
      uniform float uFishGlow; // hover / discovery highlight: the school is the Toolkit
      uniform float uToolkit;
      uniform float uSpecies;
      vec3 centreAt(float t) {
        float group = floor(aSeed.x * 14.0);
        float angle = group * 2.39996 + sin(t * 0.055 + group) * 0.18;
        float r = 34.0 + mod(group * 7.0, 13.0);
        float y = -(7.0 + mod(group * 9.0 + uSpecies * 4.0, 49.0));
        return mix(vec3(cos(angle) * r, y, sin(angle) * r), uSchoolC, uToolkit);
      }
      vec3 fishAt(float t) {
        float phi = aSeed.x * TAU + t * (0.35 + aSeed.y * 0.25);
        float rr = mix(2.0 + aSeed.z * 6.0, 1.6 + aSeed.z * 2.8, uToolkit);
        vec3 local = vec3(cos(phi) * rr, (aSeed.w - 0.5) * 3.4 + sin(phi * 2.0 + aSeed.x * 10.0) * 0.5, sin(phi) * rr * 0.8);
        return centreAt(t) + local;
      }

      void main() {
        float t = uTime;
        vec3 p0 = fishAt(t);
        vec3 p1 = fishAt(t + 0.05);
        // Flee the torch beam.
        vec3 rel = p0 - cameraPosition;
        vec3 perp = rel - uTorchDir * dot(rel, uTorchDir);
        float dRay = length(perp);
        float flee = smoothstep(5.0, 0.0, dRay) * uTorch * step(0.0, dot(rel, uTorchDir)) * mix(1.0, 0.3, uToolkit);
        vec3 push = normalize(perp + vec3(0.0001)) * flee * 3.5;
        p0 += push;
        p1 += push;

        vec3 fwd = normalize(p1 - p0 + vec3(0.00001));
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 side = normalize(cross(fwd, up) + vec3(0.0, 0.0, 1e-4));
        up = cross(side, fwd);

        vec3 v = position;
        float tail = smoothstep(-0.1, -0.5, v.x);
        v.z += sin(t * (14.0 + flee * 20.0) + aSeed.x * 40.0) * 0.12 * tail;
        if (uSpecies > 2.5) v.y += sin(t * 2.2 + aSeed.y * 6.0) * abs(v.z) * 0.22;
        float scale = (0.55 + aSeed.z * 0.25) * (1.0 + uSpecies * 0.35);
        vec3 wp = p0 + (fwd * v.x + up * v.y + side * v.z) * scale;

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);

        // Silver flank flash when the side turns toward the light.
        float flash = pow(abs(dot(side, normalize(vec3(0.3, 1.0, 0.2)))), 4.0);
        float camFlash = pow(abs(dot(side, normalize(cameraPosition - wp))), 6.0);
        vec3 at = absorb(-wp.y);
        vec3 base = vec3(0.4, 0.58, 0.64) * at * (0.35 + flash * 1.4) + vec3(0.7, 0.9, 0.95) * camFlash * 0.6 * at + vec3(0.01, 0.03, 0.04);
        base += torchLight(wp, side) * (0.8 + camFlash * 2.0);
        base += vec3(0.4, 1.0, 1.0) * pingRing(wp);
        float shimmer = pow(max(0.0, sin(t * 2.6 - aSeed.x * TAU * 2.0)), 10.0);
        base *= mix(0.65, 1.0, uToolkit);
        base += vec3(0.65, 0.88, 1.0) * uToolkit * (0.12 + shimmer * 0.65 + uFishGlow * (0.12 + camFlash * 0.4));
        vCol = base;
        vFog = uwFog(length(cameraPosition - wp));
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      varying vec3 vCol;
      varying float vFog;
      void main() {
        vec3 col = mix(vCol, uwFogColor(cameraPosition.y) * 0.9, vFog);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = toolkit ? 'Toolkit: luminous silver school' : `${kind} school`;
  return mesh;
}
