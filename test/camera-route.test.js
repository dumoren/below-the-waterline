import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { cameraRoutes } from '../src/camera-route.js';
import { travelProgress } from '../src/camera-motion.js';
import { buildBergGeometry, surfacePoint } from '../src/world/berg.js';
import { pose, pForCamY, theta, setEndAngle, M_PER_UNIT } from '../src/path.js';

const geometry = buildBergGeometry(5, 11);
const routes = cameraRoutes(geometry);
const ice = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
ice.updateMatrixWorld();
const ray = new THREE.Raycaster();
setEndAngle(-1.54 - 0.25);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const views = [...html.matchAll(/<li\b[^>]*data-id="([^"]+)"[^>]*data-depth="(\d+)"[^>]*data-angle="([^"]+)"[^>]*>/g)].map(([tag, id, depth, angle]) => {
  const y = -Number(depth) / M_PER_UNIT;
  const p = pForCamY(y + 2.2);
  const sp = surfacePoint(geometry, y, theta(p) + Number(angle));
  const n = sp.n.clone();
  if (n.x * sp.x + n.z * sp.z < 0) n.negate();
  n.y *= 0.4;
  n.normalize();
  const pos = new THREE.Vector3(sp.x, sp.y, sp.z);
  if (tag.includes('project/')) pos.addScaledVector(n, 3.6).add(new THREE.Vector3(0, 0.8, 0));
  if (id === 'mun') pos.addScaledVector(n, 1.5);
  return { id, pos: pos.addScaledVector(n, 12.5).add(new THREE.Vector3(0, 1.6, 0)) };
});

function verify(path, from, to) {
  assert.ok(path.getPointAt(0).distanceTo(from) < 1e-5, 'preserve starting position');
  assert.ok(path.getPointAt(1).distanceTo(to) < 1e-5, 'preserve ending position');
  let prev = path.getPointAt(0);
  for (let i = 1; i <= 180; i++) {
    const point = path.getPointAt(i / 180);
    assert.ok(point.toArray().every(Number.isFinite), 'finite camera position');
    const direction = point.clone().sub(prev);
    const distance = direction.length();
    if (distance > 1e-7) {
      ray.set(prev, direction.normalize());
      ray.far = distance;
      assert.equal(ray.intersectObject(ice).length, 0, 'camera segment must not cross an iceberg triangle');
    }
    prev = point;
  }
}

test('every ordered pair of iceberg views clears the actual mesh', () => {
  assert.equal(views.length, 5);
  for (const from of views) for (const to of views) {
    if (from !== to) verify(routes.route(from.pos, to.pos), from.pos, to.pos);
  }
});

test('travel to the ship clears the mesh from every depth, including the air', () => {
  const a = -1.54;
  const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const shipView = out.clone().multiplyScalar(40).addScaledVector(side, 23).setY(6);
  for (let i = 0; i <= 20; i++) {
    const from = pose(i / 20, { pos: new THREE.Vector3(), target: new THREE.Vector3() }).pos;
    verify(routes.route(from, shipView), from, shipView);
  }
});

test('stationary paths and floating-point endpoint overshoot remain finite', () => {
  const p = new THREE.Vector3(45, -20, 0);
  const stationary = routes.curve([p.clone(), p.clone()]);
  for (const t of [-1e-15, 0, 0.5, 1, 1 + 1e-15]) assert.ok(stationary.getPointAt(t).equals(p));
  const moving = routes.route(p, new THREE.Vector3(-45, -20, 0));
  assert.ok(moving.getPointAt(1 + 1e-15).toArray().every(Number.isFinite));
});

test('ship-to-contact motion keeps one cruising speed across the waterline', () => {
  const angle = -1.54;
  const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const ship = out.clone().multiplyScalar(40).addScaledVector(side, 23).setY(6);
  for (const view of views) {
    const path = routes.route(ship, view.pos);
    const speeds = [], before = [], after = [];
    let prev = path.getPointAt(travelProgress(0.1));
    for (let i = 101; i <= 900; i++) {
      const p = path.getPointAt(travelProgress(i / 1000));
      const distance = p.distanceTo(prev);
      speeds.push(distance);
      if (p.y > 0.5 && p.y < 3) before.push(distance);
      if (p.y < -0.5 && p.y > -3) after.push(distance);
      prev = p;
    }
    assert.ok(Math.max(...speeds) / Math.min(...speeds) < 1.03, `${view.id}: no mid-trip speed surge (${Math.min(...speeds)}–${Math.max(...speeds)})`);
    assert.ok(before.length && after.length, `${view.id}: sample both sides of the waterline`);
    const mean = (values) => values.reduce((a, b) => a + b) / values.length;
    assert.ok(Math.abs(mean(after) / mean(before) - 1) < 0.02, `${view.id}: consistent speed above and below water`);
  }
});

test('departure and arrival settle smoothly with no overshoot', () => {
  assert.equal(travelProgress(-1), 0);
  assert.equal(travelProgress(2), 1);
  const slope = (t) => (travelProgress(t + 1e-5) - travelProgress(t - 1e-5)) / 2e-5;
  assert.ok(slope(0) < 1e-5);
  assert.ok(slope(1) < 1e-5);
  assert.ok(Math.abs(slope(0.1 - 1e-5) - slope(0.1 + 1e-5)) < 1e-5);
  assert.ok(Math.abs(slope(0.9 - 1e-5) - slope(0.9 + 1e-5)) < 1e-5);
});
