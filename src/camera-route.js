import * as THREE from 'three';

// A conservative envelope from the actual triangles, including the iceberg's asymmetric lobes.
export function cameraRoutes(geometry) {
  const pos = geometry.attributes.position;
  let radius = 0, bottom = Infinity, top = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    radius = Math.max(radius, Math.hypot(pos.getX(i), pos.getZ(i)));
    bottom = Math.min(bottom, pos.getY(i));
    top = Math.max(top, pos.getY(i));
  }
  // Radial envelopes per half-unit of height preserve the close views at the narrow tip.
  // Include the entire triangle in every slice it crosses, plus camera headroom.
  const step = 0.5;
  const slices = new Float32Array(Math.ceil((top - bottom) / step) + 1);
  const index = geometry.index;
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
    const lo = Math.min(...ids.map((j) => pos.getY(j)));
    const hi = Math.max(...ids.map((j) => pos.getY(j)));
    const r = Math.max(...ids.map((j) => Math.hypot(pos.getX(j), pos.getZ(j))));
    for (let bin = Math.floor((lo - bottom) / step); bin <= Math.floor((hi - bottom) / step); bin++) slices[bin] = Math.max(slices[bin], r);
  }
  const clearance = (y) => {
    if (y < bottom - 1.5 || y > top + 1.5) return 0;
    let r = 0;
    for (let bin = Math.max(0, Math.floor((y - 1.5 - bottom) / step)); bin <= Math.min(slices.length - 1, Math.ceil((y + 1.5 - bottom) / step)); bin++) r = Math.max(r, slices[bin]);
    return r + 1.5;
  };
  const protect = (point) => {
    const r = Math.hypot(point.x, point.z);
    const min = clearance(point.y);
    if (r < min) {
      const angle = Math.atan2(point.z, point.x);
      point.x = Math.cos(angle) * min;
      point.z = Math.sin(angle) * min;
    }
    return point;
  };
  const curve = (points) => {
    const clean = points.filter((p, i) => !i || p.distanceToSquared(points[i - 1]) > 1e-10);
    const path = new THREE.CatmullRomCurve3(clean.length > 1 ? clean : [clean[0], clean[0].clone()], false, 'centripetal', 0.5);
    path.arcLengthDivisions = 4096;
    const sample = path.getPoint.bind(path);
    // The safety envelope also covers spline overshoot between waypoints.
    path.getPoint = (t, out = new THREE.Vector3()) => protect(sample(THREE.MathUtils.clamp(t, 0, 1), out));
    const sampleAt = path.getPointAt.bind(path);
    path.getPointAt = (t, out = new THREE.Vector3()) => clean.length < 2 ? protect(out.copy(clean[0])) : sampleAt(THREE.MathUtils.clamp(t, 0, 1), out);
    path.updateArcLengths();
    return path;
  };
  const route = (from, to) => {
    const a = Math.atan2(from.z, from.x), b = Math.atan2(to.z, to.x);
    const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    const r = Math.max(Math.hypot(from.x, from.z), Math.hypot(to.x, to.z), radius + 7);
    const steps = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 18)));
    const points = [from.clone()];
    // First pull away from the point, then follow an orbit rather than a chord through the ice.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, angle = a + turn * t;
      points.push(new THREE.Vector3(Math.cos(angle) * r, THREE.MathUtils.lerp(from.y, to.y, t), Math.sin(angle) * r));
    }
    points.push(to.clone());
    return curve(points);
  };
  return { route, curve, protect, clearance };
}
