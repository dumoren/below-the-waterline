// GLSL shared by every material in the scene. The wave function is mirrored in JS
// (waterHeight below) so the camera knows exactly when it crosses the surface.
export { waterHeight, waterSlope } from '../marine-environment.js';

export const WATER_CHUNK = /* glsl */ `
uniform vec4 uWaves[3]; // wave vector X/Z, amplitude in scene units, angular frequency
uniform vec3 uWavePhase;
float waterHeight(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < 3; i++) h += sin(dot(p, uWaves[i].xy) - uWavePhase[i]) * uWaves[i].z;
  return h;
}
vec2 waterSlope(vec2 p) {
  vec2 d = vec2(0.0);
  for (int i = 0; i < 3; i++) d += uWaves[i].xy * cos(dot(p, uWaves[i].xy) - uWavePhase[i]) * uWaves[i].z;
  return d;
}
`;

export const COMMON_CHUNK = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSiriusDir;
uniform float uDaylight;
uniform float uSunStrength;
uniform float uMoonStrength;
uniform float uMoonFraction;
uniform float uMoonAngle;
uniform float uMoonWaxing;
uniform float uTwilight;
uniform float uAmbient;
uniform float uCloud;
uniform float uRain;
uniform float uSnow;
uniform float uFog;
uniform float uWind;
uniform float uThunder;
uniform float uLightning;
uniform float uWaterTime;
uniform float uWaterLight;
uniform float uWaterDirect;
uniform float uWaterTurbidity;
uniform float uWaterShafts;
uniform float uWaterCaustics;
uniform float uWaterMotion;
uniform float uWaterParticles;
uniform vec3 uWaterTint;
uniform float uSeaEnergy;
uniform vec2 uCurrentOffset;
uniform vec3 uStormDir;
uniform float uUnder;       // camera below the surface (0/1)
uniform vec3 uTorchDir;     // world-space ray under the cursor
uniform float uTorch;       // torch intensity
uniform vec3 uPingO;        // sonar origin
uniform float uPingR;       // sonar radius
uniform float uPingS;       // sonar strength
uniform vec3 uCPos[6];      // contacts frozen in the ice
uniform vec3 uCCol[6];
uniform float uCPow[6];

#define TAU 6.28318530718

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

vec3 directLightDirection() { return uSunStrength > 0.01 ? uSunDir : uMoonDir; }
vec3 directLightColor() {
  vec3 sunlight = mix(vec3(1.0, 0.57, 0.34), vec3(1.0, 0.94, 0.82), smoothstep(0.05, 0.55, uSunDir.y));
  return sunlight * uSunStrength + vec3(0.38, 0.55, 0.85) * uMoonStrength * 0.38 + vec3(0.3, 0.4, 0.6) * uLightning;
}
float surfaceLight() { return 0.12 + uDaylight * (1.0 - uCloud * 0.65) + uMoonStrength * 0.15; }
// A clear foreground preserves facets and painted steel; extinction builds with distance.
float airFog(float dist) {
  float opticalDepth = max(0.0, dist - 12.0) * (0.0005 + uFog * uFog * 0.012);
  return (1.0 - exp(-opticalDepth * opticalDepth)) * uFog;
}

vec3 starLight(vec3 d, float clouds) {
  float night = (1.0 - smoothstep(0.0, 0.22, uDaylight)) * (1.0 - uTwilight * 0.92);
  float clear = (1.0 - smoothstep(0.05, 0.65, uFog)) * (1.0 - smoothstep(0.45, 0.95, uCloud));
  clear *= pow(1.0 - clouds, 3.0) * (1.0 - uThunder) * (1.0 - max(uRain, uSnow) * 0.85);
  float visible = night * clear * smoothstep(0.015, 0.085, d.y);
  if (visible < 0.001) return vec3(0.0);

  // Fixed, jittered stars with varied sizes and temperatures. Pixel filtering keeps
  // the tiny points readable without shimmering as the camera or resolution changes.
  vec2 sp = d.xz / (d.y + 1.0) * 240.0;
  vec2 cell = floor(sp);
  float seed = hash12(cell);
  vec2 centre = vec2(hash12(cell + 17.1), hash12(cell + 39.7)) * 0.7 + 0.15;
  vec2 delta = fract(sp) - centre;
  float radius = mix(0.045, 0.115, hash12(cell + 81.3));
  // COMMON_CHUNK also runs in vertex shaders, where screen derivatives are unavailable.
  float pixelWidth = 0.0;
  float angularWidth = 0.0;
  #ifdef FILTERED_STARS
    pixelWidth = length(fwidth(sp));
    angularWidth = length(fwidth(d));
  #endif
  float width = max(radius, pixelWidth * 0.6);
  float point = exp(-dot(delta, delta) / (width * width)) * radius * radius / (width * width);
  float brightness = mix(0.35, 2.0, pow(hash12(cell + 5.4), 5.0));
  vec3 temperature = mix(vec3(0.62, 0.76, 1.0), vec3(1.0, 0.86, 0.69), hash12(cell + 9.2));
  vec3 stars = temperature * point * brightness * step(0.975, seed);

  // Sirius is deliberately framed in the opening view, with a compact blue-white
  // core and a soft halo. It stays fixed in the sky when the visitor looks around.
  float separation = length(d - uSiriusDir);
  float coreWidth = max(0.00085, angularWidth * 0.65);
  // Preserve its tiny angular energy when choppy water spreads the reflection.
  float core = exp(-pow(separation / coreWidth, 2.0)) * pow(0.00085 / coreWidth, 2.0);
  float halo = exp(-pow(separation / 0.0035, 2.0));
  stars += vec3(0.72, 0.85, 1.0) * (core * 3.5 + halo * 0.14);
  return stars * visible * (1.0 - uMoonStrength * 0.25);
}

vec3 skyColor(vec3 d) {
  float h = d.y;
  vec3 zenith = mix(vec3(0.0015, 0.003, 0.012), vec3(0.075, 0.20, 0.39), uDaylight);
  vec3 mid = mix(vec3(0.006, 0.013, 0.032), vec3(0.30, 0.47, 0.65), uDaylight);
  vec3 horizon = mix(vec3(0.018, 0.031, 0.055), vec3(0.62, 0.69, 0.73), uDaylight);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, zenith, smoothstep(0.18, 0.75, h));
  col *= 1.0 - uThunder * 0.48;
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(0.65, 0.20, 0.10) * uTwilight * pow(max(dot(normalize(d.xz), normalize(uSunDir.xz + vec2(0.0001))), 0.0), 3.0) * exp(-abs(h) * 7.0) * (1.0 - uCloud * 0.8);
  col += directLightColor() * uSunStrength * (pow(s, 24.0) * 0.16 + pow(s, 260.0) * 0.7 + pow(s, 6000.0) * 2.8);
  // Let the lunar halo continue below the horizon without a hard horizontal cutoff.
  float moonDot = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.12, 0.20, 0.36) * pow(moonDot, 90.0) * uMoonStrength;
  if (h > 0.0) {
    if (moonDot > 0.9995 && uMoonStrength > 0.001) {
      vec3 side = normalize(cross(vec3(0.0001, 1.0, 0.0), uMoonDir));
      vec3 up = cross(uMoonDir, side);
      vec2 uv = vec2(dot(d, side), dot(d, up)) / 0.014;
      uv = mat2(cos(uMoonAngle), -sin(uMoonAngle), sin(uMoonAngle), cos(uMoonAngle)) * uv;
      float r2 = dot(uv, uv);
      if (r2 < 1.0) {
        float z = sqrt(1.0 - r2), f = 2.0 * uMoonFraction - 1.0;
        vec3 lit = vec3(sqrt(max(0.0, 1.0 - f * f)) * uMoonWaxing, 0.0, f);
        float phase = smoothstep(-0.04, 0.08, dot(vec3(uv, z), lit));
        float crater = 0.8 + vnoise(uv * 11.0) * 0.2;
        col += vec3(0.68, 0.77, 0.88) * phase * crater * smoothstep(1.0, 0.85, r2) * (1.0 - uDaylight) * (1.0 - uCloud * 0.95) * 2.0;
      }
    }
    vec2 uv = d.xz / (h + 0.16) * 1.4 + vec2(uTime * (0.002 + uWind * 0.012), uTime * 0.001);
    float noise = vnoise(uv) * 0.6 + vnoise(uv * 2.1 + 3.0) * 0.28 + vnoise(uv * 4.3 - 1.0) * 0.12;
    float clouds = smoothstep(0.82 - uCloud * 0.7, 1.0 - uCloud * 0.55, noise);
    clouds = mix(clouds, 0.92, smoothstep(0.85, 1.0, uCloud) * 0.7);
    // Fade the whole cloud layer, including overcast, into the horizon atmosphere.
    clouds *= smoothstep(0.0, 0.1, h);
    vec3 cloudColor = mix(vec3(0.018, 0.028, 0.045), vec3(0.34, 0.39, 0.45), uDaylight);
    cloudColor *= 1.0 - uThunder * 0.55;
    cloudColor += vec3(0.32, 0.4, 0.55) * uLightning * (0.5 + noise);
    cloudColor += vec3(0.35, 0.13, 0.06) * uTwilight * pow(s, 3.0) * (1.0 - uCloud * 0.7);
    col = mix(col, cloudColor, clouds * 0.9);
    col += starLight(d, clouds);
  }
  col = mix(col, mix(vec3(0.025, 0.035, 0.05), vec3(0.34, 0.39, 0.43), uDaylight), uFog * 0.7);
  col = mix(col, vec3(0.014, 0.023, 0.038) * (0.3 + uAmbient), smoothstep(0.0, -0.12, h));
  // The sky and distant sea share this broad, continuous haze on both sides of zero.
  // Wetter conditions widen it; clear skies retain more definition and the celestial glow.
  float width = 0.035 + uCloud * 0.025 + uFog * 0.045 + uRain * 0.015;
  float mist = exp(-pow(abs(h) / width, 1.6)) * (0.45 + uCloud * 0.15 + uFog * 0.2);
  float facingSun = pow(max(dot(normalize(d.xz + vec2(0.0001)), normalize(uSunDir.xz + vec2(0.0001))), 0.0), 3.0);
  vec3 mistColor = horizon * (1.0 - uThunder * 0.48);
  mistColor += vec3(0.3, 0.12, 0.07) * uTwilight * facingSun * (1.0 - uCloud * 0.8);
  mistColor = mix(mistColor, mix(vec3(0.025, 0.035, 0.05), vec3(0.34, 0.39, 0.43), uDaylight), uFog * 0.7);
  col = mix(col, mistColor, mist);
  // Light scatters through a broad cloud bank around the strike and into reflections.
  float stormFacing = max(dot(normalize(d.xz + vec2(0.0001)), uStormDir.xz), 0.0);
  float cloudFlash = pow(stormFacing, 70.0) * exp(-pow((h - 0.08) / 0.13, 2.0));
  col += vec3(0.3, 0.4, 0.65) * cloudFlash * uLightning * 1.8;
  return col;
}

// Underwater light: absorbed fastest in red, slowest in blue.
vec3 absorb(float depth) { return exp(-max(depth, 0.0) * vec3(0.11, 0.042, 0.03)); }
// Storm mixing is strongest in the upper water. Deep water keeps its own calm,
// while the dwindling surface illumination still changes with the weather.
float waterWeatherInfluence(float y) { return exp(-max(-y, 0.0) * 0.055); }
vec3 waterTintAt(float y) { return mix(vec3(0.7, 0.94, 1.12), uWaterTint, exp(-max(-y, 0.0) * 0.035)); }
vec3 uwAmbientColor(float y) {
  float transmitted = uWaterLight * exp(-max(-y, 0.0) * (0.027 + uWaterTurbidity * 0.018));
  return waterTintAt(y) * (0.12 + transmitted);
}
vec3 underwaterLightDirection() {
  vec3 light = directLightDirection();
  return normalize(vec3(light.x * 0.6, max(0.4, light.y), light.z * 0.6));
}
vec3 uwFogColor(float y) {
  float d = clamp(-y / 66.0, 0.0, 1.0);
  vec3 shallow = mix(vec3(0.018, 0.12, 0.18), vec3(0.035, 0.095, 0.12), uWaterTurbidity * 0.65);
  shallow *= waterTintAt(y) * (0.08 + uWaterLight * 0.95);
  vec3 deep = vec3(0.002, 0.009, 0.02) * (0.55 + uWaterLight * 0.45);
  return mix(shallow, deep, pow(d, 0.65));
}
float uwFog(float dist) {
  float extinction = 0.018 + uWaterTurbidity * 0.052 * waterWeatherInfluence(cameraPosition.y);
  return 1.0 - exp(-dist * extinction);
}
// The colour of open water in a given view direction: glowing toward the surface, black below.
vec3 uwWater(vec3 dir, float y) {
  vec3 base = uwFogColor(y);
  float up = dir.y;
  vec3 col = base * (0.35 + 0.95 * smoothstep(-0.75, 0.95, up));
  col += vec3(0.03, 0.13, 0.15) * waterTintAt(y) * pow(max(up, 0.0), 2.2) * exp(min(y, 0.0) * 0.035) * uWaterLight;
  vec3 sunUw = underwaterLightDirection();
  col += directLightColor() * vec3(0.2, 0.35, 0.32) * waterTintAt(y) * pow(max(dot(dir, sunUw), 0.0), 18.0) * exp(min(y, 0.0) * 0.05);
  col += vec3(0.06, 0.16, 0.26) * uLightning * exp(min(y, 0.0) * 0.12) * pow(max(up, 0.0), 2.0);
  return col;
}

float caustic(vec2 xz, float t) {
  vec2 p = mod(xz * 0.28, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return min(pow(abs(c), 8.0), 4.0);
}

// A diver's torch from the camera along the cursor ray.
vec3 torchLight(vec3 wp, vec3 n) {
  vec3 toP = wp - cameraPosition;
  float d = length(toP);
  vec3 dir = toP / d;
  float cd = dot(dir, uTorchDir);
  // A real beam: hot centre, long soft falloff (no flat plateau), slightly warmer at the core.
  float x = 1.0 - cd;
  float core = exp(-x * 420.0);
  float cone = core * 0.85 + exp(-x * 60.0) * 0.22;
  float fall = 1.0 / (1.0 + d * d * 0.006);
  float lambert = max(dot(n, -dir), 0.0) * 0.8 + 0.2;
  return mix(vec3(0.85, 0.92, 0.95), vec3(1.0, 0.9, 0.74), core) * cone * fall * lambert * uTorch * 0.55;
}

float pingRing(vec3 wp) {
  float d = length(wp - uPingO);
  float w = 0.9 + uPingR * 0.03;
  float x = (d - uPingR) / w;
  return exp(-x * x) * uPingS;
}

vec3 contactGlow(vec3 wp) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float d = length(wp - uCPos[i]);
    g += uCCol[i] * uCPow[i] * (exp(-d * 0.55) * 0.9 + exp(-d * 0.14) * 0.1);
  }
  return g;
}
`;

// Fragment shaders only: derivatives don't exist in vertex shaders, so this can't live in COMMON_CHUNK.
export const FLAT_NORMAL_CHUNK = /* glsl */ `
vec3 flatNormal(vec3 p) {
  vec3 c = cross(dFdx(p), dFdy(p));
  float l = length(c);
  return l > 1e-12 ? c / l : vec3(0.0, 1.0, 0.0);
}
`;
