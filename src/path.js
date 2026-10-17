// The dive: a descending spiral around the berg, parameterised by progress p ∈ [0, 1].
// p < P_SURF is the approach from the air; the rest is linear in depth.
import { profile } from './world/berg.js';

export { M_PER_UNIT } from './scene-scale.js';
export const P_SURF = 0.1;
const Y_TOP = 15;
const Y_START = -2.5;
const Y_END = -57;
const THETA0 = 0.95;
let TURN = Math.PI * 1.55;

/** Wind the spiral so the dive ends at a given angle around the berg (where the anchor lies). */
export function setEndAngle(angle) {
  const TAU = Math.PI * 2;
  let turn = (((angle - THETA0) % TAU) + TAU) % TAU;
  while (turn < Math.PI * 1.3) turn += TAU;
  TURN = turn;
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function camY(p) {
  if (p < P_SURF) {
    const t = p / P_SURF;
    // Ease out of the hero, then commit to the plunge.
    return lerp(Y_TOP, Y_START, t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  }
  return lerp(Y_START, Y_END, (p - P_SURF) / (1 - P_SURF));
}

export function pForCamY(y) {
  return P_SURF + ((Y_START - y) / (Y_START - Y_END)) * (1 - P_SURF);
}

export function theta(p) {
  return THETA0 + TURN * p;
}

function orbitRadius(y) {
  return profile(Math.min(y, -0.5)) * 1.25 + 19;
}

/** Camera position, look target and horizontal view offset (hero framing) for progress p. */
export function pose(p, out) {
  const y = camY(p);
  const th = theta(p);
  let r;
  let ty;
  if (p < P_SURF) {
    const t = smooth(p / P_SURF);
    r = lerp(50, orbitRadius(Y_START), t);
    ty = lerp(2.5, Y_START - 5, t);
  } else {
    r = orbitRadius(y);
    ty = y - 5;
  }
  out.pos.set(Math.cos(th) * r, y, Math.sin(th) * r);
  out.target.set(0, ty, 0);
  out.offset = 1 - smooth(Math.min(1, p / (P_SURF * 0.8)));
  return out;
}
