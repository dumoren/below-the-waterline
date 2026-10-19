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
// 1 while a wave spans many samples of the given spacing, 0 once it would alias.
// lo and hi are fractions of the wavelength (Nyquist is 0.5).
float waveResolved(int i, float spacing, float lo, float hi) {
  float wavelength = 6.2831853 / max(1e-4, length(uWaves[i].xy));
  return 1.0 - smoothstep(lo * wavelength, hi * wavelength, spacing);
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
uniform float uMoonDiskStrength;
uniform float uSunElevation;
uniform float uSunAngularRadius;
uniform float uMoonAngularRadius;
uniform float uHorizonDip;
uniform float uMoonFraction;
uniform float uMoonAngle;
uniform float uMoonWaxing;
uniform float uTwilight;
uniform float uAmbient;
uniform float uCloud;
uniform float uRain;
uniform float uSnow;
uniform float uFog;
uniform float uFogExtinction;
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

vec3 sunLightColor() { return mix(vec3(1.0, 0.57, 0.34), vec3(1.0, 0.94, 0.82), smoothstep(0.05, 0.55, uSunElevation)) * uSunStrength; }
vec3 moonLightColor() { return vec3(0.38, 0.55, 0.85) * uMoonStrength * 0.38; }
vec3 directLightColor() { return sunLightColor() + moonLightColor() + vec3(0.3, 0.4, 0.6) * uLightning; }
vec3 directLightDirection() { return normalize(uSunDir * uSunStrength + uMoonDir * uMoonStrength * 0.38 + vec3(0.0, 0.0001, 0.0)); }
vec3 directIrradiance(vec3 n, float power) { return sunLightColor() * pow(max(dot(n, uSunDir), 0.0), power) + moonLightColor() * pow(max(dot(n, uMoonDir), 0.0), power); }
float directShade(vec3 n) {
  return (smoothstep(0.3, -0.5, dot(n, uSunDir)) * uSunStrength + smoothstep(0.3, -0.5, dot(n, uMoonDir)) * uMoonStrength * 0.38) / max(0.001, uSunStrength + uMoonStrength * 0.38);
}
float surfaceLight() { return 0.12 + uDaylight * (1.0 - uCloud * 0.65) + uMoonStrength * 0.15; }
// Beer–Lambert extinction from the reported visibility (Koschmieder, per scene unit):
// an object at the visibility distance keeps 2% of its contrast against the sky.
float airFog(float dist) { return 1.0 - exp(-max(dist, 0.0) * uFogExtinction); }

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

vec3 horizonSky(float overcast) {
  return mix(vec3(0.018, 0.031, 0.055), mix(vec3(0.26, 0.50, 0.80), vec3(0.52, 0.57, 0.62), overcast), uDaylight);
}
// The hazy air at the horizon in direction d. Fog scatters this toward the viewer from
// every direction, so fogged ice and water fade to it rather than to the dark sky below the sea line.
vec3 horizonAir(vec3 d) {
  float facingSun = pow(max(dot(normalize(d.xz + vec2(0.0001)), normalize(uSunDir.xz + vec2(0.0001))), 0.0), 3.0);
  vec3 col = horizonSky(smoothstep(0.35, 1.0, uCloud)) * (1.0 - uThunder * 0.48);
  col += vec3(0.3, 0.12, 0.07) * uTwilight * facingSun * (1.0 - uCloud * 0.8);
  return mix(col, mix(vec3(0.025, 0.035, 0.05), vec3(0.34, 0.39, 0.43), uDaylight), uFog * 0.7);
}

vec3 skyColor(vec3 d) {
  float h = d.y;
  float seaH = h - uHorizonDip;
  float angularPixel = 0.00015;
  #ifdef FILTERED_STARS
    angularPixel = max(0.00015, length(fwidth(d)) * 0.65);
  #endif
  float aboveSea = smoothstep(-angularPixel, angularPixel, seaH);
  // The opening view looks just above the horizon. Keep that clear air blue;
  // grey scattering belongs to cloud cover and poor visibility.
  float overcast = smoothstep(0.35, 1.0, uCloud);
  vec3 zenith = mix(vec3(0.0015, 0.003, 0.012), mix(vec3(0.025, 0.11, 0.30), vec3(0.18, 0.23, 0.30), overcast), uDaylight);
  vec3 mid = mix(vec3(0.006, 0.013, 0.032), mix(vec3(0.065, 0.24, 0.56), vec3(0.30, 0.35, 0.42), overcast), uDaylight);
  vec3 horizon = horizonSky(overcast);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.16, h));
  col = mix(col, zenith, smoothstep(0.18, 0.75, h));
  float blueHour = smoothstep(-0.22, -0.06, uSunElevation) * (1.0 - smoothstep(-0.04, 0.06, uSunElevation));
  col += vec3(0.004, 0.014, 0.04) * blueHour;
  col *= 1.0 - uThunder * 0.48;
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(0.65, 0.20, 0.10) * uTwilight * pow(max(dot(normalize(d.xz), normalize(uSunDir.xz + vec2(0.0001))), 0.0), 3.0) * exp(-abs(h) * 7.0) * (1.0 - uCloud * 0.8);
  // Physical angular size; clouds and fog soften and veil the disk. The cloud
  // layer below can pass in front of it, and the horizon clips a rising/setting sun.
  float sunRadius = uSunAngularRadius;
  float sunEdge = angularPixel + uFog * 0.001 + uCloud * uCloud * 0.0003;
  float sunDisk = 1.0 - smoothstep(sunRadius - sunEdge, sunRadius + sunEdge, length(d - uSunDir));
  // Rough reflections can cover more sky than the solar disk in one pixel.
  // Preserve its coverage instead of turning that wide filter into bright stripes.
  sunDisk *= min(1.0, pow(sunRadius / max(sunRadius, angularPixel), 2.0));
  sunDisk *= aboveSea * (1.0 - smoothstep(0.7, 0.98, uCloud)) * (1.0 - smoothstep(0.18, 0.85, uFog));
  col += sunLightColor() * (pow(s, 64.0) * 0.05 + pow(s, 700.0) * 0.22 + sunDisk * 4.0);
  // Let the lunar halo continue below the horizon without a hard horizontal cutoff.
  float moonSeparation = length(d - uMoonDir);
  col += vec3(0.55, 0.67, 0.85) * exp(-pow(moonSeparation / (uMoonAngularRadius * (4.0 + uFog * 4.0)), 2.0)) * uMoonStrength * 0.007;
  if (moonSeparation < uMoonAngularRadius + angularPixel * 2.0 && uMoonDiskStrength > 0.001) {
      vec3 side = normalize(cross(vec3(0.0001, 1.0, 0.0), uMoonDir));
      vec3 up = cross(uMoonDir, side);
      vec2 uv = vec2(dot(d, side), dot(d, up)) / uMoonAngularRadius;
      float r2 = dot(uv, uv);
      if (r2 < 1.0) {
        float z = sqrt(1.0 - r2), f = 2.0 * uMoonFraction - 1.0;
        vec3 lit = vec3(vec2(sin(uMoonAngle), cos(uMoonAngle)) * sqrt(max(0.0, 1.0 - f * f)), f);
        float phase = smoothstep(-0.035, 0.035, dot(vec3(uv, z), lit));
        float crater = 0.68 + vnoise(uv * 11.0) * 0.32;
        float limb = 1.0 - smoothstep(max(0.0, 1.0 - angularPixel / uMoonAngularRadius), 1.0, sqrt(r2));
        col += vec3(0.30, 0.34, 0.40) * phase * crater * limb * uMoonDiskStrength * aboveSea;
      }
  }
  if (seaH > 0.0) {
    vec2 uv = d.xz / (h + 0.16) * 1.4 + vec2(uTime * (0.002 + uWind * 0.012), uTime * 0.001);
    float noise = vnoise(uv) * 0.6 + vnoise(uv * 2.1 + 3.0) * 0.28 + vnoise(uv * 4.3 - 1.0) * 0.12;
    float clouds = smoothstep(0.82 - uCloud * 0.7, 1.0 - uCloud * 0.55, noise);
    clouds = mix(clouds, 0.92, smoothstep(0.85, 1.0, uCloud) * 0.7);
    // Fade the whole cloud layer, including overcast, into the horizon atmosphere.
    clouds *= smoothstep(0.0, 0.1, seaH);
    vec3 cloudColor = mix(vec3(0.018, 0.028, 0.045), mix(vec3(0.80, 0.85, 0.92), vec3(0.34, 0.39, 0.45), overcast), uDaylight);
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
  float width = 0.012 + uCloud * 0.038 + uFog * 0.065 + uRain * 0.025;
  float mist = exp(-pow(abs(seaH) / width, 1.6)) * (0.12 + uCloud * 0.35 + uFog * 0.45);
  col = mix(col, horizonAir(d), mist);
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
