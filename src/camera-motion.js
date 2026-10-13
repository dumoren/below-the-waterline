// Ease velocity only at departure and arrival. The middle 80% of a trip cruises
// at one speed, so crossing the waterline does not coincide with a speed surge.
export function travelProgress(progress) {
  const t = Math.min(1, Math.max(0, progress));
  const ramp = 0.1;
  const cruise = 1 / (1 - ramp);
  const departure = (s) => cruise * (s - ramp / Math.PI * Math.sin(Math.PI * s / ramp)) / 2;
  if (t < ramp) return departure(t);
  if (t > 1 - ramp) return 1 - departure(1 - t);
  return cruise * (t - ramp / 2);
}
