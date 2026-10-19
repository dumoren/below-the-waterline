import { CLEAR_VISIBILITY_METRES } from './weather-parameters.js';
import { SCENE_LOCATION } from './scene-scale.js';
import { fetchStJohnsMarine, composeMarineEnvironment, MARINE_MAX_AGE } from './marine-environment.js';
import { astronomicalConditions, celestialDirection as direction } from './astronomy.js';

export const ST_JOHNS = SCENE_LOCATION;
const cityClock = new Intl.DateTimeFormat('en-CA', { timeZone: ST_JOHNS.timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export const stJohnsTime = (date = new Date()) => cityClock.format(date);
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo)); return t * t * (3 - 2 * t); };

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
    ...(Number.isFinite(current.visibility) ? { visibilityMetres: Math.max(0, current.visibility) } : {}),
    ...(Number.isFinite(current.direct_normal_irradiance_instant) ? { sun: clamp(current.direct_normal_irradiance_instant / 1000) } : {}),
    wind,
    description: hail ? 'Thunder & hail' : thunder ? 'Thunderstorms' : freezing ? 'Freezing rain' : drizzle ? 'Drizzle' : snow && wind > 0.6 ? 'Blowing snow' : snow ? (heavy ? 'Heavy snow' : 'Snow flurries') : heavy ? 'Heavy rain' : wet ? 'Rain' : fog ? 'Fog' : code === 3 || current.cloud_cover > 85 ? 'Overcast' : code === 2 || current.cloud_cover > 35 ? 'Partly cloudy' : 'Clear',
  };
}

// Presets are examples made from the same independent controls as the live forecast.
export const WEATHER_PRESETS = [
  // Stage the example suns in the opening view. Live mode keeps real astronomy.
  { id: 'clear', label: 'Clear daylight', group: 'Light & clouds', sunPosition: { azimuth: 260, altitude: 3.5 }, weather: { cloud: 0.04, wind: 0.12 } },
  { id: 'broken-clouds', label: 'Passing clouds', group: 'Light & clouds', sunPosition: { azimuth: 256, altitude: 2.5 }, weather: { cloud: 0.58, wind: 0.45 } },
  { id: 'overcast', label: 'Overcast', group: 'Light & clouds', weather: { cloud: 1, wind: 0.3 } },
  { id: 'sunrise', label: 'Sunrise', group: 'Light & clouds', at: '2026-10-15T07:25:00-02:30', sunPosition: { azimuth: 264, altitude: 0.12 }, weather: { cloud: 0.16, wind: 0.12 } },
  { id: 'sunset', label: 'Golden hour', group: 'Light & clouds', at: '2026-10-15T18:00:00-02:30', sunPosition: { azimuth: 264, altitude: 0.2 }, weather: { cloud: 0.15, wind: 0.12 } },
  { id: 'blue-hour', label: 'Blue hour', group: 'Light & clouds', at: '2026-10-15T18:35:00-02:30', weather: { cloud: 0.25, wind: 0.2 } },
  { id: 'moonlight', label: 'Moonlit night', group: 'Light & clouds', at: '2026-04-27T06:00:00Z', weather: { cloud: 0.04, wind: 0.12 } },
  { id: 'mist', label: 'Sea mist', group: 'Mist & fog', sunPosition: { azimuth: 258, altitude: 2 }, weather: { cloud: 0.55, fog: 0.42, wind: 0.12, visibilityMetres: 2500 } },
  { id: 'fog', label: 'Dense fog', group: 'Mist & fog', weather: { cloud: 1, fog: 0.98, wind: 0.1, visibilityMetres: 700 } },
  { id: 'drizzle', label: 'Drizzle', group: 'Rain & storms', weather: { cloud: 0.93, rain: 0.2, drizzle: 1, fog: 0.27, wind: 0.2, visibilityMetres: 5000 } },
  { id: 'downpour', label: 'Heavy rain', group: 'Rain & storms', weather: { cloud: 1, rain: 1, fog: 0.18, wind: 0.7, visibilityMetres: 2000 } },
  { id: 'thunderstorm', label: 'Thunderstorm', group: 'Rain & storms', at: '2026-10-15T18:35:00-02:30', weather: { cloud: 1, rain: 0.85, thunder: 1, fog: 0.15, wind: 0.85, visibilityMetres: 4000 } },
  { id: 'hail', label: 'Hailstorm', group: 'Rain & storms', weather: { cloud: 1, rain: 0.45, ice: 1, thunder: 0.6, fog: 0.18, wind: 0.8, visibilityMetres: 3000 } },
  { id: 'flurries', label: 'Snow flurries', group: 'Winter', sunPosition: { azimuth: 256, altitude: 2 }, weather: { cloud: 0.7, snow: 0.35, fog: 0.08, wind: 0.2, visibilityMetres: 8000 } },
  { id: 'sleet', label: 'Sleet', group: 'Winter', weather: { cloud: 1, rain: 0.5, snow: 0.2, ice: 0.6, fog: 0.24, wind: 0.55, visibilityMetres: 3000 } },
  { id: 'blizzard', label: 'Blizzard', group: 'Winter', weather: { cloud: 1, snow: 1, fog: 0.8, wind: 1, visibilityMetres: 600 } },
  { id: 'sunset-showers', label: 'Sunset showers', group: 'Combined elements', at: '2026-10-15T18:00:00-02:30', sunPosition: { azimuth: 264, altitude: 0.2 }, weather: { cloud: 0.65, rain: 0.45, fog: 0.12, wind: 0.4, visibilityMetres: 10000 } },
  { id: 'moonlit-flurries', label: 'Moonlit flurries', group: 'Combined elements', at: '2026-04-27T06:00:00Z', weather: { cloud: 0.25, snow: 0.3, fog: 0.04, wind: 0.15, visibilityMetres: 12000 } },
];

export function previewConditions(id) {
  const preset = WEATHER_PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  const sunPosition = preset.sunPosition || (!preset.at ? { azimuth: 260, altitude: 3.5 } : null);
  return {
    ...sceneConditions(new Date(preset.at || '2026-10-15T12:00:00-02:30'), preset.weather),
    ...(sunPosition ? { sunDirection: direction(sunPosition.azimuth, sunPosition.altitude) } : {}),
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

export const sceneConditions = astronomicalConditions;

// Fresh data refreshes every 15 minutes. After failed attempts in a row, retry soon
// (a first fetch can lose to shader compilation on load), then back off.
const RETRY_DELAYS = [30_000, 120_000, 300_000];
export function weatherRetryDelay(failures) {
  return failures > 0 ? RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length) - 1] : 15 * 60_000;
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
  const statusContext = status.querySelector('.weather-context');
  const statusCondition = status.querySelector('#weather-condition');
  const refreshButton = control.querySelector('#weather-refresh');
  const message = control.querySelector('#weather-message');
  const clock = control.querySelector('#weather-clock');
  const picker = control.querySelector('#weather-preview');
  const pickerValue = control.querySelector('#weather-preview-value');
  const options = control.querySelector('#weather-options');
  const returnCity = control.querySelector('#weather-return');
  const marineStatus = control.querySelector('#marine-status');
  const marineDetails = control.querySelector('#marine-details');
  const marineTime = control.querySelector('#marine-time');
  let renderElapsed = 0;
  let fixedPreview = null, currentConditions = null;
  let preview = '', weather = null, fetchedAt = 0, attemptAt = 0;
  let marine = null, marineFetchedAt = 0, marineFailed = false;
  let loading = false, request = null, disposed = false, generation = 0;
  let failures = 0, retryTimer = null;
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
  // Only touch the DOM when a value actually changes: live mode republishes every second.
  const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
  function publish() {
    if (disposed) return;
    if (weather && Date.now() - fetchedAt > 30 * MINUTE) weather = null;
    if (marine && (Date.now() - marineFetchedAt > 30 * MINUTE || Date.now() - marine.validAt > MARINE_MAX_AGE)) marine = null;
    const sky = fixedPreview || previewConditions(preview) || sceneConditions(new Date(), weather);
    const conditions = composeMarineEnvironment(sky, !fixedPreview && !preview ? marine : null);
    currentConditions = conditions;
    const sea = conditions.sea;
    const previewing = preview || fixedPreview;
    // Always visible: the toggle's status line.
    setText(statusContext, previewing ? 'Preview · ' : 'St. John’s · ');
    setText(statusCondition, fixedPreview ? 'Sky preview' : preview ? conditions.label : weather ? weather.description : conditions.period);
    setAttr(toggle, 'aria-label', `${status.textContent}. St. John's sky settings`);
    // The panel's contents are only written while it is open; opening it publishes afresh.
    if (!panel.hidden) renderPanel(conditions, sea, previewing);
    onChange(conditions, Boolean(fixedPreview));
  }
  function renderPanel(conditions, sea, previewing) {
    const compass = (angle) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(angle / 45) % 8];
    setText(marineStatus, sea.source === 'model' ? `Offshore sea · ${marineFailed ? 'cached ' : ''}marine model` : previewing ? 'Sea · illustrative preview' : loading ? 'Sea · loading marine model…' : 'Sea · weather-based estimate');
    setText(marineDetails, `Waves ${sea.data.waves.height.toFixed(1)} m · ${sea.data.waves.period.toFixed(1)} s · from ${compass(sea.data.waves.direction)}. ${sea.data.current ? `Surface current ${sea.data.current.speed.toFixed(1)} km/h toward ${compass(sea.data.current.direction)}.` : 'Surface current unavailable.'}${sea.limited ? ' Extreme wave motion is softened for the dive.' : ''}`);
    setText(marineTime, sea.source === 'model' ? `Model time · ${stJohnsTime(new Date(sea.data.validAt))}` : 'Wave motion estimated from this weather mix.');
    const marineTitle = sea.source === 'model' ? `Offshore model cell: ${sea.data.latitude ?? 'unknown'}°, ${sea.data.longitude ?? 'unknown'}°. ${new Date(sea.data.validAt).toISOString()}` : '';
    if (marineTime.title !== marineTitle) marineTime.title = marineTitle;
    if (marineStatus.dataset.source !== sea.source) marineStatus.dataset.source = sea.source;
    setText(clock, `St. John's · ${stJohnsTime()}${previewing ? ' · example sky' : ''}`);
    if (returnCity.hidden !== !previewing) returnCity.hidden = !previewing;
    setText(pickerValue, fixedPreview ? 'Sky preview' : preview ? WEATHER_PRESETS.find((p) => p.id === preview).label : 'Live St. John’s weather');
    const mode = fixedPreview ? 'preview' : preview ? 'preset' : 'live';
    if (panel.dataset.mode !== mode) panel.dataset.mode = mode;
    optionButtons.forEach((button) => {
      const selected = !fixedPreview && button.dataset.value === preview;
      setAttr(button, 'aria-selected', String(selected));
      if (button.tabIndex !== (selected ? 0 : -1)) button.tabIndex = selected ? 0 : -1;
    });
    if (refreshButton.disabled !== loading) refreshButton.disabled = loading;
    setText(refreshButton, loading ? 'Updating weather…' : 'Refresh St. John’s weather');
    setText(message, preview || fixedPreview ? 'An example made from the same light, cloud, precipitation, fog and wind parameters as the live scene.'
      : weather ? 'Live weather and sun/moon lighting for St. John’s, Newfoundland.'
      : loading ? 'Getting the latest weather for St. John’s. Its sun and moon are already in position.'
      : 'Weather is temporarily unavailable. Lighting still follows the real St. John’s sun and moon.');
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
      if (!disposed && id === generation) {
        loading = false; request = null;
        failures = weather && !marineFailed ? 0 : failures + 1;
        clearTimeout(retryTimer);
        // The minute timer is too coarse for the first retry.
        if (failures) retryTimer = setTimeout(update, weatherRetryDelay(failures));
        publish();
      }
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
  function close() { closePicker(); panel.scrollTop = 0; panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  function togglePanel() {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    publish();
  }
  function followCity() { preview = ''; fixedPreview = null; publish(); close(); toggle.focus(); }
  function choosePreview(e) {
    const button = e.target.closest('.sky-option');
    if (!button) return;
    preview = button.dataset.value; fixedPreview = null;
    publish(); close(); toggle.focus();
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
    preview = ''; fixedPreview = null; closePicker(); publish();
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
    if (Date.now() - attemptAt >= weatherRetryDelay(failures)) refresh();
  }
  toggle.addEventListener('click', togglePanel);
  refreshButton.addEventListener('click', refreshCity);
  returnCity.addEventListener('click', followCity);
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
    previewAt(date, weather) {
      preview = '';
      fixedPreview = sceneConditions(new Date(date), weather);
      publish(); return currentConditions;
    },
    step(elapsed) {
      if (disposed || document.hidden) return;
      if (preview || fixedPreview) return;
      renderElapsed += elapsed;
      if (renderElapsed < 1) return;
      renderElapsed = 0;
      publish();
    },
    dispose() {
      disposed = true; generation++; clearInterval(timer); clearTimeout(retryTimer); request?.abort();
      toggle.removeEventListener('click', togglePanel);
      refreshButton.removeEventListener('click', refreshCity);
      returnCity.removeEventListener('click', followCity);
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
