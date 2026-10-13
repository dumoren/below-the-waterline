import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildFish } from './fish.js';
import { COMMON_CHUNK } from './glsl.js';
import { mulberry32 } from './noise.js';

export function buildMarineLife(U, { mobile }) {
  const group = new THREE.Group();
  group.name = 'North Atlantic marine life';
  for (const [kind, count, seed] of [['capelin', mobile ? 650 : 1400, 113], ['herring', mobile ? 140 : 320, 29], ['cod', mobile ? 28 : 70, 57], ['skate', mobile ? 5 : 12, 82]]) {
    group.add(buildFish(U, count, { toolkit: false, kind, seed }));
  }

  // A translucent bell with trailing tentacles. All jellyfish share one instanced draw call.
  const parts = [new THREE.SphereGeometry(0.65, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const trail = new THREE.CatmullRomCurve3(Array.from({ length: 5 }, (_, j) => new THREE.Vector3(Math.cos(a) * (0.38 + j * 0.035), -j * 0.6, Math.sin(a) * 0.38 + Math.sin(j * 1.4 + a) * j * 0.06)));
    parts.push(new THREE.TubeGeometry(trail, 12, 0.018, 3, false).toNonIndexed());
  }
  const jellyGeo = new THREE.InstancedBufferGeometry().copy(mergeGeometries(parts));
  parts.forEach((g) => g.dispose());
  jellyGeo.instanceCount = mobile ? 12 : 28;
  const rnd = mulberry32(490);
  jellyGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: jellyGeo.instanceCount * 4 }, rnd), 4));
  const jellyMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `${COMMON_CHUNK}
      attribute vec4 aSeed;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        float phase = uTime * 1.3 + aSeed.x * TAU;
        float a = aSeed.x * TAU + sin(uTime * 0.04 + aSeed.y * TAU) * 0.12;
        float r = 28.0 + aSeed.y * 17.0;
        vec3 centre = vec3(cos(a) * r, -8.0 - aSeed.z * 46.0 + sin(phase * 0.4) * 0.6, sin(a) * r);
        vec3 local = position;
        local.xz *= 1.0 + sin(phase) * 0.13 * smoothstep(-0.2, 0.5, local.y);
        local.xz += vec2(sin(phase + local.y * 1.4), cos(phase * 0.7 + local.y)) * max(0.0, -local.y) * 0.09;
        vec3 wp = centre + local * (0.65 + aSeed.w * 0.65);
        float fog = uwFog(distance(cameraPosition, wp));
        vec3 silver = vec3(0.38, 0.5, 0.54) * (0.6 + 0.3 * sin(phase)) + torchLight(wp, vec3(0.0, 1.0, 0.0));
        vCol = mix(silver, uwFogColor(cameraPosition.y), fog);
        vAlpha = (position.y < -0.1 ? 0.4 : 0.24) * (1.0 - fog * 0.65);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `varying vec3 vCol; varying float vAlpha;
      void main() { gl_FragColor = vec4(vCol, vAlpha); }`,
  });
  const jellies = new THREE.Mesh(jellyGeo, jellyMat);
  jellies.name = 'Moon jellyfish';
  jellies.frustumCulled = false;
  group.add(jellies);
  return group;
}

export function buildSchoolBeacon(U) {
  const group = new THREE.Group();
  group.name = 'Toolkit shimmer rings';
  const material = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${COMMON_CHUNK}
      varying vec3 vWorld;
      void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`,
    fragmentShader: `${COMMON_CHUNK}
      uniform float uFishGlow;
      uniform vec3 uSchoolC;
      varying vec3 vWorld;
      void main() {
        float sweep = pow(max(0.0, sin(atan(vWorld.z - uSchoolC.z, vWorld.x - uSchoolC.x) * 2.0 - uTime * 1.5)), 8.0);
        float fog = uwFog(distance(cameraPosition, vWorld));
        gl_FragColor = vec4(vec3(0.65, 0.86, 1.0) * (0.4 + sweep * 1.8 + uFishGlow * 0.6), (0.12 + sweep * 0.4) * (1.0 - fog));
      }`,
  });
  for (const r of [5.1, 5.6]) group.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 3, 96), material));
  group.userData.update = (time) => {
    group.position.copy(U.uSchoolC.value);
    group.children[0].rotation.set(Math.PI / 2 + 0.2, Math.sin(time * 0.18) * 0.25, time * 0.06);
    group.children[1].rotation.set(Math.PI / 2 - 0.3, Math.cos(time * 0.15) * 0.3, -time * 0.08);
  };
  return group;
}
