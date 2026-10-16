import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneConditions, decodeWeather, fetchStJohnsWeather, ST_JOHNS, stJohnsTime, WEATHER_PRESETS, previewConditions, stormGlow } from '../src/environment.js';

const clear = decodeWeather({ cloud_cover: 0, precipitation: 0, weather_code: 0, wind_speed_10m: 5 });

test('11:23 pm in St John’s has no sunlight; local noon has sunlight', () => {
  const night = sceneConditions(new Date('2026-10-15T23:23:00-02:30'), clear);
  const day = sceneConditions(new Date('2026-10-15T12:00:00-02:30'), clear);
  assert.equal(night.period, 'Night');
  assert.equal(night.daylight, 0); assert.equal(night.sunStrength, 0);
  assert.equal(day.period, 'Day'); assert.ok(day.sunStrength > 0.9);
  assert.ok(day.ambient > night.ambient * 4);
});

test('St John’s lighting follows its seasons and ignores the viewer’s time zone', () => {
  const summer = sceneConditions(new Date('2026-06-21T21:00:00Z'), clear);
  const winter = sceneConditions(new Date('2026-12-21T21:00:00Z'), clear);
  assert.ok(summer.sunStrength > 0);
  assert.equal(winter.sunStrength, 0);
  const normal = new Date('2026-10-16T01:53:00Z');
  const elsewhere = new Date(normal);
  elsewhere.getTimezoneOffset = () => { throw new Error('viewer timezone must not be consulted'); };
  elsewhere.getHours = () => { throw new Error('viewer clock must not be consulted'); };
  assert.deepEqual(sceneConditions(normal, clear), sceneConditions(elsewhere, clear));
  assert.equal(sceneConditions(elsewhere).period, 'Night');
});

test('St John’s clock handles Newfoundland’s half-hour offset and daylight saving time', () => {
  assert.equal(ST_JOHNS.timeZone, 'America/St_Johns');
  assert.match(stJohnsTime(new Date('2026-07-15T14:30:00Z')), /^12:00/);
  assert.match(stJohnsTime(new Date('2026-01-15T15:30:00Z')), /^12:00/);
});

test('moonlight needs a moon above the horizon and clear enough skies', () => {
  let brightest;
  for (let day = 1; day <= 28; day++) {
    const date = new Date(`2026-10-${String(day).padStart(2, '0')}T23:00:00-02:30`);
    const result = sceneConditions(date, clear);
    if (!brightest || result.moonStrength > brightest.value.moonStrength) brightest = { date, value: result };
    if (result.moonDirection[1] < 0) assert.equal(result.moonStrength, 0);
  }
  assert.ok(brightest.value.moonStrength > 0.7);
  const cloudy = sceneConditions(brightest.date, { ...clear, cloud: 1 });
  assert.ok(cloudy.moonStrength < brightest.value.moonStrength * 0.1);
  for (const dir of [brightest.value.sunDirection, brightest.value.moonDirection]) assert.ok(Math.abs(Math.hypot(...dir) - 1) < 1e-10);
});

test('rain, snow, fog and overcast produce different conditions; invalid data is rejected', () => {
  const current = { cloud_cover: 100, precipitation: 2, weather_code: 63, wind_speed_10m: 30 };
  assert.ok(decodeWeather(current).rain > 0);
  const snow = decodeWeather({ ...current, weather_code: 73 });
  assert.equal(snow.rain, 0); assert.ok(snow.snow > 0);
  assert.equal(decodeWeather({ ...current, weather_code: 45, precipitation: 0 }).fog, 0.85);
  assert.equal(decodeWeather({ ...current, weather_code: 3, precipitation: 0 }).description, 'Overcast');
  assert.throws(() => decodeWeather(null));
  assert.throws(() => decodeWeather({ ...current, cloud_cover: null }));
  const day = new Date('2026-10-15T12:00:00-02:30');
  assert.ok(sceneConditions(day, decodeWeather({ ...current, weather_code: 3 })).sunStrength < sceneConditions(day, clear).sunStrength * 0.1);
});

test('weather requests always use St John’s and omit credentials/referrer; failures stay explicit', async () => {
  let seen;
  const fetcher = async (url, options) => {
    seen = { url, options };
    return { ok: true, json: async () => ({ current: { cloud_cover: 15, precipitation: 0, weather_code: 0, wind_speed_10m: 10 } }) };
  };
  await fetchStJohnsWeather({ fetcher });
  assert.equal(seen.url.searchParams.get('latitude'), '47.56');
  assert.equal(seen.url.searchParams.get('longitude'), '-52.71');
  assert.equal(seen.options.credentials, 'omit'); assert.equal(seen.options.referrerPolicy, 'no-referrer');
  await assert.rejects(fetchStJohnsWeather({ fetcher: async () => ({ ok: false }) }));
  await assert.rejects(fetchStJohnsWeather({ fetcher: async () => { throw new Error('offline'); } }));
});

test('all eighteen previews are finite and weather families have distinct effects', () => {
  assert.equal(WEATHER_PRESETS.length, 18);
  assert.equal(new Set(WEATHER_PRESETS.map((p) => p.id)).size, 18);
  for (const { id } of WEATHER_PRESETS) {
    const state = previewConditions(id);
    for (const value of Object.values(state)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), id);
      if (Array.isArray(value)) assert.ok(value.every(Number.isFinite), id);
    }
  }
  assert.equal(previewConditions('unknown'), null);
  assert.ok(previewConditions('blizzard').snow > previewConditions('flurries').snow);
  assert.ok(previewConditions('fog').fog > previewConditions('mist').fog);
  assert.ok(previewConditions('downpour').rain > previewConditions('drizzle').rain);
  assert.ok(previewConditions('thunderstorm').thunder > 0);
  const sleet = previewConditions('sleet');
  assert.ok(sleet.rain > 0 && sleet.snow > 0 && sleet.ice > 0);
});

test('live weather distinguishes drizzle, heavy rain, freezing rain and hail codes', () => {
  const current = { cloud_cover: 100, precipitation: 0.2, wind_speed_10m: 12 };
  assert.equal(decodeWeather({ ...current, weather_code: 51 }).description, 'Drizzle');
  assert.equal(decodeWeather({ ...current, weather_code: 65 }).description, 'Heavy rain');
  assert.ok(decodeWeather({ ...current, weather_code: 67 }).ice > 0);
  const hail = decodeWeather({ ...current, weather_code: 99 });
  assert.ok(hail.ice > 0 && hail.thunder > 0 && hail.rain > 0);
  assert.equal(decodeWeather({ ...current, weather_code: 73, wind_speed_10m: 65 }).description, 'Blowing snow');
});

test('storm glow is slow, bounded, and disabled by reduced motion', () => {
  for (let t = 0; t < 60; t += 0.1) {
    assert.equal(stormGlow(t, 1, true), 0);
    assert.equal(stormGlow(t, 0), 0);
    assert.ok(stormGlow(t, 1) >= 0 && stormGlow(t, 1) <= 0.32);
    assert.ok(Math.abs(stormGlow(t, 1) - stormGlow(t + 0.1, 1)) < 0.05);
  }
});

test('composed conditions retain astronomy while blending independent weather elements', () => {
  const sunset = previewConditions('sunset');
  const showers = previewConditions('sunset-showers');
  assert.deepEqual(showers.sunDirection, sunset.sunDirection);
  assert.ok(showers.twilight > 0 && showers.rain > 0 && showers.wind > 0);
  assert.ok(showers.sunStrength < sunset.sunStrength);
  const clearMoon = previewConditions('moonlight');
  const snowyMoon = previewConditions('moonlit-flurries');
  assert.deepEqual(snowyMoon.moonDirection, clearMoon.moonDirection);
  assert.ok(snowyMoon.snow > 0 && snowyMoon.moonStrength > 0);
  assert.ok(snowyMoon.moonStrength < clearMoon.moonStrength);
});
