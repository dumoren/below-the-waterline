import { getPosition, getMoonPosition, getMoonIllumination, getTimes, getMoonTimes } from 'suncalc';
import { composeWeatherConditions, normalizeWeatherParameters } from './weather-parameters.js';
import { SCENE_LOCATION, SCENE_WEST } from './scene-scale.js';

const RAD = Math.PI / 180;
const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
const localFormat = new Intl.DateTimeFormat('en-CA', { timeZone: SCENE_LOCATION.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const wallValue = (p) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

export function localSkyTime(instant = new Date()) {
  const p = Object.fromEntries(localFormat.formatToParts(new Date(instant)).filter((v) => v.type !== 'literal').map((v) => [v.type, v.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60, offset: (wallValue(p) - Math.floor(Number(new Date(instant)) / 1000) * 1000) / 60000 };
}

// IANA-zone conversion, including Newfoundland's half-hour offset and DST.
// Repeated wall times choose the earlier instant; missing wall times move forward.
export function skyInstant(date, minutes = 0) {
  const [year, month, day] = date.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, day) + minutes * 60000;
  if (!Number.isFinite(wall)) throw new RangeError('Invalid sky date');
  const offsets = new Set([-86400000, 0, 86400000].map((d) => localSkyTime(wall + d).offset));
  const candidates = [...offsets].map((offset) => wall - offset * 60000).sort((a, b) => a - b);
  const match = candidates.find((at) => Math.abs(at + localSkyTime(at).offset * 60000 - wall) < 1000);
  if (match !== undefined) return new Date(match);
  return new Date(candidates.filter((at) => at + localSkyTime(at).offset * 60000 >= wall).sort((a, b) => a - b)[0]);
}

export function celestialDirection(azimuth, altitude) {
  const a = SCENE_WEST + (azimuth - 270) * RAD, h = altitude * RAD;
  return [Math.cos(a) * Math.cos(h), Math.sin(h), Math.sin(a) * Math.cos(h)];
}

export function solarPhase(altitude, rising) {
  return altitude < -18 ? 'Night' : altitude < -12 ? 'Astronomical twilight' : altitude < -6 ? 'Nautical twilight' : altitude < -4 ? 'Blue hour' : altitude < -0.9 ? (rising ? 'Dawn' : 'Dusk') : altitude < -0.3 ? (rising ? 'Sunrise' : 'Sunset') : altitude < 6 ? 'Golden hour' : 'Daylight';
}

export function geometricSolarAltitude(apparent) {
  let geometric = apparent;
  for (let i = 0; i < 6; i++) {
    const h = Math.max(0, geometric) * RAD;
    geometric = apparent - (0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179))) / RAD;
  }
  return geometric;
}

export function astronomicalConditions(date = new Date(), weather = null) {
  const { latitude, longitude } = SCENE_LOCATION;
  const sun = getPosition(date, latitude, longitude);
  const moon = getMoonPosition(date, latitude, longitude);
  const illumination = getMoonIllumination(date);
  const solarAltitude = geometricSolarAltitude(sun.altitude);
  const p = normalizeWeatherParameters({ ...weather, visibility: weather?.visibility ?? 1 - (weather?.fog ?? 0) });
  const daylight = smooth(-6, 14, solarAltitude);
  const sunlight = smooth(-0.8, 2, sun.altitude) * (Number.isFinite(weather?.sun) ? p.sun : 1 - p.cloud * 0.92);
  const moonlight = smooth(-0.3, 3, moon.altitude) * (1 - daylight) * illumination.fraction * (1 - p.cloud * 0.94);
  // This control is the warm horizon tint, not all twilight illumination.
  // Let blue hour cool before civil twilight ends instead of leaving an orange sky.
  const twilight = smooth(-4, -1, solarAltitude) * (1 - smooth(0, 10, solarAltitude));
  const rising = getPosition(new Date(Number(date) + 60000), latitude, longitude).altitude > sun.altitude;
  return composeWeatherConditions({
    sunDirection: celestialDirection(sun.azimuth, sun.altitude), moonDirection: celestialDirection(moon.azimuth, moon.altitude),
    sunAltitude: sun.altitude, sunGeometricAltitude: solarAltitude, moonAltitude: moon.altitude, sunAzimuth: sun.azimuth, moonAzimuth: moon.azimuth,
    sunElevation: Math.sin(sun.altitude * RAD), sunAngularRadius: 0.00465, moonAngularRadius: Math.asin(1737.4 / moon.distance),
    moonFraction: illumination.fraction, moonAngle: (illumination.angle - moon.parallacticAngle) * RAD,
    moonWaxing: illumination.waxing ? 1 : -1,
    period: sun.altitude > 0 ? 'Day' : sun.altitude > -12 ? 'Twilight' : 'Night',
    solarPhase: solarPhase(solarAltitude, rising),
  }, { ...p, daylight, sun: sunlight, moon: moonlight, twilight });
}

export function skyEvents(date) {
  const instant = skyInstant(date, 720), { latitude, longitude } = SCENE_LOCATION;
  const { offset } = localSkyTime(instant);
  const sun = getTimes(instant, latitude, longitude, 0, offset);
  const moon = getMoonTimes(instant, latitude, longitude, offset);
  return { sunrise: sun.sunrise, sunset: sun.sunset, dawn: sun.dawn, dusk: sun.dusk, moonrise: moon.rise, moonset: moon.set };
}
