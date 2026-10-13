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

vec3 skyColor(vec3 d) {
  float h = d.y;
  vec3 zenith = vec3(0.018, 0.032, 0.07);
  vec3 mid = vec3(0.07, 0.11, 0.19);
  vec3 horizon = vec3(0.26, 0.28, 0.34);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, zenith, smoothstep(0.18, 0.75, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.48, 0.26) * (pow(s, 24.0) * 0.16 + pow(s, 260.0) * 0.7 + pow(s, 6000.0) * 2.2) * (1.0 - smoothstep(0.05, 0.4, h));
  col = mix(col, vec3(0.42, 0.34, 0.34), exp(-abs(h) * 30.0) * 0.4);
  col = mix(col, vec3(0.08, 0.11, 0.15), smoothstep(0.0, -0.12, h));
  return col;
}

// Underwater light: absorbed fastest in red, slowest in blue.
vec3 absorb(float depth) { return exp(-max(depth, 0.0) * vec3(0.11, 0.042, 0.03)); }
vec3 uwFogColor(float y) {
  float d = clamp(-y / 66.0, 0.0, 1.0);
  return mix(vec3(0.018, 0.1, 0.15), vec3(0.002, 0.009, 0.02), pow(d, 0.6));
}
float uwFog(float dist) { return 1.0 - exp(-dist * 0.026); }
// The colour of open water in a given view direction: glowing toward the surface, black below.
vec3 uwWater(vec3 dir, float y) {
  vec3 base = uwFogColor(y);
  float up = dir.y;
  vec3 col = base * (0.35 + 0.95 * smoothstep(-0.75, 0.95, up));
  col += vec3(0.03, 0.13, 0.15) * pow(max(up, 0.0), 2.2) * exp(y * 0.035);
  vec3 sunUw = normalize(vec3(uSunDir.x * 0.6, 1.0, uSunDir.z * 0.6));
  col += vec3(0.2, 0.35, 0.32) * pow(max(dot(dir, sunUw), 0.0), 18.0) * exp(y * 0.05);
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
