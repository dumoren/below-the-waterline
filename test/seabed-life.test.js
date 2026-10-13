import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { buildSeabed } from '../src/world/underwater.js';
import { buildSeabedLife } from '../src/world/seabed-life.js';

test('habitat height matches ray intersections with the rendered terrain', () => {
  for (const mobile of [false, true]) {
    const bed = buildSeabed({}, { mobile });
    bed.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 120; i++) {
      const a = i * 2.39996, r = 20 + (i % 41);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      ray.set(new THREE.Vector3(x, -30, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(bed.children[0])[0];
      assert.ok(hit);
      assert.ok(Math.abs(hit.point.y - bed.userData.heightAt(x, z)) < 1e-5);
    }
  }
});

test('moving animals remain on or above the dunes as they travel', () => {
  const bed = buildSeabed({}, { mobile: false });
  const life = buildSeabedLife({ uTime: { value: 0 } }, { mobile: false, heightAt: bed.userData.heightAt, anchorPosition: new THREE.Vector3(1.4, -67, -45) });
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  for (const time of [0, 1, 15, 70, 200]) {
    life.userData.update(time);
    for (const name of ['Scuttling crabs', 'Bottom-dwelling fish']) {
      const mesh = life.getObjectByName(name);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        const clearance = position.y - bed.userData.heightAt(position.x, position.z);
        assert.ok(clearance > 0 && clearance < (name.includes('fish') ? 1.6 : 0.04));
      }
    }
  }
});

test('reduced motion holds habitat animals still', () => {
  const life = buildSeabedLife({ uTime: { value: 0 } }, { mobile: true, reduced: true, heightAt: () => -66, anchorPosition: new THREE.Vector3(1.4, -66, -45) });
  const crabs = life.getObjectByName('Scuttling crabs');
  const before = [...crabs.instanceMatrix.array];
  life.userData.update(25);
  assert.deepEqual([...crabs.instanceMatrix.array], before);
});

test('background vegetation covers all sides of the floor and leaves the focal clearing open', () => {
  for (const mobile of [false, true]) {
    const anchorPosition = new THREE.Vector3(1.4, -66, -45);
    const life = buildSeabedLife({ uTime: { value: 0 } }, { mobile, heightAt: () => -66, anchorPosition });
    const grass = life.getObjectByName('Swaying seagrass');
    const sectors = Array(8).fill(0), radii = [];
    const matrix = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const tile of grass.children) for (let i = 0; i < tile.count; i++) {
      tile.getMatrixAt(i, matrix); p.setFromMatrixPosition(matrix);
      assert.ok(Math.hypot(p.x - anchorPosition.x, p.z - anchorPosition.z) >= 16);
      sectors[Math.floor((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2) * 8) % 8]++;
      radii.push(Math.hypot(p.x, p.z));
    }
    assert.ok(sectors.every((n) => n > 8), 'each direction has scattered habitat');
    assert.ok(Math.max(...radii) > 130, 'habitat reaches the wider floor');
    assert.ok(Math.min(...radii) < 35, 'habitat also reaches the iceberg approach');
  }
});
