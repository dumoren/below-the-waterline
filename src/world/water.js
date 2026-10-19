// The ocean surface (seen from both sides) and the blue-hour sky.
import * as THREE from 'three';
import { COMMON_CHUNK, WATER_CHUNK } from './glsl.js';
import { M_PER_UNIT } from '../scene-scale.js';

/** A radial grid, dense near the berg, sparse out to the horizon. */
function radialGrid(rings, segs, maxR) {
  const pos = [];
  const spacing = [];
  const index = [];
  const outerRings = 24;
  const radii = [];
  for (let i = 0; i <= rings + outerRings; i++) {
    radii.push(i <= rings ? maxR * Math.pow(i / rings, 2.3) : maxR * Math.pow(12000 / maxR, (i - rings) / outerRings));
  }
  radii.forEach((r, i) => {
    // The coarser of the ring gap and the arc between spokes: the shortest wave this vertex can carry.
    const gap = (radii[Math.min(i + 1, radii.length - 1)] - radii[Math.max(i - 1, 0)]) / (i === 0 || i === radii.length - 1 ? 1 : 2);
    const s = Math.max(gap, (Math.PI * 2 * r) / segs);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      spacing.push(s);
    }
  });
  for (let i = 0; i < rings + outerRings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSpacing', new THREE.Float32BufferAttribute(spacing, 1));
  g.setIndex(index);
  return g;
}

export function buildWater(uniforms, { mobile }) {
  const geo = radialGrid(mobile ? 110 : 170, mobile ? 160 : 256, 460);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${WATER_CHUNK}
      uniform float uTime;
      attribute float aSpacing;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec2 vCurve;
      void main() {
        vec3 p = position;
        float radius = length(p.xz);
        // End displaced swells before the coarse horizon rings. Sampling short
        // waves on those wide rings produces false concentric bands at the horizon.
        float detail = 1.0 - smoothstep(250.0, 460.0, radius);
        float bend = max(0.0, radius - 460.0);
        float earthRadius = ${(6371000 / M_PER_UNIT).toFixed(3)};
        // Displace only by waves this ring spacing can carry. A short marine wave
        // sampled every few units interpolates into swirling moiré across the sea.
        float h = 0.0;
        vec2 s = vec2(0.0);
        for (int i = 0; i < 3; i++) {
          float k = waveResolved(i, aSpacing, 0.125, 0.25) * detail * uWaves[i].z;
          float phase = dot(p.xz, uWaves[i].xy) - uWavePhase[i];
          h += sin(phase) * k;
          s += uWaves[i].xy * cos(phase) * k;
        }
        vCurve = -p.xz / max(0.001, radius) * bend / earthRadius;
        p.y += h - bend * bend / (2.0 * earthRadius);
        s += vCurve;
        vN = normalize(vec3(-s.x, 1.0, -s.y));
        vec4 w = modelMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      #define FILTERED_STARS
      ${COMMON_CHUNK}
      ${WATER_CHUNK}
      uniform sampler2D uWaterline;
      uniform vec4 uBoat;      // x, z, heading, on
      uniform vec2 uBoatSize;  // half length, half beam
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec2 vCurve;

      // Swell normals per pixel, each wave faded once a pixel covers too much of it,
      // so short waves stay crisp nearby and average out instead of aliasing far away.
      vec3 swellNormal(vec2 p) {
        float footprint = max(length(dFdx(p)), length(dFdy(p)));
        vec2 s = vCurve;
        for (int i = 0; i < 3; i++) {
          float k = waveResolved(i, footprint, 0.17, 0.34) * uWaves[i].z;
          s += uWaves[i].xy * cos(dot(p, uWaves[i].xy) - uWavePhase[i]) * k;
        }
        return normalize(vec3(-s.x, 1.0, -s.y));
      }

      float ripple(vec2 q) { return vnoise(q + uTime * 0.35) + vnoise(q * 2.3 - uTime * 0.5) * 0.5 + vnoise(q * 5.1 + uTime * 0.8) * 0.2; }

      void main() {
        vec3 wp = vWorld;
        vec2 q = wp.xz * 0.9;
        float e = 0.08;
        float r0 = ripple(q);
        vec3 V = normalize(cameraPosition - wp);
        float dist = length(cameraPosition - wp);
        vec3 n = normalize(swellNormal(wp.xz) + vec3(r0 - ripple(q + vec2(e, 0.0)), 0.0, r0 - ripple(q + vec2(0.0, e))) * (0.35 + uSeaEnergy * 1.2 + uWind * 0.25 + uRain * 0.3) * (1.0 - smoothstep(150.0, 1400.0, dist)));

        // Foam hugging the berg's waterline.
        float ang = atan(wp.z, wp.x);
        float wl = texture2D(uWaterline, vec2(ang / TAU + 0.5, 0.5)).r;
        float rr = length(wp.xz) - wl;
        // Swell slapping the ship's hull: a band around its waterline footprint.
        vec2 bd = wp.xz - uBoat.xy;
        float ch = cos(uBoat.z);
        float sh = sin(uBoat.z);
        vec2 bl = vec2(ch * bd.x - sh * bd.y, sh * bd.x + ch * bd.y);
        float hullQ = pow(abs(bl.x) / uBoatSize.x, 3.0) + pow(abs(bl.y) / uBoatSize.y, 2.0);
        // Both foams are exactly zero away from the berg and the hull; skip the noise there.
        float foam = 0.0;
        bool nearHull = hullQ < 1.45 && uBoat.w > 0.0;
        if (rr < 3.0 || nearHull) {
          float fn = vnoise(wp.xz * 1.5 + vec2(uTime * 0.3, -uTime * 0.2)) * vnoise(wp.xz * 3.7 - uTime * 0.35);
          foam = smoothstep(3.0, 0.0, rr) * smoothstep(0.05, 0.4, fn + smoothstep(1.4, 0.0, rr) * 0.45);
          if (nearHull) foam = max(foam, smoothstep(1.45, 1.0, hullQ) * smoothstep(0.1, 0.45, fn + 0.12) * 0.5 * uBoat.w);
        }

        if (uUnder < 0.5) {
          float ndv = max(dot(n, V), 0.0);
          float fres = 0.02 + 0.98 * pow(clamp(1.0 - ndv, 0.0, 1.0), 5.0);
          vec3 R = reflect(-V, n);
          R.y = abs(R.y);
          vec3 refl = skyColor(R);
          // Tight glints retain the sun path without blooming over the whole horizon.
          vec3 spec = directIrradiance(R, 1800.0) * 1.8 + directIrradiance(R, 400.0) * 0.08;
          vec3 body = (vec3(0.006, 0.03, 0.042) + vec3(0.012, 0.06, 0.07) * smoothstep(-0.5, 1.0, n.y)) * (0.18 + uAmbient * 0.82);
          vec3 col = mix(body, refl, fres) + spec;
          col = mix(col, vec3(0.8, 0.86, 0.9) * (0.12 + uAmbient * 0.43 + 0.45 * length(directIrradiance(n, 1.0))), foam * 0.85);
          float haze = smoothstep(1600.0, 12000.0, dist);
          // Curvature brings the visible horizon inside the mesh's outer edge.
          // Fade grazing reflections into the sky before their flat distant normals
          // turn the low sun's glint into a hard horizontal band. Keep nearby waves.
          float grazing = abs(dot(normalize(vN), V));
          float horizonHaze = (1.0 - smoothstep(0.002, 0.018, grazing)) * smoothstep(460.0, 1600.0, dist);
          haze = max(haze, horizonHaze);
          col = mix(col, horizonAir(-V), airFog(dist));
          // Match the actual background ray, rather than sampling a fixed sky elevation.
          // At the outer grid edge this becomes exactly the sky behind it, hiding the seam.
          if (haze > 0.0) col = mix(col, skyColor(-V), haze);
          float alpha = max(mix(0.52, 0.97, fres), foam);
          alpha = mix(alpha, 1.0, smoothstep(60.0, 180.0, dist));
          // Fog in front of the surface also hides what lies beneath it.
          alpha = mix(alpha, 1.0, airFog(dist));
          // Daylight reaching the sea has crossed the fog bank (~400 m, 130 units), so it arrives
          // weak and diffuse. Glare off the bright surface then hides the ice below it.
          alpha = mix(alpha, 1.0, 1.0 - exp(-uFogExtinction * 130.0));
          gl_FragColor = vec4(col, alpha);
        } else {
          // From below: Snell's window. Outside ~48.6° from vertical the surface is a mirror of the deep.
          float up = clamp(-V.y, 0.0, 1.0);
          float window = smoothstep(0.6, 0.72, up);
          vec3 sd = normalize(vec3(-V.x * 0.7 + n.x * 0.6, 0.35 + up, -V.z * 0.7 + n.z * 0.6));
          vec3 sky = skyColor(sd) * 1.7 + directIrradiance(sd, 12.0) * 0.6;
          vec3 tir = uwWater(normalize(vec3(-V.x, 0.2, -V.z)), -2.0) * 0.9 + vec3(0.0, 0.02, 0.025) * r0;
          vec3 col = mix(tir, sky, window);
          col += vec3(0.5, 0.85, 1.0) * waterTintAt(cameraPosition.y) * pow(r0 * 0.6, 6.0) * window * 0.8 * uWaterCaustics;
          col = mix(col, vec3(0.75, 0.85, 0.9) * (0.15 + uAmbient * 0.85), foam * 0.35 * window);
          col *= absorb(-cameraPosition.y * 0.6);
          col = mix(col, uwWater(-V, cameraPosition.y), uwFog(dist));
          gl_FragColor = vec4(col, 1.0);
        }
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}

export function buildSky(uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      #define FILTERED_STARS
      ${COMMON_CHUNK}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        if (uUnder > 0.5) {
          gl_FragColor = vec4(uwWater(d, cameraPosition.y), 1.0);
          return;
        }
        vec3 col = skyColor(d);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
