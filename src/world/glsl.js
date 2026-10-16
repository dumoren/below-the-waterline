// GLSL shared by every material in the scene. The wave function is mirrored in JS
// (waterHeight below) so the camera knows exactly when it crosses the surface.

export const WATER_CHUNK = /* glsl */ `
float waterHeight(vec2 p, float t) {
  float h = 0.0;
  h += sin(dot(p, vec2(0.21, 0.08)) + t * 0.9) * 0.28;
  h += sin(dot(p, vec2(-0.13, 0.19)) + t * 1.1) * 0.2;
  h += sin(dot(p, vec2(0.37, -0.29)) + t * 1.7) * 0.08;
  h += sin(dot(p, vec2(-0.52, -0.41)) + t * 2.3) * 0.04;
  return h;
}
vec2 waterSlope(vec2 p, float t) {
  vec2 d = vec2(0.0);
  d += vec2(0.21, 0.08) * cos(dot(p, vec2(0.21, 0.08)) + t * 0.9) * 0.28;
  d += vec2(-0.13, 0.19) * cos(dot(p, vec2(-0.13, 0.19)) + t * 1.1) * 0.2;
  d += vec2(0.37, -0.29) * cos(dot(p, vec2(0.37, -0.29)) + t * 1.7) * 0.08;
  d += vec2(-0.52, -0.41) * cos(dot(p, vec2(-0.52, -0.41)) + t * 2.3) * 0.04;
  return d;
}
`;

export function waterHeight(x, z, t) {
  return (
    Math.sin(x * 0.21 + z * 0.08 + t * 0.9) * 0.28 +
    Math.sin(x * -0.13 + z * 0.19 + t * 1.1) * 0.2 +
    Math.sin(x * 0.37 + z * -0.29 + t * 1.7) * 0.08 +
    Math.sin(x * -0.52 + z * -0.41 + t * 2.3) * 0.04
  );
}

export const COMMON_CHUNK = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
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
    if (uDaylight < 0.95) {
      vec2 sp = d.xz / (h + 1.0) * 300.0;
      float st = step(0.997, hash12(floor(sp))) * pow(max(0.0, 1.0 - length(fract(sp) - 0.5) * 2.0), 4.0);
      col += vec3(0.62, 0.74, 0.95) * st * (1.0 - uDaylight) * (1.0 - clouds) * (1.0 - uCloud) * smoothstep(0.03, 0.2, h);
    }
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
vec3 uwFogColor(float y) {
  float d = clamp(-y / 66.0, 0.0, 1.0);
  return mix(vec3(0.018, 0.1, 0.15) * (0.25 + surfaceLight() * 0.75), vec3(0.002, 0.009, 0.02), pow(d, 0.6));
}
float uwFog(float dist) { return 1.0 - exp(-dist * 0.026); }
// The colour of open water in a given view direction: glowing toward the surface, black below.
vec3 uwWater(vec3 dir, float y) {
  vec3 base = uwFogColor(y);
  float up = dir.y;
  vec3 col = base * (0.35 + 0.95 * smoothstep(-0.75, 0.95, up));
  col += vec3(0.03, 0.13, 0.15) * pow(max(up, 0.0), 2.2) * exp(y * 0.035) * surfaceLight();
  vec3 lightDir = directLightDirection();
  vec3 sunUw = normalize(vec3(lightDir.x * 0.6, 1.0, lightDir.z * 0.6));
  col += directLightColor() * vec3(0.2, 0.35, 0.32) * pow(max(dot(dir, sunUw), 0.0), 18.0) * exp(y * 0.05);
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
