import './styles.css';
import * as THREE from 'three';
import { buildBergGeometry, bergMaterial, surfacePoint, waterlineTexture, profile } from './world/berg.js';
import { buildWater, buildSky } from './world/water.js';
import { buildSnow, buildShafts, buildSeabed, buildBubbles } from './world/underwater.js';
import { buildAnchor, buildChain } from './world/vessel.js';
import { buildShip, SHIP } from './world/ship.js';
import { buildFish } from './world/fish.js';
import { buildMarineLife, buildSchoolBeacon } from './world/marine-life.js';
import { buildSeabedLife } from './world/seabed-life.js';
import { cameraRoutes } from './camera-route.js';
import { travelProgress } from './camera-motion.js';
import { buildCrystal, buildProbe, buildTether, buildCore } from './world/contacts.js';
import { waterHeight } from './world/glsl.js';
import { pose, pForCamY, theta, setEndAngle, P_SURF, M_PER_UNIT } from './path.js';
import { buildPost } from './post.js';
import { createRenderQuality } from './render-quality.js';
import { Sea } from './audio.js';
import { stJohnsEnvironment, stormGlow } from './environment.js';
import { buildWeather } from './world/weather.js';
import { buildLightning } from './world/lightning.js';
import { UNDERWATER_SCALARS } from './underwater-environment.js';
import { DEFAULT_WAVES, WAVE_PHASES, composeMarineEnvironment } from './marine-environment.js';

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const smooth = (t) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

function webgl2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

const zoneEls = [...document.querySelectorAll('#log .zone')];
// Section colours apply to the log too, including the no-WebGL page.
zoneEls.forEach((z) => {
  z.style.setProperty('--c', z.dataset.color);
  z.querySelectorAll('.contacts > li').forEach((li) => li.style.setProperty('--c', li.dataset.color || z.dataset.color));
});
if (!webgl2() || !zoneEls.length) root.classList.add('no-webgl');
else start();

function start() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cardMobile = matchMedia('(max-width: 760px)');
  const small = cardMobile.matches;
  const mobile = coarse || small;

  // ───────────── Renderer ─────────────
  const canvas = $('#gl');
  // No canvas MSAA: the scene renders into the composer's own targets, so the canvas only
  // ever receives one full-screen quad and multisampling it would cost memory for nothing.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const maxDpr = () => Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  const quality = createRenderQuality({ initialDpr: maxDpr(), maxDpr: maxDpr() });
  let dpr = quality.dpr;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 16000);

  // ───────────── Shared uniforms ─────────────
  const U = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3() },
    uSiriusDir: { value: new THREE.Vector3() },
    uUnder: { value: 0 },
    uTorchDir: { value: new THREE.Vector3(0, 0, -1) },
    uTorch: { value: 0 },
    uPingO: { value: new THREE.Vector3() },
    uPingR: { value: 0 },
    uPingS: { value: 0 },
    uCPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 999, 0)) },
    uCCol: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
    uCPow: { value: new Array(6).fill(0) },
    uStrataY: { value: -999 },
    uStrataCol: { value: new THREE.Color() },
    uStrataPow: { value: 0 },
    uSchoolC: { value: new THREE.Vector3(20, -12, 0) },
    uFishGlow: { value: 0 },
    uAnchorHover: { value: 0 },
    uAnchorIdle: { value: 0 }, // the anchor's breathing rim while the visitor is at the bottom
    uAnchorPos: { value: new THREE.Vector3(0, -999, 0) },
    uFloorShade: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) }, // x, z, radius, strength
    uPixelRatio: { value: dpr },
    uBubbles: { value: 0 },
    uCamFwd: { value: new THREE.Vector3() },
    uDistant: { value: 0 },
    uWaterline: { value: null },
    uBoat: { value: new THREE.Vector4(0, 0, 0, 0) }, // x, z, heading, on
    uBoatSize: { value: new THREE.Vector2(SHIP.L / 2 + 0.3, SHIP.B / 2 + 0.25) },
  };

  const environmentKeys = ['daylight', 'sunStrength', 'moonStrength', 'moonDiskStrength', 'moonFraction', 'moonAngle', 'moonWaxing', 'sunElevation', 'sunAngularRadius', 'moonAngularRadius', 'twilight', 'ambient', 'cloud', 'rain', 'snow', 'fog', 'wind', 'ice', 'drizzle', 'thunder', ...UNDERWATER_SCALARS, 'seaEnergy'];
  U.uHorizonDip = { value: 0 };
  U.uWaterTint = { value: new THREE.Vector3(1, 1, 1) };
  U.uWaves = { value: DEFAULT_WAVES.map((wave) => new THREE.Vector4(...wave)) };
  U.uWavePhase = { value: new THREE.Vector3(...WAVE_PHASES) };
  U.uSeaCurrent = { value: new THREE.Vector2() };
  U.uCurrentOffset = { value: new THREE.Vector2() };
  U.uWaterTime = reduced ? { value: 0 } : U.uTime;
  U.uLightning = { value: 0 };
  U.uStormDir = { value: new THREE.Vector3(-0.8, 0, -0.6) };
  const uniformName = (key) => `u${key[0].toUpperCase()}${key.slice(1)}`;
  environmentKeys.forEach((key) => { U[uniformName(key)] = { value: 0 }; });
  let environmentTarget = null;
  const sunTarget = new THREE.Vector3(), moonTarget = new THREE.Vector3(), waterTintTarget = new THREE.Vector3();
  const skyRotation = new THREE.Quaternion(), skyStep = new THREE.Quaternion();
  function moveSkyDirection(value, target, blend) {
    // Quaternion arcs remain well-defined even when a preset puts a body opposite
    // its live direction. Linear vector blending can collapse through zero.
    skyRotation.setFromUnitVectors(value, target);
    skyStep.identity().slerp(skyRotation, blend);
    value.applyQuaternion(skyStep).normalize();
  }
  const waveTargets = DEFAULT_WAVES.map((wave) => new THREE.Vector4(...wave)), currentTarget = new THREE.Vector2();
  function applyEnvironment(conditions, immediate = false) {
    if (!conditions.sea) conditions = composeMarineEnvironment(conditions);
    const first = !environmentTarget;
    environmentTarget = conditions;
    root.style.setProperty('--sky-daylight', conditions.daylight);
    sunTarget.fromArray(conditions.sunDirection); moonTarget.fromArray(conditions.moonDirection);
    waterTintTarget.fromArray(conditions.waterTint);
    waveTargets.forEach((wave, i) => wave.fromArray(conditions.sea.waves[i]));
    currentTarget.fromArray(conditions.sea.current);
    if (first || immediate) {
      environmentKeys.forEach((key) => { U[uniformName(key)].value = conditions[key]; });
      U.uSunDir.value.copy(sunTarget); U.uMoonDir.value.copy(moonTarget);
      U.uWaterTint.value.copy(waterTintTarget);
      U.uWaves.value.forEach((wave, i) => wave.copy(waveTargets[i]));
      U.uSeaCurrent.value.copy(currentTarget);
    }
  }
  const environment = stJohnsEnvironment(applyEnvironment);
  window.addEventListener('pagehide', (e) => { if (!e.persisted) environment.dispose(); });

  // ───────────── World ─────────────
  const bergGeo = buildBergGeometry(5, 11);
  const routes = cameraRoutes(bergGeo);
  const berg = new THREE.Mesh(bergGeo, bergMaterial(U));
  scene.add(berg);
  U.uWaterline.value = waterlineTexture(bergGeo);

  // Distant bergs on the horizon, behind the hero view.
  const farU = { ...U, uDistant: { value: 1 } };
  const farMat = bergMaterial(farU);
  const heroLook = 0.95 + Math.PI;
  const farBergs = [];
  for (const [da, dist, s, rot, seed, width, height] of [
    [-0.32, 230, 0.6, 1.2, 29, 1.25, 0.72],
    [0.22, 300, 0.42, 2.6, 53, 0.85, 1.12],
    [0.55, 190, 0.3, 4.1, 87, 1.5, 0.6],
  ]) {
    const m = new THREE.Mesh(buildBergGeometry(3, seed), farMat);
    m.name = `Distant iceberg ${farBergs.length + 1}`;
    m.position.set(Math.cos(heroLook + da) * dist, -0.5, Math.sin(heroLook + da) * dist);
    m.scale.set(s * width, s * height, s);
    m.rotation.y = rot;
    scene.add(m);
    farBergs.push(m);
  }

  const water = buildWater(U, { mobile });
  const sky = buildSky(U);
  const snow = buildSnow(U, mobile ? 2600 : 6500);
  const shafts = buildShafts(U, mobile ? 10 : 16);
  const seabed = buildSeabed(U, { mobile });
  const fish = buildFish(U, mobile ? 300 : 650);
  const marineLife = buildMarineLife(U, { mobile });
  const schoolBeacon = buildSchoolBeacon(U);
  const bubbles = buildBubbles(U, mobile ? 160 : 320);
  const weatherParticles = buildWeather(U, { mobile, reduced });
  const lightning = buildLightning(U);
  scene.add(lightning);
  scene.add(water, sky, snow, shafts, seabed, fish, marineLife, schoolBeacon, bubbles, weatherParticles);
  const ray = new THREE.Raycaster();

  // ───────────── Contact: the vessel, its anchor and chain ─────────────
  // The boat sits on the camera side of the berg, right of it in the opening shot. Its chain
  // runs out ahead of the bow and down to an anchor well clear of the ice; the dive's spiral is
  // wound so it ends beside that anchor.
  const BOAT_ANGLE = -1.54;
  const BOAT_R = 31;
  const ANCHOR_R = 45;
  const vessel = buildShip(U);
  vessel.userData.base.set(Math.cos(BOAT_ANGLE) * BOAT_R, 0, Math.sin(BOAT_ANGLE) * BOAT_R);
  vessel.userData.heading = -BOAT_ANGLE; // bow (+x) points outward, toward the anchor
  U.uBoat.value.set(vessel.userData.base.x, vessel.userData.base.z, -BOAT_ANGLE, 1);
  vessel.userData.update(0);
  scene.add(vessel);
  const anchor = buildAnchor(U);
  {
    const ax = Math.cos(BOAT_ANGLE) * ANCHOR_R;
    const az = Math.sin(BOAT_ANGLE) * ANCHOR_R;
    ray.set(new THREE.Vector3(ax, -30, az), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(seabed.children[0])[0];
    anchor.position.set(ax, (hit ? hit.point.y : -66) - 0.6, az);
    anchor.rotation.set(0, -BOAT_ANGLE + Math.PI / 2, 1.05);
  }
  anchor.updateMatrixWorld();
  anchor.name = 'Return anchor';
  const anchorPickVolume = new THREE.Box3().setFromObject(anchor).getBoundingSphere(new THREE.Sphere());
  anchorPickVolume.radius += 0.6;
  scene.add(anchor);
  const seabedLife = buildSeabedLife(U, { mobile, heightAt: seabed.userData.heightAt, anchorPosition: anchor.position, reduced });
  // Ground the clearing: contact shadows under the anchor and both reef islands, and a pool of
  // light on the sand around them so those shadows have something to read against.
  U.uAnchorPos.value.copy(anchor.position);
  U.uFloorShade.value[0].set(anchor.position.x, anchor.position.z, 2.8, 0.7);
  seabedLife.userData.focusCenters.forEach((f, i) => U.uFloorShade.value[i + 1].set(f.x, f.y, 2.6, 0.75));
  scene.add(seabedLife);
  const ringWorld = anchor.userData.ringLocal.clone().applyMatrix4(anchor.matrixWorld);
  vessel.updateMatrixWorld();
  const bowWorld = vessel.userData.bowLocal.clone().applyMatrix4(vessel.matrixWorld);
  const chain = buildChain(U, ringWorld, bowWorld);
  scene.add(chain.mesh);
  const anchorLook = anchor.position.clone().add(new THREE.Vector3(0, 1.4, 0));
  // Final framing: close in on the anchor from the berg side, a little above it.
  const anchorView = (() => {
    const inward = new THREE.Vector3(-Math.cos(BOAT_ANGLE), 0, -Math.sin(BOAT_ANGLE));
    const side = new THREE.Vector3(-inward.z, 0, inward.x);
    const framing = mobile ? 2.2 : 1;
    return anchor.position.clone().addScaledVector(inward, 9.5 * framing).addScaledVector(side, 3.5 * framing).add(new THREE.Vector3(0, 4.2, 0));
  })();
  setEndAngle(BOAT_ANGLE - 0.25);
  // Where the camera settles "aboard": outboard of the boat, looking back across it at the berg.
  const boatOut = new THREE.Vector3(Math.cos(BOAT_ANGLE), 0, Math.sin(BOAT_ANGLE));
  const boatSide = new THREE.Vector3(-boatOut.z, 0, boatOut.x);
  const aboardLook = vessel.userData.base.clone().addScaledVector(boatOut, -2.5).add(new THREE.Vector3(0, 3.2, 0));
  // The vertical field of view is fixed, so on a wide screen the boat would sit small in a lot of
  // empty sea: come in closer there. Phones (tall screens) keep the full stand-off. Set on resize.
  const aboardView = new THREE.Vector3();
  function placeAboardView(aspect) {
    const wide = Math.min(1, Math.max(0, (aspect - 1) / 0.8));
    const d = 1 - 0.24 * wide;
    aboardView.copy(vessel.userData.base).addScaledVector(boatOut, 9 * d).addScaledVector(boatSide, 23 * d);
    aboardView.y += 6 - 1.6 * wide;
  }
  placeAboardView(window.innerWidth / Math.max(1, window.innerHeight));

  /** The chain's point at a given height. */
  const chainAtY = (y) => {
    const cy = Math.min(bowWorld.y, Math.max(ringWorld.y, y));
    return chain.at(Math.pow(Math.min(1, Math.max(0, (cy - ringWorld.y) / (bowWorld.y - ringWorld.y))), 1 / 1.25));
  };
  // The ascent: alongside the chain, then up through the surface ahead of the bow, well clear
  // of the hull, and back to the aboard view. A spline, walked at constant speed.
  const hullBelow = vessel.userData.base.clone().addScaledVector(boatOut, 3.5).add(new THREE.Vector3(0, -0.9, 0));
  function ascentPath(from) {
    const gate = chainAtY(from.y).addScaledVector(boatSide, 5.5).addScaledVector(boatOut, 2.5).setY(from.y);
    const pts = routes.route(from, gate).points;
    for (const y of [-46, -30, -15]) {
      if (y > from.y + 4) pts.push(chainAtY(y).addScaledVector(boatSide, 5.5).addScaledVector(boatOut, 2.5).setY(y));
    }
    const surf = vessel.userData.base.clone().addScaledVector(boatOut, 12.5).addScaledVector(boatSide, 6.5);
    surf.y = -2.4;
    pts.push(surf, aboardView.clone());
    return routes.curve(pts);
  }

  // ───────────── Sections and their contacts ─────────────
  // Each .zone in the log is a résumé section; its <li>s are the things found in it.
  const zones = zoneEls.map((el) => ({
    el,
    id: el.dataset.zone,
    label: el.dataset.label,
    singular: el.dataset.singular,
    n: el.dataset.n,
    from: el.dataset.from ? Number(el.dataset.from) : null,
    to: el.dataset.to ? Number(el.dataset.to) : null,
    color: el.dataset.color,
  }));
  const contacts = [];
  zones.forEach((z) =>
    z.el.querySelectorAll('.contacts > li').forEach((el, k) =>
      contacts.push({
        el,
        zone: z,
        idx: k + 1,
        id: el.dataset.id,
        depth: el.dataset.depth ? Number(el.dataset.depth) : null,
        color: el.dataset.color || z.color,
        angle: Number(el.dataset.angle || 0),
        seabed: el.hasAttribute('data-seabed'),
        school: el.dataset.kind === 'school',
        vessel: el.dataset.kind === 'vessel',
        title: el.querySelector('h4').textContent.trim(),
        found: false,
        flare: 0,
        hover: 0,
      }),
    ),
  );
  const placed = contacts.filter((c) => !c.school && !c.vessel).sort((a, b) => a.depth - b.depth);
  const school = contacts.find((c) => c.school) || null;
  const aboard = contacts.find((c) => c.vessel) || null;

  placed.forEach((c, gi) => {
    c.gi = gi;
    const col = new THREE.Color(c.color);
    U.uCCol.value[gi].set(col.r, col.g, col.b);
    const yC = -c.depth / M_PER_UNIT;
    c.p = Math.min(1, pForCamY(yC + 2.2));

    {
      const sp = surfacePoint(bergGeo, yC, theta(c.p) + c.angle);
      const n = sp.n.clone();
      if (n.x * sp.x + n.z * sp.z < 0) n.negate();
      n.y *= 0.4;
      n.normalize();
      const onIce = new THREE.Vector3(sp.x, sp.y, sp.z);
      c.normal = n;
      if (c.zone.id === 'projects') {
        // A probe moored a few metres off the ice.
        const at = onIce.clone().addScaledVector(n, 3.6).add(new THREE.Vector3(0, 0.8, 0));
        c.obj = buildProbe(U, c.color, 200 + gi);
        c.obj.scale.setScalar(1.35);
        c.obj.position.copy(at);
        c.obj.userData.base.copy(at);
        scene.add(buildTether(U, onIce, at.clone().add(new THREE.Vector3(0, -1.4, 0))));
        c.pos = at.clone();
      } else if (c.zone.id === 'education') {
        // A core drawn out of the base stratum, which glows all the way round the berg.
        // Laid mostly across the view (so its layers read), protruding from the ice.
        const across = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
        const axis = n.clone().multiplyScalar(0.28).addScaledVector(across, 0.93).add(new THREE.Vector3(0, 0.2, 0)).normalize();
        c.obj = buildCore(U, c.color);
        c.obj.position.copy(onIce).addScaledVector(n, 1.5).addScaledVector(axis, -1.6);
        c.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
        c.pos = onIce.clone().addScaledVector(n, 1.5);
        U.uStrataY.value = onIce.y;
        U.uStrataCol.value.set(c.color);
      } else {
        c.obj = buildCrystal(U, c.color, 100 + gi);
        c.obj.position.copy(onIce).addScaledVector(n, -0.35);
        c.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        c.obj.scale.setScalar(1.7);
        c.pos = onIce;
      }
    }
    scene.add(c.obj);
    U.uCPos.value[gi].copy(c.pos);
  });
  if (school) {
    school.pos = new THREE.Vector3().copy(U.uSchoolC.value);
    school.normal = new THREE.Vector3(1, 0, 0);
  }
  if (aboard) {
    aboard.pos = vessel.userData.base.clone().add(new THREE.Vector3(0, 2.5, 0)); // the boat itself: picking, marker, card
    aboard.normal = new THREE.Vector3(Math.cos(BOAT_ANGLE), 0, Math.sin(BOAT_ANGLE));
    aboard.depth = 0;
  }
  $('#total').textContent = String(contacts.length);

  // ───────────── Post ─────────────
  const { composer, bloom, lens } = buildPost(renderer, scene, camera, { mobile, waves: U.uWaves, wavePhase: U.uWavePhase });

  // ───────────── Layout ─────────────
  let W = 1;
  let H = 1;
  let renderWidth = 0, renderHeight = 0;
  function sizeRenderTargets() {
    const ratioChanged = renderer.getPixelRatio() !== quality.dpr;
    const sizeChanged = W !== renderWidth || H !== renderHeight;
    if (!ratioChanged && !sizeChanged) return;
    dpr = quality.dpr;
    if (ratioChanged) renderer.setPixelRatio(dpr);
    if (sizeChanged) renderer.setSize(W, H, false);
    // Each composer setter resizes its passes: only call the setters that changed.
    if (ratioChanged) composer.setPixelRatio(dpr);
    if (sizeChanged) composer.setSize(W, H);
    bloom.setSize(Math.round((W * dpr) / 2), Math.round((H * dpr) / 2));
    U.uPixelRatio.value = dpr;
    renderer.getDrawingBufferSize(lens.uniforms.uRes.value);
    renderWidth = W;
    renderHeight = H;
  }
  function resize() {
    // Never zero: a hidden or collapsing window can report 0, and every pointer and aspect
    // calculation divides by these.
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    placeAboardView(W / H);
    quality.reset({ maxDpr: maxDpr() });
    sizeRenderTargets();
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // Frame Sirius just above the opening horizon on both desktop and portrait.
    // This is an artistic placement; the live Sun/Moon keep their astronomical positions.
    const opening = pose(0, { pos: new THREE.Vector3(), target: new THREE.Vector3(), offset: 0 });
    const starCamera = new THREE.PerspectiveCamera(42, W / H, 0.1, 1400);
    starCamera.position.copy(opening.pos);
    starCamera.lookAt(opening.target);
    if (W / H > 1.05) starCamera.setViewOffset(W, H, -W * 0.13, 0, W, H);
    starCamera.updateMatrixWorld();
    U.uSiriusDir.value.set(0.04, 0.84, 1).unproject(starCamera).sub(opening.pos).normalize();
  }
  window.addEventListener('resize', resize);
  resize();

  // ───────────── Gauge: ticks, section bands, contact marks ─────────────
  const MAX_M = 200;
  const pct = (m) => `${(m / MAX_M) * 100}%`;
  const ticks = $('#gauge-ticks');
  for (let m = 0; m <= MAX_M; m += 10) {
    const t = document.createElement('i');
    t.style.top = pct(m);
    if (m % 50 === 0) {
      t.className = 'major';
      const l = document.createElement('span');
      l.textContent = String(m);
      l.style.top = pct(m);
      ticks.appendChild(l);
    }
    ticks.appendChild(t);
  }
  for (const z of zones) {
    if (z.from == null) continue;
    const band = document.createElement('div');
    band.className = 'gz';
    band.style.top = pct(z.from);
    band.style.height = pct(z.to - z.from);
    band.style.setProperty('--c', z.color);
    const l = document.createElement('span');
    l.textContent = z.label;
    band.appendChild(l);
    $('#gauge-zones').appendChild(band);
    z.band = band;
  }
  for (const c of placed) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.section = c.zone.id;
    b.style.top = pct(c.depth);
    b.style.setProperty('--c', c.color);
    b.setAttribute('aria-label', `${c.zone.singular}: dive to ${c.title}, ${c.depth} metres`);
    addGaugeLabel(b, `${c.title} · ${c.depth} m`);
    b.addEventListener('click', () => diveTo(c, true, b));
    $('#gauge-marks').appendChild(b);
    c.mark = b;
  }

  if (aboard) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.section = 'contact';
    b.style.top = '0%';
    b.style.setProperty('--c', aboard.color);
    b.setAttribute('aria-label', 'Contact: back on board, at the surface');
    addGaugeLabel(b, 'Contact · Come aboard');
    b.addEventListener('click', () => goAboard(b));
    $('#gauge-marks').appendChild(b);
    aboard.mark = b;
  }
  function addGaugeLabel(button, text) {
    const dot = document.createElement('span');
    dot.className = 'gauge-dot';
    const label = document.createElement('span');
    label.className = 'gauge-label';
    label.textContent = text;
    dot.setAttribute('aria-hidden', 'true');
    label.setAttribute('aria-hidden', 'true');
    button.append(dot, label);
  }

  // ───────────── Screen markers ─────────────
  for (const c of contacts) {
    const d = document.createElement('div');
    d.className = 'mk';
    d.dataset.section = c.zone.id;
    d.style.setProperty('--c', c.color);
    d.innerHTML = '<div class="ring"></div><div class="tag"><b></b><span></span><em></em></div>';
    d.querySelector('.tag b').textContent = c.zone.singular;
    d.querySelector('.tag span').textContent = c.title;
    d.querySelector('.tag em').textContent = c.school ? 'every depth' : c.vessel ? 'at the surface' : `−${c.depth} m`;
    d.style.opacity = '0';
    $('#markers').appendChild(d);
    c.marker = d;
  }
  // The anchor gets the same sonar ring as every other contact once the dive reaches it.
  const anchorMk = document.createElement('div');
  anchorMk.className = 'mk mk-anchor';
  anchorMk.dataset.section = 'contact';
  anchorMk.style.setProperty('--c', '#ff5a45');
  anchorMk.innerHTML = '<div class="ring"></div><div class="tag"><span>Come aboard ↑</span></div>';
  anchorMk.style.opacity = '0';
  $('#markers').appendChild(anchorMk);
  let bottomT = 0;

  // Label widths and the gauge's left edge, so labels can flip before they reach the rail.
  // Measured on resize (and once fonts load), never per frame.
  let gaugeLeft = Infinity;
  function measureMarkers() {
    gaugeLeft = $('.gauge').getBoundingClientRect().left - 12;
    for (const c of contacts) c.tagW = c.marker.querySelector('.tag').offsetWidth;
  }
  measureMarkers();
  window.addEventListener('resize', measureMarkers);
  document.fonts?.ready.then(measureMarkers);

  // ───────────── Zone titles ─────────────
  const zoneEl = $('#zone');
  let curZone = null;
  let zoneTimer = 0;
  const zoneAt = (m) => zones.find((z) => z.from != null && m >= z.from && m < z.to) || null;
  function showZone(z) {
    zoneEl.style.setProperty('--c', z.color);
    zoneEl.querySelector('.zone-n').textContent = z.n;
    zoneEl.querySelector('.zone-name').textContent = z.label;
    zoneEl.querySelector('.zone-range').textContent = `${z.from} – ${z.to} m`;
    zoneEl.classList.remove('show');
    void zoneEl.offsetWidth;
    zoneEl.classList.add('show');
    zoneTimer = 3.4;
    $('#announce').textContent = `${z.label}, ${z.from} to ${z.to} metres.`;
  }

  // ───────────── Card ─────────────
  const card = $('#card');
  let cardFor = null;
  let cardOnLeft = null;
  let cardWidth = 0, cardHeight = 0;
  let cardX = '', cardY = '';
  const cardProjection = new THREE.Vector3();
  const cardObserver = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0] ?? entry.borderBoxSize;
    cardWidth = box?.inlineSize ?? card.offsetWidth;
    cardHeight = box?.blockSize ?? card.offsetHeight;
    positionCard();
  });
  cardObserver.observe(card, { box: 'border-box' });
  function positionCard() {
    if (!cardFor || cardMobile.matches) return;
    cardProjection.copy(cardFor.pos).project(camera);
    const x = (cardProjection.x * 0.5 + 0.5) * W;
    const y = (-cardProjection.y * 0.5 + 0.5) * H;
    // Keep one side while reading; tiny camera shifts must not flip a wide card.
    if (cardOnLeft == null) cardOnLeft = x > W * 0.5;
    let cx = cardOnLeft ? x - cardWidth - 56 : x + 56;
    if (cardFor.vessel && W / H > 1.05) cx = Math.min(cx, Math.max(16, W * 0.05));
    cx = Math.max(16, Math.min(W - cardWidth - 96, cx));
    const cy = Math.max(80, Math.min(H - cardHeight - 24, y - cardHeight * 0.45));
    const nextX = `${cx.toFixed(1)}px`, nextY = `${cy.toFixed(1)}px`;
    if (cardX !== nextX) card.style.setProperty('--card-x', cardX = nextX);
    if (cardY !== nextY) card.style.setProperty('--card-y', cardY = nextY);
  }
  cardMobile.addEventListener('change', positionCard);
  let cardReturnFocus = null;
  let contactReturnFocus = null;
  let handlingRoute = false;
  function syncRoute(hash) {
    if (!handlingRoute && location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
  }
  function openCard(c, trigger = document.activeElement) {
    if (!cardFor) cardReturnFocus = trigger instanceof HTMLElement && trigger !== document.body && !card.contains(trigger) ? trigger : c.mark || $('#btn-log');
    cardOnLeft = null;
    cardFor = c;
    const body = card.querySelector('.card-body');
    const k = document.createElement('p');
    k.className = 'card-k';
    const kl = document.createElement('span');
    kl.textContent = c.school || c.vessel ? `${c.zone.n} · ${c.zone.singular}` : `${c.zone.n} · ${c.zone.singular} ${String(c.idx).padStart(2, '0')}`;
    const kr = document.createElement('span');
    kr.className = 'card-d';
    kr.textContent = c.school ? 'every depth' : c.vessel ? '0 m · on board' : `−${c.depth} m`;
    k.append(kl, kr);
    const nodes = [k];
    for (const sel of ['h4', '.role', '.when', '.stats', '.line', '.details', '.skills', '.tags', '.links']) {
      const n = c.el.querySelector(sel);
      if (!n) continue;
      let copy = n.cloneNode(true);
      copy.querySelectorAll('button').forEach((btn) => btn.replaceWith(...btn.childNodes));
      if (sel === 'h4') {
        // In the card the title sits directly under the page's h1.
        const h2 = document.createElement('h2');
        h2.id = 'card-title';
        h2.append(...copy.childNodes);
        copy = h2;
      }
      nodes.push(copy);
    }
    if (c.zone.id === 'projects') {
      const share = document.createElement('button');
      share.type = 'button';
      share.className = 'share-project';
      share.textContent = 'Copy project link';
      share.addEventListener('click', async () => {
        const url = new URL(`#project/${c.id}`, location.href).href;
        try {
          await navigator.clipboard.writeText(url);
          share.textContent = 'Link copied';
          $('#announce').textContent = `Link to ${c.title} copied.`;
        } catch {
          const link = document.createElement('input');
          link.type = 'text';
          link.readOnly = true;
          link.value = url;
          link.setAttribute('aria-label', `Shareable link to ${c.title}`);
          link.style.width = '100%';
          share.replaceWith(link);
          link.focus();
          link.select();
          $('#announce').textContent = 'Select and copy the project URL.';
        }
      });
      nodes.push(share);
      syncRoute(`#project/${c.id}`);
    } else if (location.hash.startsWith('#project/') || location.hash === '#log') syncRoute('#surface');
    body.replaceChildren(...nodes);
    body.scrollTop = 0;
    card.dataset.section = c.zone.id;
    card.style.setProperty('--c', c.color);
    card.hidden = false;
    card.inert = false;
    // Reuse the opening transition's event-time layout flush for the unscaled cache.
    cardWidth = card.offsetWidth;
    cardHeight = card.offsetHeight;
    positionCard();
    card.classList.add('open');
    card.focus({ preventScroll: true });
    $('#announce').textContent = `${c.zone.singular}: ${c.title}. ${c.el.querySelector('.line, .role')?.textContent ?? ''}`;
  }
  function closeCard(restoreFocus = true, updateRoute = true, animate = true) {
    if (!cardFor) return;
    const trigger = cardReturnFocus;
    const fallback = cardFor.mark || $('#btn-log');
    const wasProject = cardFor.zone.id === 'projects';
    const wasVessel = cardFor.vessel;
    if (wasVessel && animate) returnToIceberg();
    cardFor = null;
    focus = null;
    if (animate && !wasVessel) moveToPose(pTarget);
    cardReturnFocus = null;
    card.inert = true;
    card.classList.remove('open');
    if (restoreFocus) {
      if (trigger?.isConnected && trigger.closest('#log')) setLog(true, updateRoute);
      const target = trigger?.isConnected && trigger.getClientRects().length && !trigger.closest('[hidden], [inert]') ? trigger : fallback;
      target.focus({ preventScroll: true });
    } else if (card.contains(document.activeElement)) fallback.focus({ preventScroll: true });
    if (updateRoute && wasProject && !root.classList.contains('log-open')) syncRoute('#surface');
    setTimeout(() => {
      if (!cardFor) card.hidden = true;
    }, 400);
  }
  $('#card-x').addEventListener('click', () => closeCard());

  // ───────────── State ─────────────
  const P = { pos: new THREE.Vector3(), target: new THREE.Vector3(), offset: 0 };
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const lookOff = new THREE.Vector2();
  const schoolTarget = new THREE.Vector3();
  let p = 0;
  let pTarget = 0;
  let pVel = 0;
  let idle = 0;
  let focus = null;
  let focusK = 0;
  let under = false;
  let underK = 0;
  let t = 0;
  let found = 0;
  let lastPing = -99;
  let started = false;
  const pointer = { x: 0, y: 0, has: false, down: null };
  const zoomMedia = matchMedia('(max-width: 760px), (pointer: coarse)');
  const zoomControls = $('#scene-zoom');
  const zoomOut = $('#zoom-out'), zoomIn = $('#zoom-in'), zoomLevel = $('#zoom-level');
  const WIDE_ZOOM = 0.55, MIN_ZOOM = 0.5, MAX_ZOOM = 1.25;
  let zoomEnabled = zoomMedia.matches;
  let zoomTarget = zoomEnabled ? WIDE_ZOOM : 1;
  let viewZoom = zoomTarget;
  const minViewZoom = () => Math.max(MIN_ZOOM, Math.tan(camera.fov * Math.PI / 360)); // at most 90° vertically
  function changeZoom(value) {
    zoomTarget = THREE.MathUtils.clamp(value, minViewZoom(), MAX_ZOOM);
  }
  function syncZoomAvailability() {
    zoomEnabled = zoomMedia.matches;
    zoomControls.hidden = !zoomEnabled;
    root.classList.toggle('has-scene-zoom', zoomEnabled);
    zoomTarget = zoomEnabled ? WIDE_ZOOM : 1;
    if (reduced) viewZoom = zoomTarget;
  }
  zoomMedia.addEventListener('change', syncZoomAvailability);
  syncZoomAvailability();
  zoomOut.addEventListener('click', () => changeZoom(Math.max(zoomTarget, minViewZoom()) - 0.15));
  zoomIn.addEventListener('click', () => changeZoom(Math.max(zoomTarget, minViewZoom()) + 0.15));
  $('#zoom-reset').addEventListener('click', () => changeZoom(WIDE_ZOOM));
  const touchPoints = new Map();
  let pinch = null;
  let pinchUsed = false;
  const pinchDistance = () => {
    const [a, b] = [...touchPoints.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const ping = { r: 0, s: 0, active: false, o: new THREE.Vector3() };
  const PING_RANGE = 30;
  const sea = new Sea();

  const hint = $('#hint');
  const moved = () => {
    started = true;
    hint.classList.add('gone');
  };

  // Contact lives on the boat. From the air, glide over; from underwater, follow the chain up.
  const ascent = { on: false, k: 0, dur: 3, path: null, from: new THREE.Vector3(), fromT: new THREE.Vector3() };
  const transit = { on: false, k: 0, dur: 2, path: null, fromT: new THREE.Vector3(), toT: new THREE.Vector3(), fromFov: 54, toFov: 54, fromOffset: 0, toOffset: 0, toP: 0, focused: false };
  const currentOffset = () => camera.view?.enabled ? -camera.view.offsetX / camera.view.fullWidth / 0.13 : 0;
  function travelTo(to, target, toP, focused, offset, fov) {
    returning.on = ascent.on = false;
    transit.path = routes.route(camera.position, routes.protect(to.clone()));
    camera.getWorldDirection(transit.fromT).multiplyScalar(15).add(camera.position);
    transit.toT.copy(target);
    Object.assign(transit, { on: true, k: 0, dur: reduced ? 0.35 : Math.min(2, Math.max(0.65, transit.path.getLength() / 75)), toP, focused, fromFov: camera.fov, toFov: fov, fromOffset: currentOffset(), toOffset: offset });
  }
  function moveToPose(progress) {
    const dest = pose(progress, { pos: new THREE.Vector3(), target: new THREE.Vector3(), offset: 0 });
    const endK = smooth((progress - 0.86) / 0.14);
    dest.pos.lerp(anchorView, endK * 0.85);
    dest.target.lerp(anchorLook, endK * 0.92);
    travelTo(dest.pos, dest.target, progress, false, dest.offset, 42 + 12 * smooth(progress / P_SURF));
  }
  const returning = {
    on: false, k: 0, dur: 2.8, path: null,
    fromT: new THREE.Vector3(), toT: new THREE.Vector3(),
    fromFov: 42, fromOffset: 0,
  };
  function returnToIceberg() {
    if (returning.on || ascent.on) return;
    const opening = pose(0, { pos: new THREE.Vector3(), target: new THREE.Vector3(), offset: 0 });
    const from = camera.position.clone();
    const height = Math.max(from.y, opening.pos.y) + 4;
    // Lift away from the deck, then arc across open water to the original framing.
    returning.path = new THREE.CatmullRomCurve3([
      from,
      from.clone().lerp(opening.pos, 0.28).setY(height),
      from.clone().lerp(opening.pos, 0.72).setY(height - 1),
      opening.pos,
    ], false, 'centripetal', 0.5);
    camera.getWorldDirection(returning.fromT).multiplyScalar(from.distanceTo(aboardLook)).add(from);
    returning.toT.copy(opening.target);
    returning.fromFov = camera.fov;
    returning.fromOffset = camera.view?.enabled ? -camera.view.offsetX / camera.view.fullWidth / 0.13 : 0;
    returning.k = 0;
    returning.dur = reduced ? 0.35 : 1.25;
    returning.on = true;
    p = 0;
    focusK = 0;
    $('#announce').textContent = 'Returning over the water to the iceberg. The dive begins again.';
  }
  function goAboard(trigger = document.activeElement) {
    if (!aboard || returning.on || ascent.on) return;
    moved();
    contactReturnFocus = trigger instanceof HTMLElement && !card.contains(trigger) ? trigger : aboard.mark;
    if (cardFor === aboard) return;
    closeCard(false, false, false);
    focus = null;
    transit.on = false;
    Object.assign(ascent, { on: true, k: 0, air: !under, fromFov: camera.fov, fromOffset: currentOffset() });
    ascent.from.copy(camera.position);
    camera.getWorldDirection(ascent.fromT).multiplyScalar(15).add(camera.position);
    ascent.path = under ? ascentPath(camera.position) : routes.route(camera.position, aboardView);
    ascent.dur = reduced ? 0.35 : Math.min(2.8, Math.max(1.1, ascent.path.getLength() / 75));
    $('#announce').textContent = under ? 'Gliding around the iceberg, then following the anchor chain to the boat.' : 'Gliding over the water to the boat.';
  }

  function diveTo(c, open, trigger = document.activeElement) {
    if (c.vessel) return goAboard(trigger);
    moved();
    if (cardFor && cardFor !== c) closeCard(false, !open, false);
    if (!open) focus = null;
    if (!c.school) pTarget = c.p;
    idle = 0;
    if (open) {
      focus = c;
      discover(c);
      openCard(c, trigger);
      const to = c.pos.clone().addScaledVector(c.normal, c.school ? (mobile ? 22 : 11) : 12.5).add(new THREE.Vector3(0, 1.6, 0));
      travelTo(to, c.pos, c.school ? pTarget : c.p, true, 0, 54);
    } else moveToPose(pTarget);
  }

  function discover(c) {
    c.flare = 1;
    if (c.found) return;
    c.found = true;
    found++;
    $('#found').textContent = String(found);
    const f = $('.tools .found');
    f.classList.remove('bump');
    void f.offsetWidth;
    f.classList.add('bump');
    c.mark?.classList.add('found');
    c.marker.classList.add('found');
    sea.chime(c.gi ?? (c.school ? 6 : 5));
  }

  function doPing() {
    ping.o.copy(camera.position);
    ping.r = 0;
    ping.s = 1;
    ping.active = true;
    lastPing = t;
    sea.ping();
  }

  // ───────────── Input ─────────────
  window.addEventListener(
    'wheel',
    (e) => {
      if (root.classList.contains('log-open')) return;
      if (e.target.closest?.('#weather-control')) return;
      if (e.target.closest?.('#card')) return;
      if (e.target.closest?.('#scene-zoom')) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (ascent.on) return;
      const d = Math.max(-120, Math.min(120, e.deltaY * unit));
      pTarget = Math.min(1, Math.max(0, pTarget + d * 0.00032));
      idle = 0;
      if (focus) closeCard(false);
      moved();
    },
    { passive: false },
  );

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zoomEnabled && touchPoints.size >= 2) {
        pinch = { distance: Math.max(1, pinchDistance()), zoom: Math.max(zoomTarget, minViewZoom()) };
        pinchUsed = true;
        pointer.down = null;
        pointer.has = false;
        return;
      }
    }
    pointer.down = { x: e.clientX, y: e.clientY, py: e.clientY, moved: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchUsed) {
        if (pinch && touchPoints.size >= 2) changeZoom(pinch.zoom * pinchDistance() / pinch.distance);
        return;
      }
    }
    pointer.x = (e.clientX / W) * 2 - 1;
    pointer.y = -(e.clientY / H) * 2 + 1;
    pointer.has = true;
    const d = pointer.down;
    if (d && e.pointerType !== 'mouse') {
      const dy = e.clientY - d.py;
      d.py = e.clientY;
      d.moved += Math.abs(dy);
      pTarget = Math.min(1, Math.max(0, pTarget - dy * 0.0011));
      idle = 0;
      if (d.moved > 10) {
        if (focus) closeCard(false);
        moved();
      }
    } else if (d) {
      d.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    touchPoints.delete(e.pointerId);
    if (pinchUsed) {
      if (!touchPoints.size) { pinch = null; pinchUsed = false; }
      pointer.down = null;
      return;
    }
    const d = pointer.down;
    pointer.down = null;
    if (!d || d.moved > 10) return;
    pointer.x = (e.clientX / W) * 2 - 1;
    pointer.y = -(e.clientY / H) * 2 + 1;
    const hit = pick();
    if (hit) diveTo(hit, true);
    else if (ascent.on) return;
    else if (!under) diveTo(placed[0], false);
    else {
      if (focus) closeCard(false);
      doPing();
      moved();
    }
  });
  canvas.addEventListener('pointercancel', (e) => {
    touchPoints.delete(e.pointerId);
    pointer.down = null;
    if (!touchPoints.size) { pinch = null; pinchUsed = false; }
  });
  canvas.addEventListener('pointerleave', () => (pointer.has = false));

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, #weather-control, #scene-zoom')) return;
    // Reading controls keep their native Enter/Space and scrolling keys.
    if (e.target.closest?.('#card') && !['Escape', 'm', 'M', 'l', 'L'].includes(e.key)) return;
    if (root.classList.contains('log-open')) {
      if (e.key === 'Escape') setLog(false);
      return;
    }
    const k = e.key;
    const next = (dir) => {
      const cur = focus && !focus.school ? focus.p : pTarget;
      const list = dir > 0 ? placed : [...placed].reverse();
      const c = list.find((c) => (dir > 0 ? c.p > cur + 0.004 : c.p < cur - 0.004));
      if (c) diveTo(c, false);
      else if (dir < 0) {
        pTarget = 0;
        closeCard();
      }
    };
    if (k === 'ArrowDown' || k === 'PageDown' || k === 'j') {
      e.preventDefault();
      if (focus) closeCard(false);
      next(1);
    } else if (k === 'ArrowUp' || k === 'PageUp' || k === 'k') {
      e.preventDefault();
      if (focus) closeCard(false);
      next(-1);
    } else if (k === ' ' && !e.target.closest?.('button, a')) {
      e.preventDefault();
      if (under) doPing();
      else diveTo(placed[0], false);
    } else if (k === 'Enter' && !e.target.closest?.('button, a') && p > 0.93) {
      goAboard();
    } else if (k === 'Enter' && !e.target.closest?.('button, a')) {
      const c = placed.reduce((a, b) => (Math.abs(b.p - p) < Math.abs(a.p - p) ? b : a));
      if (Math.abs(c.p - p) < 0.05) diveTo(c, true);
    } else if (k === 'Escape') closeCard();
    else if (k === 'Home') {
      pTarget = 0;
      closeCard(false);
    } else if (k === 'End') diveTo(placed[placed.length - 1], false);
    else if (k === 'l' || k === 'L') setLog(true);
    else if (k === 'm' || k === 'M') toggleSound();
  });

  // ───────────── Buttons ─────────────
  const soundBtn = $('#btn-sound');
  async function toggleSound() {
    if (sea.on) sea.disable();
    else await sea.enable();
    soundBtn.setAttribute('aria-pressed', String(sea.on));
  }
  soundBtn.addEventListener('click', toggleSound);
  $('#btn-contact').addEventListener('click', () => goAboard($('#btn-contact')));
  const aboardBtn = $('#aboard');
  aboardBtn.addEventListener('click', () => goAboard(aboardBtn));
  // The button and the anchor do the same thing: light one while the other is pointed at.
  let aboardBtnHot = false;
  for (const [ev, on] of [['pointerenter', true], ['pointerleave', false], ['focus', true], ['blur', false]])
    aboardBtn.addEventListener(ev, () => (aboardBtnHot = on));

  const resurface = $('#resurface');
  const gaugeEl = $('.gauge');
  const hero = $('#hero'), brandLink = $('.brand a');
  const depthEl = $('#depth'), tempEl = $('#temp'), pressureEl = $('#atm');
  const gaugeNow = $('#gauge-now'), gaugeFill = $('#gauge-fill');
  const hud = {};
  resurface.addEventListener('click', () => {
    pTarget = 0;
    closeCard(false);
  });
  document.querySelectorAll('[data-surface]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      pTarget = 0;
      closeCard(false);
    }),
  );

  // Dive log overlay; its titles become buttons that dive straight to each contact.
  let logReturnFocus = null;
  function setLog(open, updateRoute = true) {
    if (open && !root.classList.contains('log-open')) logReturnFocus = document.activeElement;
    root.classList.toggle('log-open', open);
    syncAnimation();
    $('#dive').inert = open;
    if (open) $('#log').focus({ preventScroll: true });
    else {
      const target = logReturnFocus instanceof HTMLElement && logReturnFocus.closest('#dive') && !logReturnFocus.closest('[hidden], [inert]') ? logReturnFocus : $('#btn-log');
      target.focus({ preventScroll: true });
    }
    if (updateRoute) syncRoute(open ? '#log' : cardFor?.zone.id === 'projects' ? `#project/${cardFor.id}` : '#surface');
  }
  document.querySelectorAll('[data-open-log]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      setLog(true);
    }),
  );
  $('#btn-close-log').addEventListener('click', () => setLog(false));
  contacts.forEach((c) => {
    const h = c.el.querySelector('h4');
    const b = document.createElement('button');
    b.type = 'button';
    b.append(...h.childNodes);
    h.appendChild(b);
    b.addEventListener('click', () => {
      setLog(false, false);
      if (c.school) pTarget = Math.max(pTarget, placed[0].p);
      if (c.vessel) goAboard(b);
      else diveTo(c, true, b);
    });
  });

  // ───────────── Picking ─────────────
  const ndc = new THREE.Vector2();
  function facing(c) {
    const toCam = camera.position.clone().sub(c.pos);
    return c.normal.dot(toCam.normalize()) > -0.05;
  }
  function pick() {
    if (ascent.on) return null;
    ndc.set(pointer.x, pointer.y);
    ray.setFromCamera(ndc, camera);
    // The anchor is also the return control. A forgiving volume includes its ring,
    // arms and stock, so tapping a thin piece of iron works on touchscreens too.
    if (under && p > 0.86 && anchor.visible && camera.position.distanceTo(anchorPickVolume.center) < 45 && ray.ray.intersectsSphere(anchorPickVolume)) return aboard;
    let best = null;
    let bd = Infinity;
    for (const c of contacts) {
      if (c.vessel === under) continue; // the boat from the air; everything else underwater
      const d = c.pos.distanceTo(camera.position);
      if (d > (c.vessel ? 140 : 70) || (!c.vessel && !facing(c))) continue;
      const r = c.school ? 4.5 : c.vessel ? 5.5 : 1.6 + d * 0.035;
      if (ray.ray.distanceSqToPoint(c.pos) < r * r && d < bd) {
        best = c;
        bd = d;
      }
    }
    return best;
  }

  // ───────────── Loop ─────────────
  const v = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upv = new THREE.Vector3();
  const lift = new THREE.Vector3();
  let hoverAcc = 0;
  let stormTime = 0;
  let thunderCycle = -1;
  let hovered = null;

  function tick(dt, draw = true, stormDt = dt) {
    environment.step(stormDt);
    t += dt;
    // Lightning must stay brief even when expensive frames slow the simulation clock.
    stormTime += stormDt;
    U.uTime.value = t;
    const envBlend = reduced ? 1 : 1 - Math.exp(-Math.min(2, stormDt) * 1.2);
    environmentKeys.forEach((key) => { const uniform = U[uniformName(key)]; uniform.value += (environmentTarget[key] - uniform.value) * envBlend; });
    moveSkyDirection(U.uSunDir.value, sunTarget, envBlend);
    moveSkyDirection(U.uMoonDir.value, moonTarget, envBlend);
    U.uWaterTint.value.lerp(waterTintTarget, envBlend);
    U.uSeaCurrent.value.lerp(currentTarget, envBlend);
    U.uWaves.value.forEach((wave, i) => {
      wave.lerp(waveTargets[i], envBlend);
      if (!reduced) U.uWavePhase.value.setComponent(i, (U.uWavePhase.value.getComponent(i) + wave.w * dt) % (Math.PI * 2));
    });
    if (!reduced) U.uCurrentOffset.value.addScaledVector(U.uSeaCurrent.value, dt);
    U.uLightning.value = stormGlow(stormTime, U.uThunder.value, reduced);
    lightning.userData.update(stormTime, camera.aspect);
    // Use the rendered sky, including cloud/storm dimming, rather than the visitor's clock.
    // A small dead band keeps the frame stable around dawn and changing cloud cover.
    const skyBrightness = U.uDaylight.value * (1 - U.uCloud.value * 0.65) * (1 - U.uThunder.value * 0.45) + U.uTwilight.value * 0.1;
    const cardTheme = card.dataset.weather;
    const nextCardTheme = cardTheme === 'light' ? (skyBrightness < 0.36 ? 'dark' : 'light') : (skyBrightness > 0.46 ? 'light' : 'dark');
    if (cardTheme !== nextCardTheme) card.dataset.weather = nextCardTheme;
    const stormCycle = Math.floor(stormTime / 19);
    // The rumble arrives several seconds after the distant bolt, using the sound toggle.
    if (stormTime % 19 >= 8 && stormCycle !== thunderCycle) {
      thunderCycle = stormCycle;
      if (U.uThunder.value > 0.2 && U.uUnder.value < 0.5) sea.thunder(U.uThunder.value);
    }

    // Progress, with a gentle magnet onto contacts once scrolling stops.
    idle += dt;
    if (!returning.on && !transit.on && !ascent.on && !focus && idle > 0.7) {
      const c = placed.reduce((a, b) => (Math.abs(b.p - pTarget) < Math.abs(a.p - pTarget) ? b : a));
      if (Math.abs(c.p - pTarget) < 0.03) pTarget += (c.p - pTarget) * (1 - Math.exp(-dt * 3));
    }
    const prev = p;
    if (!returning.on && !transit.on && !ascent.on) p += (pTarget - p) * (1 - Math.exp(-dt * (reduced ? 8 : 2.4)));
    pVel = (p - prev) / Math.max(dt, 1e-4);
    pose(p, P);

    // Focus: glide in front of the contact.
    if (!returning.on && !transit.on && !ascent.on) focusK += ((focus ? 1 : 0) - focusK) * (1 - Math.exp(-dt * 2.4));
    camPos.copy(P.pos);
    camTarget.copy(P.target);
    // At the bottom, settle the gaze onto the anchor and the chain rising from it.
    const endK = smooth((p - 0.86) / 0.14);
    if (endK > 0) {
      camPos.lerp(anchorView, endK * 0.85);
      camTarget.lerp(anchorLook, endK * 0.92);
    }
    const fc = focus || cardFor;
    if (fc && focusK > 0.001) {
      const k = smooth(focusK);
      if (fc.vessel) {
        camPos.lerp(aboardView, k);
        camTarget.lerp(aboardLook, k);
      } else {
        lift.set(0, 1.6, 0);
        v.copy(fc.pos).addScaledVector(fc.normal, fc.school ? (mobile ? 22 : 11) : 12.5).add(lift);
        routes.protect(v);
        camPos.lerp(v, k);
        camTarget.lerp(fc.pos, k);
      }
    }

    // The ascent: up along the chain, bubbles streaming past, and out beside the boat.
    if (ascent.on) {
      ascent.k = Math.min(1, ascent.k + dt / ascent.dur);
      const kk = ascent.k;
      const e = travelProgress(kk);
      ascent.path.getPointAt(e, camPos);
      // Gaze: up the chain while deep, at the hull overhead near the surface, then aboard.
      const a = smooth((e - 0.6) / 0.2);
      const b = smooth((e - 0.82) / 0.18);
      // Hold the iceberg in view during the orbit, then turn toward the chain and deck.
      v.set(0, camPos.y, 0).lerp(chainAtY(camPos.y + 10), smooth((e - 0.25) / 0.35)).lerp(hullBelow, a).lerp(aboardLook, b);
      if (ascent.air) v.copy(aboardLook);
      camTarget.copy(ascent.fromT).lerp(v, smooth(kk / 0.3));
      U.uBubbles.value = 1 - b;
      if (ascent.k >= 1) {
        ascent.on = false;
        p = pTarget = 0;
        focus = aboard;
        focusK = 1;
        discover(aboard);
        openCard(aboard, contactReturnFocus);
      }
    }

    // Complete the loop before allowing queued scrolling to move down the dive path.
    let viewOffset = P.offset * (1 - smooth(focusK));
    let fieldOfView = focus?.vessel ? 42 : 42 + 12 * smooth(p / P_SURF) + (mobile ? 22 * endK * (1 - focusK) : 0);
    // Preserve the starting lens framing throughout every camera move.
    if (ascent.on || ascent.k === 1 && focus?.vessel) {
      const e = travelProgress(ascent.k);
      viewOffset = THREE.MathUtils.lerp(ascent.fromOffset, 0, e);
      fieldOfView = THREE.MathUtils.lerp(ascent.fromFov, 42, e);
    }
    if (transit.on) {
      transit.k = Math.min(1, transit.k + dt / transit.dur);
      const k = transit.k;
      const e = travelProgress(k);
      transit.path.getPointAt(e, camPos);
      camTarget.copy(transit.fromT).lerp(transit.toT, e);
      viewOffset = THREE.MathUtils.lerp(transit.fromOffset, transit.toOffset, e);
      fieldOfView = THREE.MathUtils.lerp(transit.fromFov, transit.toFov, e);
      if (k >= 1) {
        transit.on = false;
        p = transit.toP;
        focusK = transit.focused ? 1 : 0;
      }
    }
    if (returning.on) {
      returning.k = Math.min(1, returning.k + dt / returning.dur);
      const k = returning.k;
      const e = travelProgress(k);
      returning.path.getPointAt(e, camPos);
      camTarget.copy(returning.fromT).lerp(returning.toT, e);
      viewOffset = THREE.MathUtils.lerp(returning.fromOffset, 1, e);
      fieldOfView = THREE.MathUtils.lerp(returning.fromFov, 42, e);
      // Suppress pointer parallax during the pan and ease it back in on the next frames.
      lookOff.set(0, 0);
      if (k >= 1) returning.on = false;
    }

    // Look-around parallax from the pointer.
    lookOff.x += ((pointer.has ? pointer.x : 0) - lookOff.x) * (1 - Math.exp(-dt * 2));
    lookOff.y += ((pointer.has ? pointer.y : 0) - lookOff.y) * (1 - Math.exp(-dt * 2));
    // This offset feeds back into itself every frame, so one bad value would stick forever
    // (and turn the whole view black). Recover instead.
    if (!Number.isFinite(lookOff.x) || !Number.isFinite(lookOff.y)) lookOff.set(0, 0);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    upv.crossVectors(right, fwd);
    const lookAmt = reduced || returning.on || transit.on || ascent.on ? 0 : 1.6 * (1 - focusK * 0.6);
    camTarget.addScaledVector(right, lookOff.x * lookAmt).addScaledVector(upv, lookOff.y * lookAmt * 0.6);
    if (!reduced) camera.position.y += Math.sin(t * 0.6) * 0.08 * underK;
    camera.lookAt(camTarget);
    camera.fov = fieldOfView;
    viewZoom += (zoomTarget - viewZoom) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
    // Use the lens zoom so travel's base FOV and its interpolation remain independent.
    camera.zoom = zoomEnabled ? Math.max(minViewZoom(), viewZoom) : viewZoom;
    zoomOut.disabled = zoomTarget <= minViewZoom() + 0.005;
    zoomIn.disabled = zoomTarget >= MAX_ZOOM - 0.005;
    const zoomText = `${camera.zoom.toFixed(2).replace(/0$/, '')}×`;
    if (zoomLevel.textContent !== zoomText) zoomLevel.textContent = zoomText;
    if (viewOffset > 0.001 && W / H > 1.05) camera.setViewOffset(W, H, -W * 0.13 * viewOffset, 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    U.uHorizonDip.value = -Math.sqrt(2 * Math.max(0, camera.position.y) * M_PER_UNIT / 6371000);

    // Above or below?
    const wh = waterHeight(camera.position.x, camera.position.z, U.uWaves.value, U.uWavePhase.value);
    under = camera.position.y < wh;
    weatherParticles.visible = !under && Math.max(U.uRain.value, U.uSnow.value, U.uIce.value) > 0.01;
    underK += ((under ? 1 : 0) - underK) * (1 - Math.exp(-dt * 6));
    U.uUnder.value = under ? 1 : 0;
    const depthM = Math.max(0, (wh - camera.position.y) * M_PER_UNIT);
    snow.visible = shafts.visible = fish.visible = marineLife.visible = schoolBeacon.visible = bubbles.visible = under;
    // The horizon bergs only draw above the surface (their shader discards below it).
    for (const m of farBergs) m.visible = !under;
    seabed.visible = anchor.visible = camera.position.y < -18;
    seabedLife.visible = under && camera.position.y < -18;
    if (seabedLife.visible) seabedLife.userData.update(t);
    vessel.userData.update(t);
    sky.position.copy(camera.position);

    // The Toolkit school drifts after the diver: a little ahead, between camera and ice.
    // It keys off the dive path, not the live camera: when the school itself is in focus the
    // camera follows it, and chasing the camera would send the school running round the berg.
    if (school && !focus?.school) {
      const thC = Math.atan2(P.pos.z, P.pos.x) + (mobile ? 0.01 : 0.07) + Math.sin(t * 0.11) * (mobile ? 0.0075 : 0.025);
      // Keep the roaming school above the wider mobile anchor framing.
      const yS = Math.min(-8, Math.max(-58, P.pos.y - (mobile ? 1 : 1.6) + Math.sin(t * 0.27) * (mobile ? 0.7 : 1.2))) + (mobile ? endK * 12 : 0);
      const rS = Math.max(routes.clearance(yS) + 6.5, profile(yS) * 1.25 + 9 + Math.sin(t * 0.19) * 1.5);
      schoolTarget.set(Math.cos(thC) * rS, yS, Math.sin(thC) * rS);
      U.uSchoolC.value.lerp(schoolTarget, 1 - Math.exp(-dt * 0.35));
      const minR = routes.clearance(U.uSchoolC.value.y) + 6.5;
      const r = Math.hypot(U.uSchoolC.value.x, U.uSchoolC.value.z);
      if (r < minR) { U.uSchoolC.value.x *= minR / r; U.uSchoolC.value.z *= minR / r; }
      school.pos.copy(U.uSchoolC.value);
      school.normal.set(school.pos.x, 0, school.pos.z).normalize();
    }
    schoolBeacon.userData.update(t);

    // Torch follows the cursor (or looks ahead on touch).
    if (pointer.has) {
      ndc.set(pointer.x, pointer.y);
      ray.setFromCamera(ndc, camera);
      U.uTorchDir.value.lerp(ray.ray.direction, 1 - Math.exp(-dt * 10)).normalize();
    } else {
      U.uTorchDir.value.lerp(fwd, 1 - Math.exp(-dt * 3)).normalize();
    }
    U.uTorch.value += ((under ? (0.8 + Math.min(0.6, depthM / 200)) * (1 - 0.75 * focusK) : 0) - U.uTorch.value) * (1 - Math.exp(-dt * 3));
    U.uCamFwd.value.copy(fwd);
    if (!ascent.on) U.uBubbles.value += (Math.min(1, Math.abs(pVel) * 9) - U.uBubbles.value) * (1 - Math.exp(-dt * 4));

    // Sonar.
    if (ping.active) {
      ping.r += dt * 15;
      ping.s = Math.max(0, 1 - Math.pow(ping.r / PING_RANGE, 2));
      if (ping.s <= 0) ping.active = false;
      for (const c of contacts) {
        const d = c.pos.distanceTo(ping.o);
        if (!c.pingedBy && d < ping.r && d < PING_RANGE) {
          c.pingedBy = true;
          discover(c);
        }
      }
    }
    U.uPingO.value.copy(ping.o);
    U.uPingR.value = ping.r;
    U.uPingS.value = ping.s * underK;
    if (!ping.active) contacts.forEach((c) => (c.pingedBy = false));

    // Auto-ping when parked near an undiscovered contact, so the mechanic teaches itself.
    const near = placed.find((c) => Math.abs(c.p - p) < 0.02 && !c.found);
    if (under && near && !ping.active && idle > 1.1 && t - lastPing > 3) doPing();

    // Section titles as you cross into each depth band.
    const gliding = ascent.on || transit.on || returning.on;
    const zn = under ? zoneAt(depthM + 6) : null;
    if (zn !== curZone) {
      curZone = zn;
      zones.forEach((z) => z.band?.classList.toggle('active', z === zn));
      // Only announce a section while diving through it, not when passing on the ascent or a glide.
      if (zn && !cardFor && !gliding) showZone(zn);
    }
    if (zoneTimer > 0) {
      zoneTimer -= dt;
      if (zoneTimer <= 0 || cardFor || gliding) zoneEl.classList.remove('show');
    }

    // Hover picking (throttled).
    hoverAcc += dt;
    if (hoverAcc > 0.06 && pointer.has) {
      hoverAcc = 0;
      hovered = pick();
      canvas.classList.toggle('pointing', !!hovered);
    }

    // Contacts: glow, flare, per-form animation, markers.
    for (const c of contacts) {
      c.flare *= Math.exp(-dt * 1.4);
      c.hover += ((hovered === c || cardFor === c ? 1 : 0) - c.hover) * (1 - Math.exp(-dt * 8));
      const dist = c.pos.distanceTo(camera.position);
      if (c.school) {
        U.uFishGlow.value = (c.found ? 0.12 : 0) + c.flare * 0.9 + c.hover * 0.7;
      } else if (c.vessel) {
        vessel.userData.windows.uniforms.uEmissive.value = 2.6 + c.hover * 1.6 + c.flare * 2;
        vessel.userData.glow.material.opacity = 0.35 + c.hover * 0.25;
      } else {
        const glow = ((c.found ? 0.55 : 0.35) + c.flare * 0.7 + c.hover * 0.25) * (under ? 1 : 0.5);
        U.uCPow.value[c.gi] = glow;
        if (c.zone.id === 'education') U.uStrataPow.value = (0.1 + glow * 0.26) * (1 - focusK * 0.5);
        const { mat, sprite, update } = c.obj.userData;
        mat.uniforms.uFlare.value = c.flare;
        mat.uniforms.uHover.value = c.hover;
        update?.call(c.obj.userData, t, dt);
        sprite.material.opacity = (0.12 + (c.found ? 0.08 : 0) + c.flare * 0.3 + c.hover * 0.08) * Math.exp(-dist * 0.025) * smooth((dist - 6) / 14) * underK;
      }

      const el = c.marker;
      v.copy(c.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      // Keep clear of the header bar and the screen edges.
      const inView = v.z < 1 && x > 12 && x < W - 12 && y > 76 && y < H - 12;
      const vis = c.vessel ? !under && !ascent.on && inView && p < 0.05 : under && inView && dist < 60 && facing(c);
      const o = vis && cardFor !== c ? (c.vessel ? 0.9 : Math.min(1, (60 - dist) / 20) * (c.school || c.found ? 1 : 0.55)) : 0;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = o.toFixed(2);
      // Flip to whichever side has room; stay put near the threshold so labels don't flicker.
      const roomR = Math.min(gaugeLeft, W - 12) - (x + 24);
      const roomL = x - 24 - 12;
      const isLeft = el.classList.contains('left');
      const needL = isLeft ? roomR < c.tagW + 24 : roomR < c.tagW;
      const left = needL && roomL > roomR;
      el.classList.toggle('left', left);
      // If neither side fits, slide the label back inside the screen and clear of the gauge.
      const tagL = left ? x - 24 - c.tagW : x + 24;
      const nudge = Math.max(12 - tagL, Math.min(0, Math.min(gaugeLeft, W - 12) - (tagL + c.tagW)));
      el.style.setProperty('--nudge', `${nudge.toFixed(0)}px`);
      el.classList.toggle('hover', hovered === c);
    }

    positionCard();

    // HUD.
    // Aboard, the boat has the stage; the title returns when the card closes.
    const heroReveal = returning.on ? smooth((returning.k - 0.45) / 0.55) : ascent.on || transit.on ? 0 : 1 - (cardFor?.vessel ? focusK : 0);
    const heroK = (1 - smooth(p / 0.045)) * heroReveal;
    const opacity = heroK.toFixed(3);
    const transform = `translateY(${((1 - heroK) * -30).toFixed(1)}px)`;
    const visibility = heroK < 0.01 ? 'hidden' : 'visible';
    if (hud.opacity !== opacity) hero.style.opacity = hud.opacity = opacity;
    if (hud.transform !== transform) hero.style.transform = hud.transform = transform;
    if (hud.visibility !== visibility) hero.style.visibility = hud.visibility = visibility;
    // The gauge arrives with the dive, so the surface screen belongs to the title.
    if (hud.compact !== (heroK < 0.2)) {
      hud.compact = heroK < 0.2;
      brandLink.classList.toggle('show', hud.compact);
      gaugeEl.classList.toggle('show', hud.compact);
    }
    const depthText = String(Math.round(depthM)).padStart(3, '0');
    if (hud.depth !== depthText) depthEl.textContent = hud.depth = depthText;
    const frac = Math.min(1, depthM / MAX_M);
    const gaugePosition = `${frac * 100}%`;
    if (hud.gauge !== gaugePosition) {
      gaugeNow.style.top = gaugeFill.style.height = hud.gauge = gaugePosition;
    }
    const temperature = (1.8 - depthM * 0.017).toFixed(1).replace('-', '−');
    const pressure = (1 + depthM / 10).toFixed(1);
    if (hud.temperature !== temperature) tempEl.textContent = hud.temperature = temperature;
    if (hud.pressure !== pressure) pressureEl.textContent = hud.pressure = pressure;
    const atBottom = p > 0.93 && under && !ascent.on;
    const hideResurface = p < 0.4 || atBottom || ascent.on;
    if (resurface.hidden !== hideResurface) resurface.hidden = hideResurface;
    if (aboardBtn.hidden !== !atBottom) aboardBtn.hidden = !atBottom;

    // The anchor as the way up: a sonar ring on arrival, a slow breathing glow (stronger if the
    // visitor lingers), and full light while it or its button is pointed at.
    bottomT = atBottom ? bottomT + dt : 0;
    const arrive = smooth((bottomT - 0.6) / 1.2);
    const linger = smooth((bottomT - 5) / 3);
    const breathe = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * 2.2);
    const anchorHot = under && (hovered === aboard || (aboardBtnHot && !aboardBtn.hidden));
    U.uAnchorHover.value += ((anchorHot ? 1 : 0) - U.uAnchorHover.value) * (1 - Math.exp(-dt * 8));
    U.uAnchorIdle.value = arrive * (0.45 + 0.55 * linger) * (0.3 + 0.7 * breathe);
    const aboardHot = under && hovered === aboard;
    if (hud.aboardHot !== aboardHot) aboardBtn.classList.toggle('hot', hud.aboardHot = aboardHot);
    v.copy(ringWorld).project(camera);
    anchorMk.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
    anchorMk.style.opacity = (atBottom && v.z < 1 && !cardFor ? arrive : 0).toFixed(2);
    if ((started || !aboardBtn.hidden || !resurface.hidden) && !hint.classList.contains('gone')) hint.classList.add('gone');

    lens.uniforms.uTime.value = t;
    lens.uniforms.uUnder.value = underK * (reduced ? 0 : 1);
    lens.uniforms.uNear.value = 1 - smooth((Math.abs(camera.position.y - wh) - 0.25) / 0.7);
    lens.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    lens.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    lens.uniforms.uCamPos.value.copy(camera.position);
    lens.uniforms.uDepth.value = Math.min(1, depthM / 200);
    lens.uniforms.uPing.value = ping.s * underK;
    bloom.strength = (mobile ? 0.55 : 0.7) + underK * 0.25;

    sea.update(under, depthM, dt);
    if (draw) composer.render();
  }

  let last = null;
  let frameId = null;
  let animationEligible = null;
  const canAnimate = () => !document.hidden && !root.classList.contains('log-open');
  function syncAnimation() {
    const eligible = canAnimate();
    if (eligible !== animationEligible) {
      animationEligible = eligible;
      last = null;
      quality.reset();
    }
    if (!eligible && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (eligible && frameId === null) frameId = requestAnimationFrame(frame);
  }
  function frame(now) {
    frameId = null;
    if (!canAnimate()) { syncAnimation(); return; }
    const elapsed = last === null ? 0 : Math.max(0, (now - last) / 1000);
    last = now;
    if (elapsed > 0) {
      if (quality.sample(elapsed) !== null) sizeRenderTargets();
      tick(Math.min(0.05, elapsed), true, elapsed);
    }
    syncAnimation();
  }
  document.addEventListener('visibilitychange', syncAnimation);
  requestAnimationFrame(() => $('#curtain').classList.add('up'));

  function applyRoute() {
    handlingRoute = true;
    try {
      if (location.hash === '#log') setLog(true, false);
      else {
        if (root.classList.contains('log-open')) setLog(false, false);
        const c = contacts.find((c) => c.zone.id === 'projects' && location.hash === `#project/${c.id}`);
        if (c) diveTo(c, true, c.mark);
        else if (location.hash === '#surface' || !location.hash) {
          closeCard(false, false);
          pTarget = 0;
        }
      }
    } finally {
      handlingRoute = false;
    }
  }
  window.addEventListener('hashchange', applyRoute);
  // Establish a frozen surface and valid camera pose before a direct #log route pauses it.
  if (canAnimate()) tick(0);
  applyRoute();
  syncAnimation();

  if (import.meta.env.DEV) {
    window.__dive = {
      contacts,
      placed,
      camera,
      renderer,
      composer,
      bloom,
      lens,
      scene,
      anchor,
      anchorPickVolume,
      seabedLife,
      U,
      previewEnvironment: (date, weather) => environment.previewAt(date, weather),
      routes,
      motion: { ascent, transit, returning },
      setP(v) {
        closeCard(false, false, false);
        ascent.on = transit.on = returning.on = false;
        focusK = 0;
        p = pTarget = v;
      },
      go(v) {
        pTarget = v;
      },
      ping: doPing,
      open: (id) => diveTo(contacts.find((c) => c.id === id) ?? contacts[id], true),
      advance(seconds, fps = 30, draw = true) {
        const n = Math.max(1, Math.round(seconds * fps));
        for (let i = 0; i < n; i++) tick(1 / fps, draw && i === n - 1);
        return { p, depth: $('#depth').textContent, under };
      },
    };
  }
}
