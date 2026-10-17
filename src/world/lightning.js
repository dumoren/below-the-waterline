import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Midpoint displacement keeps every bend joined; branches share an exact trunk vertex.
export function strikeChannels(seed) {
  const random = mulberry32(seed);
  function channel(start, end, spread, levels) {
    let points = [start, end];
    for (let level = 0; level < levels; level++) {
      const next = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        next.push([(a[0] + b[0]) / 2 + (random() - 0.5) * spread, (a[1] + b[1]) / 2], b);
      }
      points = next;
      spread *= 0.62;
    }
    return points;
  }
  const trunk = channel([0, 43 + random() * 8], [(random() - 0.5) * 12, 0.3], 12, 6);
  const channels = [{ points: trunk, energy: 1, width: 1 }];
  for (let i = 0; i < 5; i++) {
    const at = 10 + i * 8 + Math.floor(random() * 5);
    const start = trunk[at];
    const side = random() > 0.5 ? -1 : 1;
    const points = channel(start, [start[0] + side * (5 + random() * 10), Math.max(2, start[1] - 6 - random() * 14)], 5, 4);
    channels.push({ points, energy: 0.45 + random() * 0.25, width: 0.55 });
    if (i < 2) {
      const fork = points[7];
      channels.push({ points: channel(fork, [fork[0] + side * 5, Math.max(1, fork[1] - 6)], 2, 3), energy: 0.28, width: 0.3 });
    }
  }
  return channels;
}

export function buildLightning(uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float edge;
      attribute float energy;
      varying float vEdge;
      varying float vEnergy;
      void main() {
        vEdge = edge; vEnergy = energy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLightning;
      varying float vEdge;
      varying float vEnergy;
      void main() {
        // The exact same pulse lights the channel, clouds and water together.
        float stroke = clamp(uLightning / 0.32, 0.0, 1.0);
        float x = abs(vEdge);
        float aa = max(fwidth(vEdge), 0.01);
        float core = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, x);
        float corona = exp(-x * 5.0) * (1.0 - smoothstep(0.75, 1.0, x));
        vec3 light = vec3(0.88, 0.94, 1.0) * core * 7.0 + vec3(0.22, 0.4, 0.85) * corona * 0.8;
        gl_FragColor = vec4(light, stroke * vEnergy);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'Distant lightning channels';
  mesh.frustumCulled = false;
  let lastCycle = -1;
  let lastAspect = 0;
  mesh.userData.update = (time, aspect) => {
    const cycle = Math.floor(time / 19);
    mesh.visible = uniforms.uLightning.value > 0.001 && uniforms.uUnder.value < 0.5;
    if (cycle === lastCycle && aspect === lastAspect) return;
    lastCycle = cycle;
    lastAspect = aspect;
    const random = mulberry32(cycle + 801);
    // Keep the distant storm inside the narrow portrait view too.
    const angle = 3.78 + Math.max(0, 1 - aspect) * 0.4 + (random() - 0.5) * 0.34;
    const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-axis.z, 0, axis.x);
    const center = axis.clone().multiplyScalar(310 + random() * 60);
    uniforms.uStormDir.value.copy(axis);
    const positions = [], edges = [], energies = [], indices = [];
    for (const { points, energy, width } of strikeChannels(cycle + 3901)) {
      const offset = edges.length;
      points.forEach(([x, y], i) => {
        const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
        const dx = after[0] - before[0], dy = after[1] - before[1];
        const length = Math.hypot(dx, dy);
        const taper = 1 - i / points.length * (energy < 1 ? 0.8 : 0.3);
        const radius = 0.65 * width * taper;
        for (const sign of [-1, 1]) {
          const px = x - dy / length * radius * sign;
          positions.push(center.x + side.x * px, y + dx / length * radius * sign, center.z + side.z * px);
          edges.push(sign); energies.push(energy);
        }
        if (i > 0) {
          const k = offset + i * 2;
          indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('edge', new THREE.Float32BufferAttribute(edges, 1));
    geometry.setAttribute('energy', new THREE.Float32BufferAttribute(energies, 1));
    geometry.setIndex(indices);
    mesh.geometry.dispose(); mesh.geometry = geometry;
  };
  return mesh;
}
