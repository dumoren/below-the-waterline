import { underwaterConditions } from './underwater-environment.js';

// One normalized vocabulary for live observations and presets.
// These are visual strengths, not probabilities. Visibility spans 0–20 km.
export const CLEAR_VISIBILITY_METRES = 20_000;
export const WEATHER_PARAMETERS = Object.freeze([
  { key: 'daylight', label: 'Daylight', group: 'Light & atmosphere', default: 1, hint: 'Brightness of the sky and ambient light' },
  { key: 'sun', label: 'Sunlight', group: 'Light & atmosphere', default: 1, hint: 'Direct sunlight and reflections' },
  { key: 'moon', label: 'Moonlight', group: 'Light & atmosphere', default: 0, hint: 'Moon glow and reflected moonlight' },
  { key: 'twilight', label: 'Twilight', group: 'Light & atmosphere', default: 0, hint: 'Warm colour around the sun at the horizon' },
  { key: 'cloud', label: 'Cloud cover', group: 'Light & atmosphere', default: 0.18, hint: 'Amount of sky covered by clouds' },
  { key: 'visibility', label: 'Visibility', group: 'Light & atmosphere', default: 1, hint: '0% is dense fog; 100% is 20 km or more' },
  { key: 'rain', label: 'Rain', group: 'Precipitation & wind', default: 0, hint: 'Rainfall intensity' },
  { key: 'snow', label: 'Snow', group: 'Precipitation & wind', default: 0, hint: 'Snowfall intensity; can mix with rain' },
  { key: 'ice', label: 'Ice / hail', group: 'Precipitation & wind', default: 0, hint: 'Ice pellet and hail intensity' },
  { key: 'drizzle', label: 'Fine drizzle', group: 'Precipitation & wind', default: 0, hint: 'Makes existing rain finer and slower; add rain to see it' },
  { key: 'wind', label: 'Wind', group: 'Precipitation & wind', default: 0.15, hint: 'Cloud drift, precipitation drift and water texture' },
  { key: 'thunder', label: 'Storm', group: 'Precipitation & wind', default: 0, hint: 'Storm darkness and distant lightning; thunder when sound is on' },
].map(Object.freeze));

export function normalizeWeatherParameters(values = {}, defaults = {}) {
  return Object.fromEntries(WEATHER_PARAMETERS.map((parameter) => {
    const fallback = Number.isFinite(defaults[parameter.key]) ? defaults[parameter.key] : parameter.default;
    const value = Number.isFinite(values[parameter.key]) ? values[parameter.key] : fallback;
    return [parameter.key, Math.min(1, Math.max(0, value))];
  }));
}

export function weatherParameters(conditions) {
  return normalizeWeatherParameters({
    ...conditions,
    sun: conditions.sunStrength,
    moon: conditions.moonStrength,
    visibility: 1 - conditions.fog,
  });
}

// Keep the starting sun/moon positions and lunar phase. Every parameter is independent:
// changing cloud cover does not silently overwrite a manually chosen sun value.
export function composeWeatherConditions(base, values) {
  const p = normalizeWeatherParameters(values, weatherParameters(base));
  const moonAltitude = base.moonAltitude ?? Math.asin(base.moonDirection?.[1] || 0) * 180 / Math.PI;
  const moonHorizon = Math.min(1, Math.max(0, (moonAltitude + 0.6) / 0.8));
  const conditions = {
    ...base,
    daylight: p.daylight, sunStrength: p.sun, moonStrength: p.moon, twilight: p.twilight,
    moonDiskStrength: moonHorizon * moonHorizon * (3 - 2 * moonHorizon) * (1 - p.cloud * 0.95) * (0.1 + p.visibility * 0.9) * (1 - p.thunder * 0.8) * (0.2 + (1 - p.daylight) * 0.8),
    cloud: p.cloud, fog: 1 - p.visibility,
    rain: p.rain, snow: p.snow, ice: p.ice, drizzle: p.drizzle, wind: p.wind, thunder: p.thunder,
    ambient: (0.16 + p.daylight * 0.84) * (1 - p.cloud * 0.3),
  };
  return { ...conditions, ...underwaterConditions(p) };
}
