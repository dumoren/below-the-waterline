import test from 'node:test';
import assert from 'node:assert/strict';
import { underwaterConditions, UNDERWATER_SCALARS } from '../src/underwater-environment.js';
import { normalizeWeatherParameters, weatherParameters, composeWeatherConditions } from '../src/weather-parameters.js';
import { previewConditions, WEATHER_PRESETS, decodeWeather, sceneConditions } from '../src/environment.js';

const weather = (overrides = {}) => normalizeWeatherParameters({ cloud: 0, wind: 0, ...overrides });

test('clear sunlight, overcast and moonlight give different underwater light', () => {
  const clear = previewConditions('clear');
  const overcast = previewConditions('overcast');
  const moon = previewConditions('moonlight');
  assert.ok(clear.waterLight > overcast.waterLight * 2);
  assert.ok(clear.waterShafts > overcast.waterShafts * 10);
  assert.ok(clear.waterCaustics > overcast.waterCaustics * 10);
  assert.ok(moon.waterLight > 0 && moon.waterLight < overcast.waterLight);
  assert.ok(moon.waterDirect > 0 && moon.waterShafts > 0);
  const dark = underwaterConditions(weather({ daylight: 0, sun: 0, moon: 0 }));
  assert.equal(dark.waterShafts, 0); assert.equal(dark.waterCaustics, 0);
  assert.ok(moon.waterLight > dark.waterLight);
});

test('fog and cloud soften incoming light without making calm water stormy', () => {
  const clear = underwaterConditions(weather());
  for (const p of [weather({ visibility: 0 }), weather({ cloud: 1 })]) {
    const dimmed = underwaterConditions(p);
    assert.ok(dimmed.waterLight < clear.waterLight);
    assert.ok(dimmed.waterShafts < clear.waterShafts);
    assert.equal(dimmed.waterTurbidity, clear.waterTurbidity);
    assert.equal(dimmed.waterMotion, clear.waterMotion);
    assert.equal(dimmed.waterParticles, clear.waterParticles);
  }
});

test('wind, rain and ice create a mixed underwater disturbance, while drizzle is gentler', () => {
  const calm = underwaterConditions(weather());
  for (const overrides of [{ wind: 1 }, { rain: 1 }, { ice: 1 }, { thunder: 1 }]) {
    const disturbed = underwaterConditions(weather(overrides));
    assert.ok(disturbed.waterMotion > calm.waterMotion);
    assert.ok(disturbed.waterTurbidity > calm.waterTurbidity);
    assert.ok(disturbed.waterParticles > calm.waterParticles);
  }
  const rain = underwaterConditions(weather({ rain: 0.6 }));
  const drizzle = underwaterConditions(weather({ rain: 0.6, drizzle: 1 }));
  assert.ok(drizzle.waterMotion < rain.waterMotion);
  const combined = underwaterConditions(weather({ rain: 0.6, snow: 0.4, ice: 0.3, wind: 0.7 }));
  assert.ok(combined.waterParticles > rain.waterParticles);
  assert.ok(combined.waterTurbidity > rain.waterTurbidity);
});

test('twilight warms the transmitted light and winter precipitation shifts it towards blue', () => {
  const clear = underwaterConditions(weather());
  const warm = underwaterConditions(weather({ twilight: 1 }));
  const snow = underwaterConditions(weather({ snow: 1, ice: 0.3 }));
  assert.ok(warm.waterTint[0] > clear.waterTint[0]);
  assert.ok(snow.waterTint[2] / snow.waterTint[0] > clear.waterTint[2] / clear.waterTint[0]);
});

test('live observations, every preset and custom knobs share the underwater mapping', () => {
  const live = sceneConditions(new Date('2026-10-15T12:00:00-02:30'), decodeWeather({
    cloud_cover: 60, weather_code: 63, precipitation: 0.5, rain: 0.5, showers: 0,
    snowfall: 0, visibility: 8000, wind_speed_10m: 40, interval: 900,
  }));
  const states = [live, ...WEATHER_PRESETS.map(({ id }) => previewConditions(id))];
  for (const state of states) {
    const expected = underwaterConditions(weatherParameters(state));
    for (const key of [...UNDERWATER_SCALARS, 'waterTint']) assert.deepEqual(state[key], expected[key]);
  }
  const base = previewConditions('sunset');
  const custom = composeWeatherConditions(base, { cloud: 1, rain: 1, wind: 1, sun: 0 });
  assert.ok(custom.waterShafts < base.waterShafts);
  assert.ok(custom.waterTurbidity > base.waterTurbidity);
  assert.deepEqual(custom.sunDirection, base.sunDirection);
  // Labels have no influence on the underwater result.
  const renamed = composeWeatherConditions({ ...base, label: 'A different name' }, weatherParameters(base));
  for (const key of UNDERWATER_SCALARS) assert.equal(renamed[key], base[key]);
});

test('extreme combinations remain bounded and gradual knob changes stay continuous', () => {
  const keys = ['daylight', 'sun', 'moon', 'twilight', 'cloud', 'visibility', 'rain', 'snow', 'ice', 'drizzle', 'wind', 'thunder'];
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const parameters = Object.fromEntries(keys.map((key, index) => [key, (mask >> index) & 1]));
    const state = underwaterConditions(parameters);
    for (const key of UNDERWATER_SCALARS) assert.ok(Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1, key);
    assert.ok(state.waterTint.every((value) => Number.isFinite(value) && value > 0 && value < 2));
  }
  for (const key of keys) {
    const before = underwaterConditions(weather({ [key]: 0.5 }));
    const after = underwaterConditions(weather({ [key]: 0.501 }));
    for (const output of UNDERWATER_SCALARS) assert.ok(Math.abs(after[output] - before[output]) < 0.003, `${key}: ${output}`);
  }
});
