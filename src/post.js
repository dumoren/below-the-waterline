// Post: bloom, then a lens pass that handles the waterline crossing (split view with a
// meniscus), underwater wobble, chromatic fringe, vignette and grain. The lens pass is last,
// so it also does the tone mapping and sRGB output (no separate OutputPass).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { WATER_CHUNK } from './world/glsl.js';

// Bloom blurs across the whole frame, so a single NaN/Inf pixel from any shader would
// black out the screen. Scrub those (and cap runaway highlights) wherever the scene is read:
// in bloom's high-pass, and in the lens pass's own samples.
const SANITIZE = /* glsl */ `
vec3 sanitize(vec3 c) { return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 64.0); }
`;

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uUnder: { value: 0 },
    uNear: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uDepth: { value: 0 },
    uPing: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    ${WATER_CHUNK}
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uUnder;
    uniform float uNear;
    uniform vec2 uRes;
    uniform mat4 uInvProj;
    uniform mat4 uCamWorld;
    uniform vec3 uCamPos;
    uniform float uDepth;
    uniform float uPing;
    varying vec2 vUv;
    ${SANITIZE}

    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;

      // Where does this pixel's ray meet a virtual lens port 0.6 units ahead? Above or below the surface?
      vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec3 dir = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
      vec3 lp = uCamPos + dir * 0.6;
      float wl = lp.y - waterHeight(lp.xz, uTime);
      float below = smoothstep(0.02, -0.02, wl);
      float e = wl / 0.025;
      float edge = exp(-e * e) * uNear;

      // Underwater wobble; stronger right at the meniscus.
      float wob = uUnder * 0.0016 + edge * 0.012;
      uv += vec2(sin(uv.y * 22.0 + uTime * 1.3), cos(uv.x * 17.0 + uTime * 1.1)) * wob;

      vec2 d = uv - 0.5;
      float ca = 0.0008 + uUnder * 0.0014 + edge * 0.004;
      vec3 col;
      col.r = sanitize(texture2D(tDiffuse, uv + d * ca).rgb).r;
      col.g = sanitize(texture2D(tDiffuse, uv).rgb).g;
      col.b = sanitize(texture2D(tDiffuse, uv - d * ca).rgb).b;

      // While straddling the surface from above, the lower half of the frame is underwater.
      float split = below * (1.0 - uUnder) * uNear;
      col = mix(col, col * vec3(0.25, 0.62, 0.66) + vec3(0.0, 0.035, 0.045), split);
      col += vec3(0.7, 0.9, 1.0) * edge * 0.22;

      // Grade: cool lift in the deep.
      col = mix(col, col * vec3(0.9, 1.0, 1.05) + vec3(0.0, 0.004, 0.008), uUnder * uDepth);
      col += vec3(0.1, 0.4, 0.45) * uPing * 0.04;

      float vig = smoothstep(1.25, 0.35, length(d * vec2(1.1, 1.0)));
      col *= mix(1.0, vig, 0.65 + uUnder * 0.3);
      col += (h(uv * uRes + fract(uTime) * 97.0) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

export function buildPost(renderer, scene, camera, { mobile }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.55 : 0.7, 0.6, 0.72);
  const hp = bloom.materialHighPassFilter;
  const read = 'vec4 texel = texture2D( tDiffuse, vUv );';
  if (!hp.fragmentShader.includes(read)) throw new Error('UnrealBloomPass high-pass shader changed; update the sanitize patch');
  hp.fragmentShader = SANITIZE + hp.fragmentShader.replace(read, `${read}
 texel.rgb = sanitize(texel.rgb);`);
  hp.needsUpdate = true;
  composer.addPass(bloom);
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  return { composer, bloom, lens };
}
