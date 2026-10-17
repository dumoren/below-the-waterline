export const M_PER_UNIT = 3.1;
export const SCENE_LOCATION = Object.freeze({ latitude: 47.56, longitude: -52.71, timeZone: 'America/St_Johns' });
export const SCENE_WEST = 0.95 + Math.PI + 0.13;

/** Geographic bearing -> scene X/Z. `from` reverses incoming wave bearings. */
export function compassVector(bearing, from = false) {
  const angle = SCENE_WEST + (bearing - 270) * Math.PI / 180;
  const sign = from ? -1 : 1;
  return [Math.cos(angle) * sign, Math.sin(angle) * sign];
}
