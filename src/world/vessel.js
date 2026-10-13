// The anchor on the seabed and the chain up to the ship (see ship.js). The dive ends at the
// anchor; following the chain up brings you aboard.
import * as THREE from 'three';
import { COMMON_CHUNK } from './glsl.js';

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/** Rusted chain and anchor iron: dark, visible mostly by torchlight and sonar. */
export function ironMaterial(uniforms, highlight = false) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uAnchorHover: highlight ? uniforms.uAnchorHover : { value: 0 }, uAnchorLit: { value: highlight ? 1 : 0 }, uAnchorIdle: highlight ? uniforms.uAnchorIdle : { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_CHUNK}
      uniform float uAnchorHover;
      uniform float uAnchorLit;
      uniform float uAnchorIdle;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 rust = vec3(0.24, 0.15, 0.1);
        vec3 col = rust * (0.1 + 0.16 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0)) * (0.4 + absorb(-vWorld.y));
        col += torchLight(vWorld, n) * rust * 3.0;
        col += vec3(0.35, 0.95, 1.0) * pingRing(vWorld) * 0.8;
        col += pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 3.0) * vec3(0.08, 0.13, 0.16);
        // Hover: the iron stays dark; only a thin warm edge in the boat's colour lights up.
        col += (vec3(0.05, 0.022, 0.015) * max(n.y, 0.0) + vec3(0.5, 0.14, 0.08) * pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 3.0)) * uAnchorHover;
        // The dive's destination: a cool rim and some top light so it leads the eye on the floor.
        float rimA = pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 2.0);
        col += (vec3(0.1, 0.24, 0.27) * rimA + rust * 0.35 * max(n.y, 0.0) + rust * 0.12) * uAnchorLit;
        // Breathing warm rim at the bottom of the dive: the way up, in the boat's colour.
        col += vec3(0.55, 0.16, 0.1) * rimA * uAnchorIdle * 0.9;
        col = mix(col, uwWater(-V, cameraPosition.y), uwFog(length(cameraPosition - vWorld)) * uUnder);
        if (uUnder < 0.5) col *= 0.2;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** An admiralty anchor, half buried and lying over. Ring at local +y. */
export function buildAnchor(uniforms) {
  const mat = ironMaterial(uniforms, true);
  const g = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 4.2, 10), mat);
  shank.position.y = 2.1;
  const arms = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.2, 8, 24, Math.PI), mat);
  arms.rotation.z = Math.PI;
  arms.position.y = 1.55;
  const flukeGeo = new THREE.ConeGeometry(0.55, 1.0, 4);
  const f1 = new THREE.Mesh(flukeGeo, mat);
  f1.position.set(1.55, 1.95, 0);
  f1.rotation.z = -0.35;
  const f2 = new THREE.Mesh(flukeGeo, mat);
  f2.position.set(-1.55, 1.95, 0);
  f2.rotation.z = 0.35;
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), mat);
  stock.rotation.x = Math.PI / 2;
  stock.position.y = 3.7;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 20), mat);
  ring.position.y = 4.55;
  g.add(shank, arms, f1, f2, stock, ring);
  g.userData.ringLocal = new THREE.Vector3(0, 4.9, 0);
  return g;
}

/** Chain links from the anchor ring up to the hawse, sagging near the bottom. Returns the mesh and a sampler. */
export function buildChain(uniforms, from, to) {
  const at = (s) => {
    const p = new THREE.Vector3().lerpVectors(from, to, s);
    p.y = from.y + (to.y - from.y) * Math.pow(s, 1.25);
    return p;
  };
  // Arc length by sampling.
  let len = 0;
  let prev = at(0);
  for (let i = 1; i <= 200; i++) {
    const p = at(i / 200);
    len += p.distanceTo(prev);
    prev = p;
  }
  const spacing = 0.62;
  const count = Math.floor(len / spacing);
  const geo = new THREE.TorusGeometry(0.32, 0.085, 5, 12);
  geo.scale(1, 1.55, 1);
  const mesh = new THREE.InstancedMesh(geo, ironMaterial(uniforms), count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) / count;
    const p = at(s);
    const dir = at(Math.min(1, s + 0.005)).sub(at(Math.max(0, s - 0.005))).normalize();
    q.setFromUnitVectors(up, dir);
    q2.setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0);
    q.multiply(q2);
    m4.compose(p, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m4);
  }
  mesh.frustumCulled = false;
  return { mesh, at };
}
