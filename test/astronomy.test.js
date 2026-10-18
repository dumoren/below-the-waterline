import assert from 'node:assert/strict';
import { test } from 'node:test';
import { astronomicalConditions, localSkyTime, skyInstant, skyEvents, solarPhase } from '../src/astronomy.js';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('true positions, lunar phase and sea-level events agree with independent USNO reference data', () => {
  // USNO API, retrieved 2026-10-17; 47.56 N, 52.71 W, UTC-02:30.
  // https://aa.usno.navy.mil/api/rstt/oneday?date=2026-10-17&coords=47.56,-52.71&tz=-2.5
  // https://aa.usno.navy.mil/api/celnav?date=2026-10-17&time=20:39:00&coords=47.56,-52.71
  const sky = astronomicalConditions(new Date('2026-10-17T20:39:00Z'));
  assert.ok(Math.abs(sky.sunAzimuth - 256.778856) < 0.01);
  assert.ok(Math.abs(sky.sunGeometricAltitude - -0.822) < 0.01);
  assert.ok(Math.abs(sky.moonAzimuth - 176.247108) < 0.01);
  // Convert USNO geocentric altitude to apparent topocentric altitude:
  assert.ok(Math.abs(sky.moonAltitude - (16.403958 - 0.868883 + 0.059185)) < 0.02);
  assert.ok(Math.abs(sky.moonFraction - 0.42) < 0.005);
  const events = skyEvents('2026-10-17');
  for (const [key, clock] of Object.entries({ sunrise: '07:23', sunset: '18:09', dawn: '06:51', dusk: '18:40', moonrise: '14:29', moonset: '22:27' })) {
    const [hour, minute] = clock.split(':').map(Number);
    assert.ok(Math.abs(localSkyTime(events[key]).minutes - (hour * 60 + minute)) < 1.1, key);
  }
});

test('the ephemeris keeps independent lunar motion and stays continuous through midnight', () => {
  const first = Number(skyInstant('2026-10-17', 0));
  const dayAfter = first + 86400000;
  assert.equal(localSkyTime(dayAfter).date, '2026-10-18');
  const a = astronomicalConditions(new Date(first));
  const b = astronomicalConditions(new Date(dayAfter));
  assert.ok(distance(a.moonDirection, b.moonDirection) > 0.05);
  const before = astronomicalConditions(new Date(dayAfter - 1000));
  const after = astronomicalConditions(new Date(dayAfter + 1000));
  assert.ok(distance(before.moonDirection, after.moonDirection) < 0.001);
  for (let minute = 0; minute < 1440; minute += 15) {
    const sky = astronomicalConditions(skyInstant('2026-10-17', minute));
    for (const key of ['sunDirection', 'moonDirection']) assert.ok(Math.abs(Math.hypot(...sky[key]) - 1) < 1e-10);
  }
  const midnight = astronomicalConditions(skyInstant('2026-10-17', 0));
  assert.equal(midnight.sunStrength, 0);
  assert.equal(midnight.moonStrength, 0); // The waxing crescent has already set.
});

test('Newfoundland wall-clock conversion respects half-hour offsets and both DST boundaries', () => {
  assert.equal(skyInstant('2026-07-15', 720).toISOString(), '2026-07-15T14:30:00.000Z');
  assert.equal(skyInstant('2026-01-15', 720).toISOString(), '2026-01-15T15:30:00.000Z');
  const repeated = skyInstant('2026-11-01', 90);
  assert.equal(repeated.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(localSkyTime(Number(repeated) + 3600000).minutes, 90);
  const missing = skyInstant('2026-03-08', 150);
  assert.equal(localSkyTime(missing).minutes, 210);
});

test('holding a weather mix changes its lighting through the day without losing its precipitation', () => {
  const weather = { cloud: 0.5, rain: 0.3, snow: 0.15, wind: 0.4, visibility: 0.7 };
  const day = astronomicalConditions(skyInstant('2026-10-26', 720), weather), night = astronomicalConditions(skyInstant('2026-10-26', 0), weather);
  for (const key of ['cloud', 'rain', 'snow', 'wind', 'fog']) assert.equal(day[key], night[key]);
  assert.ok(day.waterLight > night.waterLight);
  assert.ok(day.sunStrength > 0 && night.sunStrength === 0);
  assert.ok(night.moonStrength > 0 && day.moonStrength === 0);
  assert.ok(astronomicalConditions(skyInstant('2026-10-26', 720), { cloud: 1 }).sunStrength < day.sunStrength * 0.2);
});

test('solar phases and the warm horizon tint match daylight and twilight', () => {
  assert.equal(solarPhase(-5, true), 'Blue hour');
  assert.equal(solarPhase(-0.8, true), 'Sunrise'); assert.equal(solarPhase(-0.8, false), 'Sunset');
  assert.equal(solarPhase(20, true), 'Daylight'); assert.equal(solarPhase(-20, false), 'Night');
  const blueHour = astronomicalConditions(skyInstant('2026-10-17', 1110));
  assert.equal(blueHour.solarPhase, 'Blue hour');
  assert.ok(blueHour.twilight < 0.05, 'the warm horizon tint has faded by blue hour');
});

test('the observer-relative lunar bright limb points toward the sun in waxing and waning phases', () => {
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const unit = (a) => a.map((value) => value / Math.hypot(...a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const at of ['2026-10-17T20:39:00Z', '2026-10-26T03:30:00Z', '2026-11-03T10:00:00Z', '2026-12-21T21:00:00Z']) {
    const sky = astronomicalConditions(new Date(at));
    const side = unit(cross([0, 1, 0], sky.moonDirection)), up = cross(sky.moonDirection, side);
    const towardSun = unit([dot(sky.sunDirection, side), dot(sky.sunDirection, up)]);
    const brightLimb = [Math.sin(sky.moonAngle), Math.cos(sky.moonAngle)];
    // The small residual includes refraction/parallax; a mirrored limb fails strongly.
    assert.ok(dot(towardSun, brightLimb) > Math.cos(Math.PI / 180), at);
  }
});
