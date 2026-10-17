import { WEATHER_PARAMETERS, normalizeWeatherParameters } from './weather-parameters.js';

/** Native keyboard/touch sliders paired with draggable dial faces. */
export function weatherControls(container, onInput) {
  const controls = new Map(), groups = new Map();
  for (const parameter of WEATHER_PARAMETERS) {
    if (!groups.has(parameter.group)) {
      const group = document.createElement('fieldset');
      const legend = document.createElement('legend'); legend.textContent = parameter.group;
      const grid = document.createElement('div'); grid.className = 'weather-dials';
      group.append(legend, grid); container.append(group); groups.set(parameter.group, grid);
    }
    const label = document.createElement('label'); label.className = 'weather-dial'; label.title = parameter.hint;
    const name = document.createElement('span'); name.className = 'weather-dial-name'; name.textContent = parameter.label;
    const face = document.createElement('span'); face.className = 'weather-dial-face'; face.setAttribute('aria-hidden', 'true');
    const value = document.createElement('span'); value.className = 'weather-dial-value';
    const indicator = document.createElement('span'); indicator.className = 'weather-dial-indicator';
    face.append(indicator, value);
    const input = document.createElement('input');
    input.type = 'range'; input.id = `weather-${parameter.key}`; input.min = '0'; input.max = '100'; input.step = '1';
    input.setAttribute('aria-label', parameter.label); input.setAttribute('aria-description', parameter.hint);
    label.htmlFor = input.id; label.append(name, face, input); groups.get(parameter.group).append(label);
    function display(percent) {
      value.textContent = `${percent}%`;
      label.style.setProperty('--dial-value', percent / 100);
      input.setAttribute('aria-valuetext', `${percent}%`);
    }
    function change() { display(Number(input.value)); onInput(parameter.key, Number(input.value) / 100); }
    input.addEventListener('input', change);
    let drag = null;
    face.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      input.focus({ preventScroll: true }); face.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: Number(input.value) };
    });
    face.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      input.value = String(Math.round(drag.value + (event.clientX - drag.x - event.clientY + drag.y) * 0.6));
      change();
    });
    face.addEventListener('lostpointercapture', () => { drag = null; });
    face.addEventListener('mousedown', (event) => event.preventDefault());
    // Cancel the label's forwarded click locally, without suppressing later touch taps.
    face.addEventListener('click', (event) => event.preventDefault());
    face.addEventListener('pointerup', (event) => {
      if (face.hasPointerCapture(event.pointerId)) face.releasePointerCapture(event.pointerId);
      drag = null;
    });
    controls.set(parameter.key, { input, display });
  }
  return {
    setValues(values) {
      const normalized = normalizeWeatherParameters(values);
      for (const [key, { input, display }] of controls) {
        const percent = Math.round(normalized[key] * 100);
        input.value = String(percent); display(percent);
      }
    },
  };
}
