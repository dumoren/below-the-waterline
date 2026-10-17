import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { decodeMarine, fetchStJohnsMarine, marineWaves, illustrativeSea, composeMarineEnvironment, waterHeight, waterSlope, WAVE_PHASES, MAX_RENDER_WAVE_HEIGHT, MARINE_MAX_AGE } from '../src/marine-environment.js';
import { M_PER_UNIT, compassVector } from '../src/scene-scale.js';
import { previewConditions } from '../src/environment.js';

const now = Date.parse('2026-10-17T00:00:00Z');
const example = (overrides = {}) => ({
  latitude: 47.541664, longitude: -52.624992,
  current_units: { wave_height: 'm', ocean_current_velocity: 'km/h' },
  current: { time: now / 1000, wave_height: 1.26, wave_direction: 30, wave_period: 9.9,
    swell_wave_height: 1.02, swell_wave_direction: 14, swell_wave_period: 9.55,
    wind_wave_height: 0.14, wind_wave_direction: 259, wind_wave_period: 1.7,
    ocean_current_velocity: 0.4, ocean_current_direction: 0, ...overrides },
});

test('marine decoding retains physical units, model time and selected offshore cell', () => {
  const data = decodeMarine(example(), now);
  assert.deepEqual(data.waves, { height: 1.26, period: 9.9, direction: 30 });
  assert.equal(data.swell.period, 9.55); assert.equal(data.windWaves.direction, 259);
  assert.deepEqual(data.current, { speed: 0.4, direction: 0 });
  assert.equal(data.validAt, now); assert.equal(data.latitude, 47.541664);
  const ms = example(); ms.current_units.ocean_current_velocity = 'm/s';
  assert.ok(Math.abs(decodeMarine(ms, now).current.speed - 1.44) < 1e-10);
});

test('missing current/partition fields remain optional; reported calm seas stay flat', () => {
  const data = decodeMarine(example({ swell_wave_height: null, wind_wave_height: null, ocean_current_velocity: null }), now);
  assert.equal(data.swell, null); assert.equal(data.windWaves, null); assert.equal(data.current, null);
  assert.ok(marineWaves(data).flat().every(Number.isFinite));
  const calm = decodeMarine(example({ wave_height: 0, wave_period: 0, wave_direction: null, swell_wave_height: 0, swell_wave_period: 0, wind_wave_height: 0, wind_wave_period: 0 }), now);
  assert.ok(marineWaves(calm).every((wave) => wave[2] === 0));
  assert.equal(waterHeight(9, -14, marineWaves(calm)), 0);
  const noChop = decodeMarine(example({ wind_wave_height: 0, wind_wave_period: 0 }), now);
  assert.equal(marineWaves(noChop)[1][2], 0);
});

test('stale, future, incomplete and incompatible marine responses are rejected', () => {
  for (const value of [null, {}, example({ wave_height: null }), example({ wave_height: -1 }), example({ wave_period: null }), example({ time: (now - MARINE_MAX_AGE - 1) / 1000 }), example({ time: (now + 16 * 60_000) / 1000 })]) assert.throws(() => decodeMarine(value, now));
  const imperial = example(); imperial.current_units.wave_height = 'ft';
  assert.throws(() => decodeMarine(imperial, now));
});

test('marine requests fixed St John’s coordinates, sea cells, explicit units and safe fetch options', async () => {
  const result = await fetchStJohnsMarine({ now, fetcher: async (url, options) => {
    assert.equal(url.origin, 'https://marine-api.open-meteo.com');
    assert.equal(url.searchParams.get('latitude'), '47.56'); assert.equal(url.searchParams.get('longitude'), '-52.71');
    assert.equal(url.searchParams.get('cell_selection'), 'sea'); assert.equal(url.searchParams.get('timeformat'), 'unixtime');
    assert.equal(url.searchParams.get('length_unit'), 'metric');
    const fields = url.searchParams.get('current').split(',');
    for (const field of ['wave_height', 'wave_direction', 'wave_period', 'swell_wave_height', 'wind_wave_period', 'ocean_current_velocity', 'ocean_current_direction']) assert.ok(fields.includes(field));
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    return { ok: true, json: async () => example() };
  } });
  assert.equal(result.waves.height, 1.26);
  await assert.rejects(fetchStJohnsMarine({ now, fetcher: async () => ({ ok: false }) }));
  await assert.rejects(fetchStJohnsMarine({ now, fetcher: async () => { throw new Error('offline'); } }));
});

test('wave bearings propagate away from the source; current bearings point toward the flow', () => {
  const data = decodeMarine(example({ wave_direction: 0, swell_wave_direction: 0, ocean_current_direction: 0 }), now);
  const wave = marineWaves(data)[0], north = compassVector(0);
  assert.ok(wave[0] * north[0] + wave[1] * north[1] < 0);
  const scene = composeMarineEnvironment(previewConditions('clear'), data);
  const current = scene.sea.current;
  assert.ok(current[0] * north[0] + current[1] * north[1] > 0);
  assert.ok(Math.abs(Math.hypot(...current) * M_PER_UNIT * 3.6 - 0.4) < 1e-10);
});

test('wave spectrum matches significant height and deep-water periods; extreme seas are bounded', () => {
  for (const height of [0, 0.2, 1.26, 5, 20]) {
    const waves = marineWaves(decodeMarine(example({ wave_height: height }), now));
    const significant = Math.sqrt(8 * waves.reduce((sum, wave) => sum + wave[2] ** 2, 0)) * M_PER_UNIT;
    assert.ok(Math.abs(significant - Math.min(height, MAX_RENDER_WAVE_HEIGHT)) < 1e-10);
    assert.ok(waves.flat().every(Number.isFinite));
    for (const wave of waves) assert.ok(Math.abs(Math.hypot(wave[0], wave[1]) - wave[3] ** 2 / 9.81 * M_PER_UNIT) < 1e-10);
  }
});

test('CPU surface slopes match height gradients for the shared boat/camera wave uniforms', () => {
  const waves = marineWaves(decodeMarine(example(), now));
  const gpuWaves = waves.map((wave) => new THREE.Vector4(...wave));
  const phases = new THREE.Vector3(...WAVE_PHASES);
  for (let index = 0; index < 40; index++) {
    const x = index * 3.17 - 50, z = index * -1.32;
    const epsilon = 1e-4;
    assert.equal(waterHeight(x, z, waves), waterHeight(x, z, gpuWaves, phases));
    const slope = waterSlope(x, z, waves);
    assert.ok(Math.abs(slope[0] - (waterHeight(x + epsilon, z, waves) - waterHeight(x - epsilon, z, waves)) / (2 * epsilon)) < 1e-7);
    assert.ok(Math.abs(slope[1] - (waterHeight(x, z + epsilon, waves) - waterHeight(x, z - epsilon, waves)) / (2 * epsilon)) < 1e-7);
  }
});

test('live marine data drives motion; previews/fallback keep illustrative waves and estimated optics', () => {
  const sky = previewConditions('clear');
  const original = structuredClone(sky);
  const live = composeMarineEnvironment(sky, decodeMarine(example(), now));
  assert.equal(live.sea.source, 'model');
  assert.deepEqual(live.waterTint, sky.waterTint); assert.equal(live.waterTurbidity, sky.waterTurbidity);
  assert.notEqual(live.waterMotion, sky.waterMotion); assert.deepEqual(sky, original);
  const preview = composeMarineEnvironment(sky);
  assert.equal(preview.sea.source, 'weather'); assert.deepEqual(preview.sea.current, [0, 0]);
  assert.ok(illustrativeSea(previewConditions('thunderstorm')).waves.height > illustrativeSea(sky).waves.height);
  assert.equal(composeMarineEnvironment(sky, decodeMarine(example({ wave_height: 20 }), now)).sea.limited, true);
});
