import * as THREE from 'three';
import { mulberry32 } from './noise.js';

/** A small GPU particle volume follows the camera above water. */
export function buildWeather(U, { mobile, reduced }) {
  const rnd = mulberry32(913), positions = [], kinds = [];
  for (let i = 0; i < (mobile ? 750 : 1900); i++) {
    positions.push((rnd() - 0.5) * 44, rnd() * 32, (rnd() - 0.5) * 44);
    kinds.push(rnd(), rnd(), rnd());
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
        p += cameraPosition;
        vY = p.y;
        vec4 view = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        float baseSize = mix(mix(20.0, 9.0, uDrizzle), 4.0 + uWind * 2.0, snow);
        baseSize = mix(baseSize, 3.2, ice);
        float size = baseSize * (0.75 + aWeather.z * 0.5) * uPixelRatio * 9.0 / max(3.0, -view.z);
        gl_PointSize = clamp(size, 1.0, mix(24.0, 8.0, min(1.0, snow + ice)));
        vFade = visibility * clamp(intensity * 2.0, 0.25, 1.0) * smoothstep(28.0, 3.0, length(p - cameraPosition));
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
