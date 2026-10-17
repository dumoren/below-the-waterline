import { M_PER_UNIT, compassVector, SCENE_LOCATION } from './scene-scale.js';

export const WAVE_COUNT = 3;
export const WAVE_PHASES = Object.freeze([0, 1.7, 4.1]);
export const MAX_RENDER_WAVE_HEIGHT = 8; // metres; keep the dive and vessel usable in extreme seas
export const MARINE_MAX_AGE = 90 * 60_000;
const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
const bearing = (value) => ((value % 360) + 360) % 360;

function component(current, prefix) {
  const height = current[`${prefix}_height`], period = current[`${prefix}_period`], direction = current[`${prefix}_direction`];
  if (height === 0) return { height: 0, period: Number.isFinite(period) && period > 0 ? period : 6, direction: Number.isFinite(direction) ? bearing(direction) : 0 };
  return Number.isFinite(height) && height >= 0 && Number.isFinite(period) && period > 0 && Number.isFinite(direction)
    ? { height, period, direction: bearing(direction) } : null;
}

export function decodeMarine(data, now = Date.now()) {
  const current = data?.current;
  if (!current || !Number.isFinite(current.wave_height) || current.wave_height < 0 || !Number.isFinite(current.time)) throw new Error('Marine data is incomplete');
  if (data.current_units?.wave_height && data.current_units.wave_height !== 'm') throw new Error('Marine wave units must be metres');
  const validAt = current.time * 1000;
  if (now - validAt > MARINE_MAX_AGE || validAt - now > 15 * 60_000) throw new Error('Marine data is out of date');
  const waves = component(current, 'wave');
  if (!waves && current.wave_height > 0) throw new Error('Marine wave period/direction is unavailable');
  const velocityUnit = data.current_units?.ocean_current_velocity ?? 'km/h';
  const conversion = { 'km/h': 1, 'm/s': 3.6, mph: 1.609344, kn: 1.852 }[velocityUnit];
  const speed = current.ocean_current_velocity, direction = current.ocean_current_direction;
  const hasCurrent = Number.isFinite(speed) && speed >= 0 && (speed === 0 || Number.isFinite(direction)) && Number.isFinite(conversion);
  return {
    waves: waves || { height: 0, period: 6, direction: 0 },
    swell: component(current, 'swell_wave'), windWaves: component(current, 'wind_wave'),
    current: hasCurrent ? { speed: speed * conversion, direction: Number.isFinite(direction) ? bearing(direction) : 0 } : null,
    validAt,
    latitude: Number.isFinite(data.latitude) ? data.latitude : null,
    longitude: Number.isFinite(data.longitude) ? data.longitude : null,
  };
}

export async function fetchStJohnsMarine({ signal, fetcher = fetch, now = Date.now() } = {}) {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.search = new URLSearchParams({
    latitude: SCENE_LOCATION.latitude.toFixed(2), longitude: SCENE_LOCATION.longitude.toFixed(2), cell_selection: 'sea', length_unit: 'metric', timeformat: 'unixtime', forecast_days: '1',
    current: 'wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,ocean_current_velocity,ocean_current_direction',
  });
  const response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Marine data is unavailable');
  return decodeMarine(await response.json(), now);
}

export function illustrativeSea(conditions) {
  const wind = clamp(conditions.wind ?? 0.15), rain = clamp(conditions.rain ?? 0);
  const height = 0.2 + wind * wind * 4 + rain * 0.35;
  return {
    waves: { height, period: 4 + wind * 4, direction: 35 },
    swell: { height: height * 0.75, period: 6 + wind * 5, direction: 20 },
    windWaves: { height: height * 0.5, period: 2 + wind * 3, direction: 65 },
    current: null,
  };
}

/** Three directional sine components with Hs = 4 × RMS surface elevation.
 * Wavelength follows deep-water dispersion; metres are converted to scene units.
 * Components describe propagation TO, while the API reports wave direction FROM.
 */
export function marineWaves(marine) {
  const total = marine.waves;
  const components = [marine.swell || { ...total, height: total.height * 0.8 }, marine.windWaves || { ...total, height: total.height * 0.4, period: total.period * 0.65 }, { ...total, height: total.height * 0.2, direction: total.direction + 25, period: total.period * 0.8 }];
  const length = Math.hypot(...components.map((wave) => wave.height));
  const amplitude = Math.min(total.height, MAX_RENDER_WAVE_HEIGHT) / (Math.sqrt(8) * M_PER_UNIT);
  return components.map((wave) => {
    const omega = 2 * Math.PI / clamp(wave.period, 1, 30);
    const k = omega * omega / 9.81 * M_PER_UNIT;
    const direction = compassVector(wave.direction, true);
    return [direction[0] * k, direction[1] * k, length > 0 ? wave.height / length * amplitude : 0, omega];
  });
}

export const DEFAULT_WAVES = Object.freeze(marineWaves(illustrativeSea({ wind: 0.15 })).map(Object.freeze));

export function composeMarineEnvironment(conditions, marine = null) {
  const state = marine || illustrativeSea(conditions);
  const energy = clamp(state.waves.height / 6);
  const current = state.current ? compassVector(state.current.direction).map((value) => value * state.current.speed / 3.6 / M_PER_UNIT) : [0, 0];
  return {
    ...conditions,
    seaEnergy: energy,
    waterMotion: clamp(conditions.waterMotion * 0.65 + energy * 0.35),
    waterParticles: clamp(conditions.waterParticles * 0.85 + energy * 0.15),
    sea: { source: marine ? 'model' : 'weather', data: state, waves: marineWaves(state), current, limited: state.waves.height > MAX_RENDER_WAVE_HEIGHT },
  };
}

const at = (vector, index) => vector.getComponent ? vector.getComponent(index) : vector[index];
export function waterHeight(x, z, waves = DEFAULT_WAVES, phases = WAVE_PHASES) {
  let height = 0;
  for (let i = 0; i < WAVE_COUNT; i++) height += Math.sin(at(waves[i], 0) * x + at(waves[i], 1) * z - at(phases, i)) * at(waves[i], 2);
  return height;
}
export function waterSlope(x, z, waves = DEFAULT_WAVES, phases = WAVE_PHASES) {
  const slope = [0, 0];
  for (let i = 0; i < WAVE_COUNT; i++) {
    const wave = waves[i], scale = Math.cos(at(wave, 0) * x + at(wave, 1) * z - at(phases, i)) * at(wave, 2);
    slope[0] += at(wave, 0) * scale; slope[1] += at(wave, 1) * scale;
  }
  return slope;
}
