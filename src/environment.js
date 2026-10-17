import { getPosition, getMoonPosition, getMoonIllumination } from 'suncalc';
import { CLEAR_VISIBILITY_METRES, normalizeWeatherParameters, weatherParameters, composeWeatherConditions } from './weather-parameters.js';
import { weatherControls } from './weather-controls.js';
import { SCENE_WEST, SCENE_LOCATION } from './scene-scale.js';
import { fetchStJohnsMarine, composeMarineEnvironment, MARINE_MAX_AGE } from './marine-environment.js';

const RAD = Math.PI / 180;
export const ST_JOHNS = SCENE_LOCATION;
const cityClock = new Intl.DateTimeFormat('en-CA', { timeZone: ST_JOHNS.timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export const stJohnsTime = (date = new Date()) => cityClock.format(date);
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
// Scene compass: the original sunset sits west of the opening view.
const WEST = SCENE_WEST;
function direction(azimuth, altitude) {
  const a = WEST + (azimuth - 270) * RAD, h = altitude * RAD;
  return [Math.cos(a) * Math.cos(h), Math.sin(h), Math.sin(a) * Math.cos(h)];
}

export function decodeWeather(current) {
  if (!current || ![current.cloud_cover, current.precipitation, current.wind_speed_10m, current.weather_code].every(Number.isFinite)) {
    throw new Error('Weather data is incomplete');
  }
  const code = current.weather_code;
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  const fog = code === 45 || code === 48;
  const drizzle = [51, 53, 55, 56, 57].includes(code);
  const freezing = [56, 57, 66, 67].includes(code);
  const thunder = code >= 95;
  const hail = code === 96 || code === 99;
  const wet = code >= 51 && !snow;
  const precipitation = clamp(current.precipitation / 4, 0, 1);
  const heavy = [65, 67, 75, 82, 86, 97, 99].includes(code);
  const wind = clamp(current.wind_speed_10m / 70);
  const intensity = Math.max(heavy ? 0.8 : drizzle ? 0.08 : 0.2, precipitation);
  const fallbackFog = fog ? (code === 48 ? 0.98 : 0.85) : snow && wind > 0.6 ? 0.6 : drizzle ? 0.22 : clamp(current.precipitation / 12, 0, 0.4);
  // Current precipitation totals cover `interval` seconds. Convert to hourly rates
  // before scaling visual intensity; missing optional observations retain WMO fallbacks.
  const rate = Number.isFinite(current.interval) && current.interval > 0 ? 3600 / current.interval : 1;
  const hasRain = Number.isFinite(current.rain) && Number.isFinite(current.showers);
  const visibility = Number.isFinite(current.visibility) ? clamp(current.visibility / CLEAR_VISIBILITY_METRES) : 1 - fallbackFog;
  return {
    cloud: clamp(current.cloud_cover / 100),
    rain: hasRain ? clamp((Math.max(0, current.rain) + Math.max(0, current.showers)) * rate / 4) : wet ? intensity : 0,
    snow: Number.isFinite(current.snowfall) ? clamp(Math.max(0, current.snowfall) * rate / 2) : snow ? intensity : 0,
    ice: hail ? (code === 99 ? 0.9 : 0.4) : freezing ? 0.25 : code === 77 ? 0.5 : 0,
    thunder: thunder ? 1 : 0,
    drizzle: drizzle ? 1 : 0,
    fog: 1 - visibility,
    visibility,
    ...(Number.isFinite(current.direct_normal_irradiance_instant) ? { sun: clamp(current.direct_normal_irradiance_instant / 1000) } : {}),
    wind,
    description: hail ? 'Thunder & hail' : thunder ? 'Thunderstorms' : freezing ? 'Freezing rain' : drizzle ? 'Drizzle' : snow && wind > 0.6 ? 'Blowing snow' : snow ? (heavy ? 'Heavy snow' : 'Snow flurries') : heavy ? 'Heavy rain' : wet ? 'Rain' : fog ? 'Fog' : code === 3 || current.cloud_cover > 85 ? 'Overcast' : code === 2 || current.cloud_cover > 35 ? 'Partly cloudy' : 'Clear',
  };
}

// Presets are examples made from the same independent controls as the live forecast.
export const WEATHER_PRESETS = [
  { id: 'clear', label: 'Clear daylight', group: 'Light & clouds', weather: { cloud: 0.04, wind: 0.12 } },
  { id: 'broken-clouds', label: 'Passing clouds', group: 'Light & clouds', weather: { cloud: 0.58, wind: 0.45 } },
  { id: 'overcast', label: 'Overcast', group: 'Light & clouds', weather: { cloud: 1, wind: 0.3 } },
  { id: 'sunrise', label: 'Sunrise', group: 'Light & clouds', at: '2026-10-15T07:25:00-02:30', weather: { cloud: 0.16, wind: 0.12 } },
  { id: 'sunset', label: 'Golden hour', group: 'Light & clouds', at: '2026-10-15T18:00:00-02:30', weather: { cloud: 0.15, wind: 0.12 } },
  { id: 'blue-hour', label: 'Blue hour', group: 'Light & clouds', at: '2026-10-15T18:35:00-02:30', weather: { cloud: 0.25, wind: 0.2 } },
  { id: 'moonlight', label: 'Moonlit night', group: 'Light & clouds', at: '2026-04-27T06:00:00Z', weather: { cloud: 0.04, wind: 0.12 } },
  { id: 'mist', label: 'Sea mist', group: 'Mist & fog', weather: { cloud: 0.55, fog: 0.42, wind: 0.12 } },
  { id: 'fog', label: 'Dense fog', group: 'Mist & fog', weather: { cloud: 1, fog: 0.98, wind: 0.1 } },
  { id: 'drizzle', label: 'Drizzle', group: 'Rain & storms', weather: { cloud: 0.93, rain: 0.2, drizzle: 1, fog: 0.27, wind: 0.2 } },
  { id: 'downpour', label: 'Heavy rain', group: 'Rain & storms', weather: { cloud: 1, rain: 1, fog: 0.18, wind: 0.7 } },
  { id: 'thunderstorm', label: 'Thunderstorm', group: 'Rain & storms', at: '2026-10-15T18:35:00-02:30', weather: { cloud: 1, rain: 0.85, thunder: 1, fog: 0.15, wind: 0.85 } },
  { id: 'hail', label: 'Hailstorm', group: 'Rain & storms', weather: { cloud: 1, rain: 0.45, ice: 1, thunder: 0.6, fog: 0.18, wind: 0.8 } },
  { id: 'flurries', label: 'Snow flurries', group: 'Winter', weather: { cloud: 0.7, snow: 0.35, fog: 0.08, wind: 0.2 } },
  { id: 'sleet', label: 'Sleet', group: 'Winter', weather: { cloud: 1, rain: 0.5, snow: 0.2, ice: 0.6, fog: 0.24, wind: 0.55 } },
  { id: 'blizzard', label: 'Blizzard', group: 'Winter', weather: { cloud: 1, snow: 1, fog: 0.8, wind: 1 } },
  { id: 'sunset-showers', label: 'Sunset showers', group: 'Combined elements', at: '2026-10-15T18:00:00-02:30', weather: { cloud: 0.65, rain: 0.45, fog: 0.12, wind: 0.4 } },
  { id: 'moonlit-flurries', label: 'Moonlit flurries', group: 'Combined elements', at: '2026-04-27T06:00:00Z', weather: { cloud: 0.25, snow: 0.3, fog: 0.04, wind: 0.15 } },
];

export function previewConditions(id) {
  const preset = WEATHER_PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  return {
    ...sceneConditions(new Date(preset.at || '2026-10-15T12:00:00-02:30'), preset.weather),
    label: preset.label,
  };
}

// One brief return stroke every 19 seconds, shared by the bolt and cloud lighting.
export function stormGlow(time, strength, reduced = false) {
  if (reduced || strength <= 0) return 0;
  const phase = ((time % 19) + 19) % 19;
  const age = phase - 4.8;
  if (age < 0 || age >= 0.35) return 0;
  const attack = smooth(0, 0.025, age);
  const decay = Math.exp(-Math.max(0, age - 0.025) * 18);
  return attack * decay * (1 - smooth(0.28, 0.35, age)) * strength * 0.32;
}

export function sceneConditions(date = new Date(), weather = null) {
  // Solar/lunar geometry uses an absolute instant and the fixed scene location.
  // Cloud, precipitation, fog and wind are independent inputs, not exclusive scene types.
  const { latitude, longitude } = ST_JOHNS;
  const sun = getPosition(date, latitude, longitude);
  const moon = getMoonPosition(date, latitude, longitude);
  const illumination = getMoonIllumination(date);
  const parameters = normalizeWeatherParameters({ ...weather, visibility: weather?.visibility ?? 1 - (weather?.fog ?? 0) });
  const { cloud } = parameters;
  const daylight = smooth(-6, 14, sun.altitude);
  const sunStrength = smooth(-0.8, 2, sun.altitude) * (Number.isFinite(weather?.sun) ? parameters.sun : 1 - cloud * 0.92);
  const moonStrength = smooth(-0.3, 3, moon.altitude) * (1 - daylight) * illumination.fraction * (1 - cloud * 0.94);
  const twilight = smooth(-16, -4, sun.altitude) * (1 - smooth(0, 14, sun.altitude));
  return composeWeatherConditions({
    sunDirection: direction(sun.azimuth, sun.altitude),
    moonDirection: direction(moon.azimuth, moon.altitude),
    moonFraction: illumination.fraction,
    moonAngle: (illumination.angle - moon.parallacticAngle) * RAD,
    moonWaxing: illumination.waxing ? 1 : -1,
    period: sun.altitude > 0 ? 'Day' : sun.altitude > -12 ? 'Twilight' : 'Night',
  }, { ...parameters, daylight, sun: sunStrength, moon: moonStrength, twilight });
}

export async function fetchStJohnsWeather({ signal, fetcher = fetch } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  // Always the portfolio's city. No visitor location or location permission is used.
  url.search = new URLSearchParams({
    latitude: ST_JOHNS.latitude.toFixed(2), longitude: ST_JOHNS.longitude.toFixed(2),
    current: 'cloud_cover,precipitation,rain,showers,snowfall,visibility,direct_normal_irradiance_instant,weather_code,wind_speed_10m',
    wind_speed_unit: 'kmh', precipitation_unit: 'mm', forecast_days: '1',
  });
  const response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Weather is unavailable');
  return decodeWeather((await response.json()).current);
}

/** One fixed-city forecast, composed with its real solar/lunar clock. */
export function stJohnsEnvironment(onChange) {
  const control = document.querySelector('#weather-control');
  const toggle = control.querySelector('#btn-weather');
  const panel = control.querySelector('#weather-panel');
  const status = control.querySelector('#weather-status');
  const refreshButton = control.querySelector('#weather-refresh');
  const message = control.querySelector('#weather-message');
  const clock = control.querySelector('#weather-clock');
  const picker = control.querySelector('#weather-preview');
  const pickerValue = control.querySelector('#weather-preview-value');
  const options = control.querySelector('#weather-options');
  const returnCity = control.querySelector('#weather-return');
  const overview = control.querySelector('#weather-overview');
  const studio = control.querySelector('#weather-studio');
  const tuneButton = control.querySelector('#weather-tune');
  const backButton = control.querySelector('#weather-studio-back');
  const resetButton = control.querySelector('#weather-reset');
  const studioSource = control.querySelector('#weather-studio-source');
  const marineStatus = control.querySelector('#marine-status');
  const marineDetails = control.querySelector('#marine-details');
  const marineTime = control.querySelector('#marine-time');
  let custom = null, customBase = null, customSource = '', currentConditions = null;
  const dials = weatherControls(control.querySelector('#weather-parameters'), (key, value) => {
    if (!custom) {
      customBase = currentConditions;
      customSource = preview ? WEATHER_PRESETS.find((p) => p.id === preview).label : 'St. John’s weather';
    }
    custom = { ...weatherParameters(currentConditions), [key]: value };
    publish();
  });
  let preview = '', weather = null, fetchedAt = 0, attemptAt = 0;
  let marine = null, marineFetchedAt = 0, marineFailed = false;
  let loading = false, request = null, disposed = false, generation = 0;
  const MINUTE = 60_000;
  const groups = new Map();
  const optionButtons = [];
  function addOption(parent, id, label) {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'sky-option'; option.dataset.value = id;
    option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false'); option.tabIndex = -1;
    const name = document.createElement('span'); name.textContent = label;
    const check = document.createElement('span'); check.className = 'sky-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
    option.append(name, check); parent.append(option); optionButtons.push(option);
  }
  addOption(options, '', 'Live St. John’s weather');
  WEATHER_PRESETS.forEach((preset) => {
    if (!groups.has(preset.group)) {
      const group = document.createElement('div'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', preset.group);
      const heading = document.createElement('div'); heading.className = 'sky-group-label'; heading.textContent = preset.group; heading.setAttribute('aria-hidden', 'true');
      group.append(heading); groups.set(preset.group, group); options.append(group);
    }
    addOption(groups.get(preset.group), preset.id, preset.label);
  });
  function publish() {
    if (disposed) return;
    if (weather && Date.now() - fetchedAt > 30 * MINUTE) weather = null;
    if (marine && (Date.now() - marineFetchedAt > 30 * MINUTE || Date.now() - marine.validAt > MARINE_MAX_AGE)) marine = null;
    const sky = custom ? composeWeatherConditions(customBase, custom) : previewConditions(preview) || sceneConditions(new Date(), weather);
    const conditions = composeMarineEnvironment(sky, !custom && !preview ? marine : null);
    const sea = conditions.sea;
    const compass = (angle) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(angle / 45) % 8];
    marineStatus.textContent = sea.source === 'model' ? `Offshore sea · ${marineFailed ? 'cached ' : ''}marine model` : preview || custom ? 'Sea · illustrative preview' : loading ? 'Sea · loading marine model…' : 'Sea · weather-based estimate';
    marineDetails.textContent = `Waves ${sea.data.waves.height.toFixed(1)} m · ${sea.data.waves.period.toFixed(1)} s · from ${compass(sea.data.waves.direction)}. ${sea.data.current ? `Surface current ${sea.data.current.speed.toFixed(1)} km/h toward ${compass(sea.data.current.direction)}.` : 'Surface current unavailable.'}${sea.limited ? ' Extreme wave motion is softened for the dive.' : ''}`;
    marineTime.textContent = sea.source === 'model' ? `Model time · ${stJohnsTime(new Date(sea.data.validAt))}` : 'Wave motion estimated from this weather mix.';
    marineTime.title = sea.source === 'model' ? `Offshore model cell: ${sea.data.latitude ?? 'unknown'}°, ${sea.data.longitude ?? 'unknown'}°. ${new Date(sea.data.validAt).toISOString()}` : '';
    marineStatus.dataset.source = sea.source;
    currentConditions = conditions;
    status.textContent = custom ? 'Preview · Custom weather' : preview ? `Preview · ${conditions.label}` : `St. John's · ${weather ? weather.description : conditions.period.toLowerCase()}`;
    clock.textContent = `St. John's · ${stJohnsTime()}${preview || custom ? ' · example sky' : ''}`;
    returnCity.hidden = !preview && !custom;
    pickerValue.textContent = custom ? 'Custom weather' : preview ? WEATHER_PRESETS.find((p) => p.id === preview).label : 'Live St. John’s weather';
    panel.dataset.mode = custom ? 'custom' : preview ? 'preset' : 'live';
    studioSource.textContent = `Based on ${custom ? customSource : preview ? conditions.label : 'St. John’s weather'}${custom ? ' · adjusted' : ''}`;
    resetButton.disabled = !custom;
    dials.setValues(weatherParameters(conditions));
    optionButtons.forEach((button) => {
      const selected = !custom && button.dataset.value === preview;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    toggle.setAttribute('aria-label', `${status.textContent}. St. John's sky settings`);
    refreshButton.disabled = loading;
    refreshButton.textContent = loading ? 'Updating weather…' : 'Refresh St. John’s weather';
    message.textContent = custom ? 'Your own mix of light, clouds, visibility and precipitation. Tune it again or return to the live sky.'
      : preview ? 'An example made from the same light, cloud, precipitation, fog and wind controls as the live scene.'
      : weather ? 'Live weather and sun/moon lighting for St. John’s, Newfoundland.'
      : loading ? 'Getting the latest weather for St. John’s. Its sun and moon are already in position.'
      : 'Weather is temporarily unavailable. Lighting still follows the real St. John’s sun and moon.';
    onChange(conditions, Boolean(custom));
  }
  async function refresh() {
    if (disposed || loading || document.hidden) return;
    const id = ++generation;
    loading = true; attemptAt = Date.now(); publish();
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      // Independent feeds: one failed response must not discard the other feed.
      await Promise.allSettled([
        fetchStJohnsWeather({ signal: controller.signal }).then((fresh) => {
          if (disposed || id !== generation) return;
          weather = fresh; fetchedAt = Date.now(); publish();
        }),
        fetchStJohnsMarine({ signal: controller.signal }).then((fresh) => {
          if (disposed || id !== generation) return;
          marine = fresh; marineFetchedAt = Date.now(); marineFailed = false; publish();
        }).catch(() => {
          if (!disposed && id === generation) { marineFailed = true; publish(); }
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (!disposed && id === generation) { loading = false; request = null; publish(); }
    }
  }
  function closePicker() { options.hidden = true; panel.classList.remove('choosing-sky'); picker.setAttribute('aria-expanded', 'false'); }
  function revealOption(button) {
    const item = button.getBoundingClientRect(), list = options.getBoundingClientRect();
    if (item.top < list.top + 32) options.scrollTop += item.top - list.top - 32;
    else if (item.bottom > list.bottom - 6) options.scrollTop += item.bottom - list.bottom + 6;
  }
  function openPicker() {
    panel.classList.add('choosing-sky'); panel.scrollTop = 0;
    options.hidden = false; options.style.maxHeight = ''; picker.setAttribute('aria-expanded', 'true');
    // Fit the list inside the panel so choosing a sky needs only one scrollbar.
    const overflow = Math.max(0, panel.scrollHeight - panel.clientHeight);
    options.style.maxHeight = `${Math.max(100, options.clientHeight - overflow)}px`;
    const selected = optionButtons.find((button) => button.dataset.value === preview) || optionButtons[0];
    selected.focus({ preventScroll: true }); revealOption(selected);
  }
  function togglePicker() { if (options.hidden) openPicker(); else { closePicker(); picker.focus(); } }
  function setStudio(open) {
    closePicker(); overview.hidden = open; studio.hidden = !open;
    panel.classList.toggle('tuning-weather', open); panel.scrollTop = 0;
    tuneButton.setAttribute('aria-expanded', String(open));
  }
  function openStudio() { setStudio(true); backButton.focus({ preventScroll: true }); }
  function backToSettings() { setStudio(false); tuneButton.focus({ preventScroll: true }); }
  function resetAdjustments() {
    // Move focus before disabling Reset so focusout does not dismiss the studio.
    control.querySelector('#weather-daylight').focus({ preventScroll: true });
    custom = null; customBase = null; publish();
  }
  function close() { setStudio(false); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  function togglePanel() {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
  }
  function followCity() { preview = ''; custom = null; customBase = null; publish(); close(); toggle.focus(); }
  function choosePreview(e) {
    const button = e.target.closest('.sky-option');
    if (!button) return;
    preview = button.dataset.value; custom = null; customBase = null; publish(); close(); toggle.focus();
  }
  let typed = '', typedAt = 0;
  function pickerKey(e) {
    if (e.target === picker && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openPicker(); return; }
    if (!options.contains(e.target)) return;
    let index = optionButtons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') index = (index + 1) % optionButtons.length;
    else if (e.key === 'ArrowUp') index = (index - 1 + optionButtons.length) % optionButtons.length;
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = optionButtons.length - 1;
    else if (e.key === 'Tab') { closePicker(); picker.focus(); return; }
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typed = Date.now() - typedAt < 700 ? typed + e.key.toLowerCase() : e.key.toLowerCase(); typedAt = Date.now();
      const match = optionButtons.findIndex((button) => button.textContent.toLowerCase().startsWith(typed));
      if (match < 0) return;
      index = match;
    } else return;
    e.preventDefault();
    optionButtons.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
    optionButtons[index].focus({ preventScroll: true }); revealOption(optionButtons[index]);
  }
  function refreshCity() {
    preview = ''; custom = null; customBase = null; closePicker(); publish();
    // Refresh becomes disabled while fetching; keep keyboard focus in the control.
    toggle.focus({ preventScroll: true }); refresh();
  }
  function dismissKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (!options.hidden) { closePicker(); picker.focus(); } else { close(); toggle.focus(); }
  }
  function outsidePointer(e) { if (!control.contains(e.target)) close(); }
  function outsideFocus(e) { if (!loading && !control.contains(e.relatedTarget)) close(); }
  function update() {
    if (document.hidden || disposed) return;
    publish();
    if (Date.now() - attemptAt >= 15 * MINUTE) refresh();
  }
  toggle.addEventListener('click', togglePanel);
  refreshButton.addEventListener('click', refreshCity);
  returnCity.addEventListener('click', followCity);
  tuneButton.addEventListener('click', openStudio);
  backButton.addEventListener('click', backToSettings);
  resetButton.addEventListener('click', resetAdjustments);
  picker.addEventListener('click', togglePicker);
  options.addEventListener('click', choosePreview);
  control.addEventListener('keydown', pickerKey);
  control.addEventListener('keydown', dismissKey);
  control.addEventListener('focusout', outsideFocus);
  document.addEventListener('pointerdown', outsidePointer);
  document.addEventListener('visibilitychange', update);
  const timer = setInterval(update, MINUTE);
  publish();
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true; generation++; clearInterval(timer); request?.abort();
      toggle.removeEventListener('click', togglePanel);
      refreshButton.removeEventListener('click', refreshCity);
      returnCity.removeEventListener('click', followCity);
      tuneButton.removeEventListener('click', openStudio);
      backButton.removeEventListener('click', backToSettings);
      resetButton.removeEventListener('click', resetAdjustments);
      picker.removeEventListener('click', togglePicker);
      options.removeEventListener('click', choosePreview);
      control.removeEventListener('keydown', pickerKey);
      control.removeEventListener('keydown', dismissKey);
      control.removeEventListener('focusout', outsideFocus);
      document.removeEventListener('pointerdown', outsidePointer);
      document.removeEventListener('visibilitychange', update);
    },
  };
}
