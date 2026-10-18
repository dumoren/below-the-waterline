import * as THREE from 'three';
import { mulberry32 } from './noise.js';

/** A small GPU particle volume follows the camera above water. */
export function buildWeather(U, { mobile, reduced }) {
  const rnd = mulberry32(913), positions = [], kinds = [];
  for (let i = 0; i < (mobile ? 750 : 1900); i++) {
    positions.push((rnd() - 0.5) * 44, rnd() * 32, (rnd() - 0.5) * 44);
    kinds.push(rnd(), rnd(), rnd());
  }
  // Extra flakes that only appear as snow thickens: flurries stay sparse, a blizzard fills the air.
  for (let i = 0; i < (mobile ? 900 : 2400); i++) {
    positions.push((rnd() - 0.5) * 44, rnd() * 32, (rnd() - 0.5) * 44);
    kinds.push(0.5 + rnd() * 0.35, 0.3 + rnd() * 0.7, rnd());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWeather', new THREE.Float32BufferAttribute(kinds, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { ...U, uWeatherTime: reduced ? { value: 0 } : U.uTime },
    transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uWeatherTime; uniform float uRain; uniform float uSnow;
      uniform float uIce; uniform float uDrizzle;
      uniform float uWind; uniform float uPixelRatio;
      attribute vec3 aWeather;
      varying float vKind; varying float vY; varying float vFade;
      void main() {
        vKind = aWeather.x < 0.5 ? 0.0 : aWeather.x < 0.85 ? 1.0 : 2.0;
        // Snow without rain borrows the rain drops too, so heavy snow actually fills the air.
        if (vKind < 0.5 && uRain < 0.01) vKind = 1.0;
        float snow = step(0.5, vKind) * (1.0 - step(1.5, vKind));
        float ice = step(1.5, vKind);
        float intensity = vKind < 0.5 ? uRain : vKind < 1.5 ? uSnow : uIce;
        float visibility = smoothstep(aWeather.y - 0.04, aWeather.y + 0.04, intensity) * step(0.005, intensity);
        vec3 p = position;
        float drift = 0.3 + uWind * mix(6.0, 13.0, snow);
        p.x = mod(p.x + uWeatherTime * drift + 22.0, 44.0) - 22.0;
        float speed = mix(mix(19.0, 9.0, uDrizzle), 2.2 + uWind * 2.2, snow);
        speed = mix(speed, 13.0, ice);
        p.y = mod(p.y - uWeatherTime * speed + 32.0, 32.0) - 10.0;
        p.x += sin(p.y * 0.3 + position.z + uWeatherTime * 0.4) * snow * (0.6 + uWind * 1.4);
        // Centre the volume ahead of the camera, where the view looks, not around it.
        vec3 ahead = -vec3(viewMatrix[0][2], 0.0, viewMatrix[2][2]);
        p += cameraPosition + ahead / max(1e-3, length(ahead)) * 14.0;
        vY = p.y;
        vec4 view = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        float baseSize = mix(mix(20.0, 9.0, uDrizzle), (4.0 + uWind * 2.0) * (1.0 + uSnow * 0.7), snow);
        baseSize = mix(baseSize, 3.2, ice);
        float size = baseSize * (0.75 + aWeather.z * 0.5) * uPixelRatio * 9.0 / max(3.0, -view.z);
        gl_PointSize = clamp(size, mix(1.0, 1.6, snow), mix(24.0, mix(8.0, 12.0, uSnow), min(1.0, snow + ice)));
        // Flakes are slow and bright: they stay readable further out, and light snow still shows.
        vFade = visibility * clamp(intensity * 2.0, mix(0.25, 0.6, snow), 1.0) * smoothstep(mix(28.0, 40.0, snow), 3.0, length(p - cameraPosition));
      }`,
    fragmentShader: `
      uniform float uDaylight; uniform float uMoonStrength; uniform float uWind;
      varying float vKind; varying float vY; varying float vFade;
      void main() {
        if (vY < 0.2 || vFade < 0.01) discard;
        vec2 p = gl_PointCoord - 0.5;
        float a = -uWind * 0.65;
        p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
        float snow = 1.0 - smoothstep(0.12, 0.5, length(p));
        float rain = exp(-p.x * p.x * 220.0) * (1.0 - abs(p.y) * 2.0);
        float pellet = 1.0 - smoothstep(0.22, 0.46, length(p));
        float alpha = (vKind < 0.5 ? rain * 0.6 : vKind < 1.5 ? snow * 0.8 : pellet * 0.85) * vFade;
        vec3 color = vKind > 0.5 ? vec3(0.82, 0.89, 0.94) : vec3(0.58, 0.69, 0.78);
        gl_FragColor = vec4(color * (0.45 + uDaylight * 0.55 + uMoonStrength * 0.2), alpha);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Local rain and snow'; points.frustumCulled = false; points.renderOrder = 3;
  return points;
}
