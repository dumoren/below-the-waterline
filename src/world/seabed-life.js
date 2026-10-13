import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON_CHUNK } from './glsl.js';
import { mulberry32 } from './noise.js';

function merged(parts) {
  const plain = parts.map((g) => { const p = g.index ? g.toNonIndexed() : g; p.deleteAttribute('uv'); return p; });
  const result = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((g) => g.dispose());
  return result;
}

function limb(from, to, width) {
  const delta = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(width * 0.45, width, delta.length(), 5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  g.translate(...from.clone().add(to).multiplyScalar(0.5).toArray());
  return g;
}

function ribbons(tall) {
  const positions = [], indices = [];
  for (let blade = 0; blade < (tall ? 5 : 7); blade++) {
    const a = blade * 2.39996;
    const height = tall ? 2.5 + blade * 0.23 : 0.8 + blade * 0.12;
    const start = positions.length / 3;
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      const width = (tall ? 0.15 : 0.065) * Math.sin(Math.PI * t) + 0.008;
      const bend = t * t * (tall ? 0.8 : 0.45);
      for (const side of [-1, 1]) positions.push(Math.cos(a) * bend + Math.sin(a) * side * width, height * t, Math.sin(a) * bend - Math.cos(a) * side * width);
      if (j < 10) { const k = start + j * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function coralGeometry(fan) {
  const parts = [];
  const origin = new THREE.Vector3(0, 0, 0);
  const fork = new THREE.Vector3(0, 0.8, 0);
  parts.push(limb(origin, fork, 0.08));
  for (let i = 0; i < 7; i++) {
    const a = fan ? (i / 6 - 0.5) * 2.1 : i * 2.39996;
    const end = fan
      ? new THREE.Vector3(Math.sin(a) * 1.3, 0.9 + Math.cos(a) * 1.1, Math.sin(i) * 0.08)
      : new THREE.Vector3(Math.cos(a) * 0.75, 1.1 + (i % 3) * 0.3, Math.sin(a) * 0.75);
    parts.push(limb(fork, end, 0.045));
    for (const side of [-1, 1]) {
      const tip = end.clone().add(new THREE.Vector3(side * 0.23, 0.32 + (i % 2) * 0.1, fan ? 0 : side * 0.18));
      parts.push(limb(end, tip, 0.022));
      parts.push(limb(tip, tip.clone().add(new THREE.Vector3(side * 0.1, 0.2, 0)), 0.013));
    }
  }
  return merged(parts);
}

function anemoneGeometry() {
  const bell = new THREE.SphereGeometry(0.24, 8, 5);
  bell.scale(1, 0.8, 1);
  bell.translate(0, 0.15, 0);
  const parts = [bell];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18),
      new THREE.Vector3(Math.cos(a) * 0.38, 0.55, Math.sin(a) * 0.38),
      new THREE.Vector3(Math.cos(a + 0.1) * 0.43, 0.75, Math.sin(a + 0.1) * 0.43),
    ]);
    parts.push(new THREE.TubeGeometry(path, 6, 0.025, 3, false));
  }
  return merged(parts);
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.24 : 0.65;
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.045, 0);
  return g;
}

function crabGeometry() {
  const body = new THREE.SphereGeometry(0.34, 10, 6);
  body.scale(1.2, 0.55, 1);
  body.translate(0, 0.28, 0);
  const parts = [body];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -0.22 + i * 0.15;
      const knee = new THREE.Vector3(side * 0.61, 0.24, z + (i - 1.5) * 0.08);
      parts.push(limb(new THREE.Vector3(side * 0.2, 0.28, z), knee, 0.035));
      parts.push(limb(knee, new THREE.Vector3(side * 0.8, 0.035, z + (i - 1.5) * 0.18), 0.025));
    }
    const claw = new THREE.Vector3(side * 0.48, 0.28, 0.62);
    parts.push(limb(new THREE.Vector3(side * 0.22, 0.28, 0.18), claw, 0.065));
    for (const opening of [-1, 1]) parts.push(limb(claw, claw.clone().add(new THREE.Vector3(opening * 0.07, 0.02, 0.23)), 0.07));
  }
  return merged(parts);
}

function fishGeometry() {
  const body = new THREE.SphereGeometry(0.28, 8, 5);
  body.scale(2.2, 0.6, 0.45);
  const tail = new THREE.ConeGeometry(0.2, 0.3, 3);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.3);
  tail.translate(-0.67, 0, 0);
  const fin = new THREE.ConeGeometry(0.13, 0.28, 3);
  fin.scale(1, 1, 0.2);
  fin.translate(-0.03, 0.18, 0);
  return merged([body, tail, fin]);
}

// Tapered organic tubes give the focal reef rounded branches and soft tentacle tips.
function organicTube(points, radius, segments = 14, sides = 7) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const vertices = g.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, center = curve.getPointAt(t);
    const width = radius * (0.12 + 0.88 * Math.pow(1 - t, 0.65));
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      const v = new THREE.Vector3().fromBufferAttribute(vertices, k).sub(center).multiplyScalar(width).add(center);
      vertices.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function focalCoralGeometry() {
  const rnd = mulberry32(814), branches = [], polyps = [];
  function grow(start, direction, length, width, depth) {
    const end = start.clone().addScaledVector(direction, length);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.24, 0.1, (rnd() - 0.5) * 0.24));
    branches.push(organicTube([start, mid, end], width));
    // Small corallites along each branch, rather than a bare wire silhouette.
    for (let j = 1; j <= 5; j++) {
      const at = mid.clone().lerp(end, j / 6);
      const a = j * 2.4 + rnd();
      at.add(new THREE.Vector3(Math.cos(a) * width, 0, Math.sin(a) * width));
      const bud = new THREE.SphereGeometry(width * 0.42 + 0.012, 6, 4);
      bud.translate(...at.toArray()); polyps.push(bud);
    }
    if (depth) {
      for (let j = 0; j < 3; j++) {
        const a = j * Math.PI * 2 / 3 + rnd() * 0.7;
        const next = direction.clone().multiplyScalar(0.4).add(new THREE.Vector3(Math.cos(a) * 0.75, 0.65, Math.sin(a) * 0.75)).normalize();
        grow(end, next, length * (0.56 + rnd() * 0.15), width * 0.57, depth - 1);
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.4;
    grow(new THREE.Vector3(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26), new THREE.Vector3(Math.cos(a) * 0.25, 1, Math.sin(a) * 0.25).normalize(), 1.15 + i * 0.14, 0.16, 2);
  }
  return { branches: merged(branches), polyps: merged(polyps) };
}

function focalAnemoneGeometry(mobile) {
  const body = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.43, 0.02), new THREE.Vector2(0.38, 0.2),
    new THREE.Vector2(0.34, 0.56), new THREE.Vector2(0.58, 0.66), new THREE.Vector2(0.13, 0.67), new THREE.Vector2(0, 0.61),
  ], 28);
  const tents = [], tips = [];
  for (let ring = 0; ring < 3; ring++) {
    const count = (mobile ? 12 : 20) + ring * 4;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2 + ring * 0.23;
      const radius = 0.24 + ring * 0.15, reach = 0.48 + ring * 0.2;
      const h = 1.05 + Math.sin(i * 2.3) * 0.13 - ring * 0.05;
      const end = new THREE.Vector3(Math.cos(a + 0.12) * reach, h, Math.sin(a + 0.12) * reach);
      tents.push(organicTube([
        new THREE.Vector3(Math.cos(a) * radius, 0.64, Math.sin(a) * radius),
        new THREE.Vector3(Math.cos(a) * reach * 0.85, h + 0.05, Math.sin(a) * reach * 0.85), end,
      ], 0.045, 12, 6));
      const tip = new THREE.SphereGeometry(0.038, 6, 4); tip.translate(...end.toArray()); tips.push(tip);
    }
  }
  return { body, tents: merged(tents), tips: merged(tips) };
}

function reefFishGeometry() {
  const body = new THREE.SphereGeometry(0.28, 16, 10); body.scale(1.7, 0.95, 0.56);
  const tail = new THREE.ConeGeometry(0.24, 0.32, 3); tail.rotateZ(Math.PI / 2); tail.scale(1, 1, 0.22); tail.translate(-0.52, 0, 0);
  const dorsal = new THREE.SphereGeometry(0.2, 10, 6); dorsal.scale(1.5, 0.6, 0.12); dorsal.translate(-0.04, 0.25, 0);
  const parts = [body, tail, dorsal];
  for (const side of [-1, 1]) {
    const fin = new THREE.SphereGeometry(0.16, 8, 5); fin.scale(1, 0.22, 0.5); fin.rotateY(side * 0.5); fin.translate(0.02, -0.12, side * 0.19); parts.push(fin);
  }
  parts.forEach((g) => g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)));
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.04, 8, 6); eye.translate(0.3, 0.075, side * 0.13);
    eye.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(eye.attributes.position.count * 3).fill(0.04), 3)); parts.push(eye);
  }
  return merged(parts);
}

export function buildSeabedLife(U, { mobile, heightAt, anchorPosition, reduced = false }) {
  const group = new THREE.Group();
  group.name = 'Living seabed';
  const rnd = mulberry32(608);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const light = anchorPosition.clone().add(new THREE.Vector3(0, 3, 0));
  const motionTime = reduced ? { value: 0 } : U.uTime;

  // rough: weathered stone (grain, darker undersides). grad: height of a dark-base-to-pale-tip ramp.
  function material(color, sway = 0, animal = 0, { rough = 0, grad = 0 } = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { ...U, uLifeTime: motionTime, uBase: { value: new THREE.Color(color) }, uSway: { value: sway }, uAnimal: { value: animal }, uHabitatLight: { value: light }, uRough: { value: rough }, uGrad: { value: grad } },
      side: THREE.DoubleSide,
      vertexShader: `${COMMON_CHUNK}
        uniform float uLifeTime; uniform float uSway; uniform float uAnimal;
        attribute float aPhase; attribute vec3 color;
        varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vColor;
        void main() {
          vec3 p = position;
          p.x += sin(uLifeTime * 0.7 + aPhase + p.y * 0.6) * p.y * p.y * uSway;
          if (uAnimal > 0.5 && uAnimal < 1.5) p.y += sin(uLifeTime * 4.0 + aPhase + p.z * 9.0) * 0.045 * smoothstep(0.3, 0.7, abs(p.x));
          if (uAnimal > 1.5) p.z += sin(uLifeTime * 8.0 + aPhase) * 0.09 * (1.0 - smoothstep(-0.6, 0.0, p.x));
          mat4 m = modelMatrix * instanceMatrix;
          vWorld = (m * vec4(p, 1.0)).xyz;
          vN = normalize(mat3(m) * normal);
          vLocal = position; vColor = color;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: `${COMMON_CHUNK}
        uniform vec3 uBase; uniform vec3 uHabitatLight; uniform float uAnimal; uniform float uRough; uniform float uGrad;
        varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vColor;
        void main() {
          vec3 n = normalize(vN);
          float grain = vnoise(vWorld.xz * 12.0) * 0.12 + 0.88;
          float form = 1.0;
          if (uRough > 0.0) {
            // Pitted, weathered stone: two scales of grain, shadowed where it meets the sand.
            float pits = vnoise(vWorld.xz * 2.3) * 0.6 + vnoise(vWorld.xy * 5.1 + vWorld.z * 1.7) * 0.4;
            grain = mix(grain, 0.55 + 0.6 * pits, uRough);
            form = mix(1.0, mix(0.4, 1.0, smoothstep(-0.25, 0.42, vLocal.y)), uRough);
          }
          if (uGrad > 0.0) form *= mix(0.5, 1.05, smoothstep(0.0, uGrad, vLocal.y));
          float habitat = exp(-distance(vWorld, uHabitatLight) * 0.07);
          vec3 base = uBase * vColor;
          if (uAnimal > 2.5) {
            float band = 1.0 - smoothstep(0.035, 0.075, min(abs(vLocal.x - 0.18), abs(vLocal.x + 0.22)));
            base = mix(base, vec3(0.8, 0.82, 0.76) * vColor, band * 0.8);
          }
          vec3 col = base * grain * form * (0.22 + max(n.y, 0.0) * 0.3 + habitat * 0.5) * vec3(0.4, 0.7, 0.8);
          col += torchLight(vWorld, n) * base * 1.7 + contactGlow(vWorld) * base;
          col += vec3(0.25, 0.65, 0.72) * pingRing(vWorld) * 0.45;
          col = mix(col, uwWater(normalize(vWorld - cameraPosition), cameraPosition.y), uwFog(distance(cameraPosition, vWorld)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }

  // Irregular little beds around the entire iceberg, with open sand between them.
  const patches = Array.from({ length: mobile ? 65 : 110 }, (_, i) => {
    const a = i * 2.39996 + rnd() * 0.45, r = 24 + Math.pow(rnd(), 1.7) * 156;
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  }).filter((at) => at.distanceTo(new THREE.Vector2(anchorPosition.x, anchorPosition.z)) > 19);
  function positionAt(index) {
    let at;
    do {
      const patch = patches[index % patches.length], a = rnd() * Math.PI * 2, r = rnd() * 3.5;
      at = patch.clone().add(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    } while (at.distanceTo(new THREE.Vector2(anchorPosition.x, anchorPosition.z)) < 16);
    return at;
  }

  function scatter(geometry, count, size) {
    if (!geometry.hasAttribute('color')) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
    const phases = Float32Array.from({ length: count }, () => rnd() * Math.PI * 2);
    const matrices = [];
    for (let i = 0; i < count; i++) {
      const at = positionAt(i);
      const s = size * (0.65 + rnd() * 0.7);
      p.set(at.x, heightAt(at.x, at.y) - 0.025, at.y);
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      scale.set(s, s * (0.8 + rnd() * 0.4), s);
      matrices.push(new THREE.Matrix4().compose(p, q, scale));
    }
    return { phases, matrices };
  }

  function instances(name, geometry, count, mat, size) {
    const { phases, matrices } = scatter(geometry, count, size);
    const mesh = new THREE.InstancedMesh(geometry, mat, count);
    mesh.name = name;
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }

  // The scattered beds ring the whole floor, so one mesh per kind would always be drawn in
  // full. Split each kind into square tiles the camera can frustum-cull on its own.
  const TILE = 60;
  function tiledInstances(name, geometry, count, mat, size) {
    const { phases, matrices } = scatter(geometry, count, size);
    const tiles = new Map();
    matrices.forEach((m, i) => {
      const key = `${Math.floor(m.elements[12] / TILE)},${Math.floor(m.elements[14] / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(i);
    });
    const kind = new THREE.Group();
    kind.name = name;
    for (const ids of tiles.values()) {
      const g = new THREE.BufferGeometry();
      for (const k in geometry.attributes) g.setAttribute(k, geometry.attributes[k]);
      g.setIndex(geometry.index);
      g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(Float32Array.from(ids, (i) => phases[i]), 1));
      const mesh = new THREE.InstancedMesh(g, mat, ids.length);
      ids.forEach((i, j) => mesh.setMatrixAt(j, matrices[i]));
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 2; // headroom for the swaying in the vertex shader
      kind.add(mesh);
    }
    group.add(kind);
    return kind;
  }

  tiledInstances('Swaying seagrass', ribbons(false), mobile ? 550 : 1400, material('#687369', 0.11), 0.65);
  tiledInstances('Kelp fronds', ribbons(true), mobile ? 55 : 130, material('#777a61', 0.045), 0.65);
  tiledInstances('Branching ivory coral', coralGeometry(false), mobile ? 40 : 100, material('#c0bbaa', 0.007), 0.55);
  tiledInstances('Sea fans', coralGeometry(true), mobile ? 25 : 65, material('#9c929d', 0.025), 0.6);
  tiledInstances('Sea anemones', anemoneGeometry(), mobile ? 30 : 75, material('#aaa594', 0.09), 0.7);
  tiledInstances('Sea stars', starGeometry(), mobile ? 25 : 60, material('#a99a7c'), 0.65);

  // Two sculpted islands frame the anchor, leaving its silhouette and approach open.
  const focus = [new THREE.Vector2(anchorPosition.x - 3.8, anchorPosition.z - 2), new THREE.Vector2(anchorPosition.x + 5.5, anchorPosition.z + 1.5)];
  function placed(name, geometry, mat, placements) {
    const mesh = instances(name, geometry, placements.length, mat, 1);
    placements.forEach(({ at, size = 1, turn = 0, lift = 0 }, i) => {
      p.set(at.x, heightAt(at.x, at.y) + lift, at.y);
      q.setFromAxisAngle(up, turn); scale.setScalar(size); matrix.compose(p, q, scale); mesh.setMatrixAt(i, matrix);
    });
    // Static and compact, so these can be culled once the anchor is out of view.
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 1;
    mesh.frustumCulled = true;
    return mesh;
  }
  const rock = new THREE.SphereGeometry(1, 24, 16);
  const rp = rock.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const lump = 1 + Math.sin(x * 8 + z * 6) * Math.sin(y * 7) * 0.09;
    rp.setXYZ(i, x * lump * 1.35, y * lump * 0.5, z * lump * 0.95);
  }
  rock.computeVertexNormals();
  placed('Reef stone islands', rock, material('#5e5f57', 0, 0, { rough: 1 }), focus.flatMap((at) => [
    { at, lift: 0.25 },
    { at: at.clone().add(new THREE.Vector2(1.15, -0.55)), size: 0.6, lift: 0.08, turn: 0.7 },
    { at: at.clone().add(new THREE.Vector2(-0.75, 0.65)), size: 0.4, lift: 0.06, turn: 1.5 },
  ]));
  const coral = focalCoralGeometry();
  const coralPlaces = [{ at: focus[0], size: 1.05, turn: 0.45, lift: 0.65 }];
  placed('Anchor reef rounded coral', coral.branches, material('#b6a098', 0.002, 0, { grad: 2.4 }), coralPlaces);
  placed('Anchor reef coral polyps', coral.polyps, material('#ded3ba', 0.002, 0, { grad: 2.4 }), coralPlaces);
  const anemone = focalAnemoneGeometry(mobile);
  const anemonePlaces = [
    { at: focus[1].clone().add(new THREE.Vector2(-0.5, 0)), size: 1.3, lift: 0.65 },
    { at: focus[1].clone().add(new THREE.Vector2(0.75, -0.35)), size: 0.9, turn: 1.2, lift: 0.58 },
  ];
  placed('Anchor reef anemone columns', anemone.body, material('#8f8f76', 0, 0, { grad: 0.7 }), anemonePlaces);
  placed('Anchor reef anemone tentacles', anemone.tents, material('#aead8c', 0.10, 0, { grad: 1.3 }), anemonePlaces);
  placed('Anchor reef anemone pearl tips', anemone.tips, material('#d7ccb4', 0.10), anemonePlaces);
  placed('Anchor clearing sea stars', starGeometry(), material('#a99a7c'), [
    { at: focus[0].clone().add(new THREE.Vector2(2, 1.1)), size: 0.65, lift: 0.03 },
    { at: focus[1].clone().add(new THREE.Vector2(1.5, 1.2)), size: 0.45, turn: 1, lift: 0.03 },
  ]);
  // Three residents leave the tentacles, explore an arc, then return through their shelter.
  const residents = placed('Anemone resident fish', reefFishGeometry(), material('#b7a38c', 0, 3), Array.from({ length: 3 }, () => ({ at: focus[1] })));
  residents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  residents.frustumCulled = false; // they swim out of the placement bounds
  const fishPaths = [
    new THREE.Vector3(-0.5, 1.82, 0), new THREE.Vector3(-1.7, 1.9, 0.5), new THREE.Vector3(-2.2, 2.35, 0.1),
    new THREE.Vector3(-0.8, 2.6, -1.15), new THREE.Vector3(1, 2, -0.9), new THREE.Vector3(0.75, 1.5, -0.35),
    new THREE.Vector3(-0.1, 1.82, -0.1),
  ];
  const residentPath = new THREE.CatmullRomCurve3(fishPaths, true, 'centripetal');
  const tangent = new THREE.Vector3(), local = new THREE.Vector3();
  group.userData.focusCenters = focus;

  const movers = [];
  for (const [name, geometry, count, mat, size, fish] of [
    ['Scuttling crabs', crabGeometry(), mobile ? 14 : 30, material('#9f9582', 0, 1), 0.7, false],
    ['Bottom-dwelling fish', fishGeometry(), mobile ? 24 : 55, material('#9daeb0', 0, 2), 0.65, true],
  ]) {
    const mesh = instances(name, geometry, count, mat, size);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const seeds = Array.from({ length: count }, (_, i) => {
      const at = positionAt(i);
      return { x: at.x, z: at.y, phase: rnd() * Math.PI * 2, radius: fish ? 1.4 + rnd() * 2 : 0.4 + rnd() * 0.7, speed: fish ? 0.18 + rnd() * 0.13 : 0.08 + rnd() * 0.1, size: size * (0.65 + rnd() * 0.7) };
    });
    movers.push({ mesh, seeds, fish });
  }
  group.userData.update = (time) => {
    const t = reduced ? 0 : time;
    for (let i = 0; i < residents.count; i++) {
      const travel = (t * 0.055 + i / residents.count) % 1;
      residentPath.getPointAt(travel, local); residentPath.getTangentAt(travel, tangent);
      p.set(focus[1].x + local.x, heightAt(focus[1].x, focus[1].y) + local.y, focus[1].y + local.z);
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent.normalize());
      scale.setScalar(0.55 + i * 0.08); matrix.compose(p, q, scale); residents.setMatrixAt(i, matrix);
    }
    residents.instanceMatrix.needsUpdate = true;
    for (const { mesh, seeds, fish } of movers) {
      seeds.forEach((seed, i) => {
        const a = seed.phase + t * seed.speed;
        const x = seed.x + Math.cos(a) * seed.radius, z = seed.z + Math.sin(a) * seed.radius;
        const y = heightAt(x, z) + (fish ? 1.2 + Math.sin(a * 2) * 0.35 : 0.025);
        p.set(x, y, z);
        q.setFromAxisAngle(up, fish ? -a - Math.PI / 2 : -a);
        scale.setScalar(seed.size);
        matrix.compose(p, q, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  group.userData.update(0);
  return group;
}
