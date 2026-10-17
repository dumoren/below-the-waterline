// Art direction for the dive, derived continuously from the normalized weather
// controls. No preset names or exclusive weather branches belong in this mapping.
// Atmospheric visibility softens incoming light; wind and precipitation, rather
// than fog alone, drive the stronger near-surface disturbance in the shaders.
const clamp = (value) => Math.max(0, Math.min(1, value));
export const UNDERWATER_SCALARS = Object.freeze([
  'waterLight', 'waterDirect', 'waterTurbidity', 'waterShafts',
  'waterCaustics', 'waterMotion', 'waterParticles',
]);

export function underwaterConditions(p) {
  const haze = 1 - p.visibility;
  const cold = clamp(p.snow * 0.7 + p.ice * 0.45);
  const disturbance = clamp(p.wind * 0.65 + p.rain * 0.25 + p.ice * 0.12 + p.thunder * 0.35);
  const sky = p.daylight * (1 - p.cloud * 0.62) * (1 - p.thunder * 0.35) * (1 - haze * 0.28);
  const direct = clamp((p.sun + p.moon * 0.18) * (1 - p.cloud * 0.38) * (1 - p.thunder * 0.4) * (1 - haze * 0.2));
  const turbidity = clamp(disturbance * 0.75 + p.rain * 0.12 + p.snow * 0.06 + p.ice * 0.06);
  const warm = p.twilight * clamp(p.sun + p.daylight * 0.25);
  return {
    waterLight: clamp(0.025 + sky * 0.62 + direct * 0.42),
    waterDirect: direct,
    waterTurbidity: turbidity,
    waterShafts: direct * (1 - p.cloud * 0.55) * (1 - turbidity * 0.6),
    waterCaustics: direct * (1 - p.cloud * 0.7) * (1 - disturbance * 0.45) * (1 - cold * 0.25),
    waterMotion: clamp(p.wind * 0.8 + p.rain * (0.25 - p.drizzle * 0.1) + p.ice * 0.1 + p.thunder * 0.2),
    waterParticles: clamp(0.2 + disturbance * 0.5 + p.snow * 0.1 + p.ice * 0.08),
    waterTint: [0.76 + warm * 0.4 - cold * 0.16, 1 + warm * 0.08 - cold * 0.12 - disturbance * 0.1, 1.08 + cold * 0.22 + p.moon * 0.12],
  };
}
