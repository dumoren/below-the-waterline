import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderQuality } from '../src/render-quality.js';

const quality = (options = {}) => createRenderQuality({ initialDpr: 1.75, maxDpr: 1.75, ...options });
function feed(controller, frames, interval = 1 / 60) {
  const changes = [];
  for (let i = 0; i < frames; i++) {
    const next = controller.sample(interval);
    if (next !== null) changes.push({ frame: i + 1, dpr: next });
  }
  return changes;
}

test('stable 60 fps stays at maximum without repeated resize decisions', () => {
  const q = quality();
  assert.deepEqual(feed(q, 3600), []);
  assert.equal(q.dpr, 1.75);
});

test('30 fps requires warmup, consecutive slow windows and cooldown', () => {
  const q = quality();
  assert.deepEqual(feed(q, 239, 1 / 30), []);
  const changes = feed(q, 181, 1 / 30);
  assert.equal(changes[0].dpr, 1.5);
  assert.equal(q.dpr, 1.5);
  const hitch = quality();
  feed(hitch, 240);
  assert.equal(hitch.sample(0.2), null);
  assert.deepEqual(feed(hitch, 1200), []);
});

test('long active intervals count their full 200 ms duration', () => {
  const q = quality({ warmupSeconds: 0, cooldownSeconds: 0, windowSeconds: 0.4 });
  assert.deepEqual(feed(q, 3, 0.2), []);
  assert.equal(q.sample(0.2), 1.5);
});

test('recovery needs four fast windows and all changes honor cooldown', () => {
  const q = quality({ initialDpr: 1.25, warmupSeconds: 0 });
  assert.deepEqual(feed(q, 479), []);
  assert.equal(q.sample(1 / 60), 1.375);
  assert.deepEqual(feed(q, 239, 1 / 30), []);
  assert.equal(q.sample(1 / 30), 1.125);
  assert.deepEqual(feed(q, 479), []);
  assert.equal(q.sample(1 / 60), 1.25);
});

test('reset discards partial windows and recovery/degradation evidence', () => {
  const q = quality({ warmupSeconds: 0, cooldownSeconds: 0 });
  feed(q, 119, 1 / 30);
  assert.equal(q.reset(), null);
  assert.deepEqual(feed(q, 119, 1 / 30), []);
  assert.equal(q.sample(1 / 30), 1.5);
  q.reset();
  assert.deepEqual(feed(q, 360), []);
  q.reset();
  assert.deepEqual(feed(q, 479), []);
  assert.equal(q.sample(1 / 60), 1.625);
});

test('neutral/opposite windows break consecutive evidence; thresholds do not oscillate', () => {
  const q = quality({ warmupSeconds: 0, cooldownSeconds: 0 });
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(feed(q, 60, 1 / 30), []);
    assert.deepEqual(feed(q, 100, 0.020), []);
    assert.deepEqual(feed(q, 120), []);
  }
  const threshold = quality({ initialDpr: 1.25, warmupSeconds: 0 });
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(feed(threshold, 81, 0.0249), []);
    assert.deepEqual(feed(threshold, 80, 0.0251), []);
  }
});

test('bounds clamp exactly, including fractional device DPR below one', () => {
  const q = quality();
  assert.deepEqual(feed(q, 3600, 1 / 30).map((x) => x.dpr), [1.5, 1.25, 1]);
  assert.deepEqual(feed(q, 7200).map((x) => x.dpr), [1.125, 1.25, 1.375, 1.5, 1.625, 1.75]);
  const low = quality({ initialDpr: 0.8, maxDpr: 0.8 });
  assert.deepEqual(feed(low, 1200, 0.2), []);
  assert.deepEqual(feed(low, 1200), []);
  assert.equal(low.dpr, 0.8);
});

test('invalid samples are ignored without poisoning subsequent decisions', () => {
  const q = quality();
  for (const input of [NaN, Infinity, -Infinity, 0, -1, undefined, null]) assert.equal(q.sample(input), null);
  assert.equal(q.dpr, 1.75);
  assert.equal(feed(q, 300, 1 / 30)[0].dpr, 1.5);
});

test('maximum changes expose an effective clamp and retain quality on later increases', () => {
  const q = quality();
  assert.equal(q.reset({ maxDpr: 1.2 }), 1.2);
  assert.equal(q.dpr, 1.2);
  assert.equal(q.reset({ maxDpr: 2 }), null);
  assert.equal(q.dpr, 1.2);
  assert.equal(q.reset({ maxDpr: 0.75 }), 0.75);
  assert.deepEqual(feed(q, 1200, 0.2), []);
});
