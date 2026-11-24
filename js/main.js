import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG, tokenStore } from './config.js';
import { DataStore } from './data.js';
import { Plant } from './plant.js';
import { UI, VIEWS, TREND_TAGS } from './ui.js';

// ---------------------------------------------------------------- renderer
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = false;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f16);
scene.fog = new THREE.Fog(0x0b0f16, 55, 110);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const controls = new OrbitControls(camera, labels.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 4;
controls.maxDistance = 80;

scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1f2a, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 25, 12);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
fill.position.set(-15, 10, -20);
scene.add(fill);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x0e131c, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(120, 120, 0x1c2433, 0x141a26);
grid.position.y = 0.005;
scene.add(grid);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  // keep the whole plant in shot on narrow screens
  camera.fov = w / h < 1 ? 58 : 40;
  // centre the scene in the space left of the side panel
  const panelW = w > 820 && !document.body.classList.contains('panel-hidden') ? 330 : 0;
  if (panelW) {
    camera.aspect = (w + panelW) / h; // full (virtual) frustum is wider; we show its left part
    camera.setViewOffset(w + panelW, h, panelW, 0, w, h);
  } else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
new MutationObserver(resize).observe(document.body, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- plant + data
const plant = new Plant(scene);
const D = new DataStore(CONFIG);

// ---------------------------------------------------------------- camera moves
let view = VIEWS[0];
let tween = null;
const basePos = new THREE.Vector3(...view.cam.pos);
const baseTgt = new THREE.Vector3(...view.cam.tgt);
camera.position.copy(basePos);
controls.target.copy(baseTgt);

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function flyTo(v, dur = 3.2) {
  tween = {
    p0: camera.position.clone(), t0: controls.target.clone(),
    p1: new THREE.Vector3(...v.cam.pos), t1: new THREE.Vector3(...v.cam.tgt),
    k: 0, dur,
  };
  basePos.copy(tween.p1);
  baseTgt.copy(tween.t1);
}

function select(id, user = false) {
  const v = VIEWS.find((x) => x.id === id) || VIEWS[0];
  view = v;
  ui.setView(v);
  plant.setFocus(v.sys || 'overview');
  flyTo(v);
  if (user && presenting) dwell = 0;
}

// ---------------------------------------------------------------- presentation
let presenting = false, dwell = 0, orbitT = 0;
function setPresent(on) {
  presenting = on;
  dwell = 0;
  controls.enabled = !on;
  ui.setPresent(on);
  if (!on) ui.setProgress(0);
}
function step(dir) {
  const i = VIEWS.indexOf(view);
  select(VIEWS[(i + dir + VIEWS.length) % VIEWS.length].id, true);
}
// any manual camera interaction leaves presentation mode
labels.domElement.addEventListener('pointerdown', () => { if (presenting) setPresent(false); tween = null; });
labels.domElement.addEventListener('wheel', () => { if (presenting) setPresent(false); tween = null; }, { passive: true });

const ui = new UI(D, CONFIG, { select, togglePresent: () => setPresent(!presenting), step });
document.body.dataset.labels = 'all';
select('overview');

// ---------------------------------------------------------------- data loop
D.on(() => { plant.onData(D); ui.refresh(); });
async function pollLoop() {
  if (CONFIG.token) {
    await D.poll();
    if (D.status === 'error' && /\b401\b/.test(D.error)) askToken('That token was rejected (401).');
  }
  setTimeout(pollLoop, CONFIG.pollMs);
}
async function trendLoop() {
  if (CONFIG.token) {
    await D.pollTrends(TREND_TAGS);
    ui.refresh();
  }
  setTimeout(trendLoop, CONFIG.trendMs);
}

// token entry: never stored in the repo, only in this browser
const dlg = document.getElementById('connect');
function askToken(msg = '') {
  if (dlg.open) return;
  document.getElementById('connect-err').textContent = msg;
  document.getElementById('token-input').value = '';
  dlg.showModal();
}
dlg.addEventListener('close', async () => {
  const v = document.getElementById('token-input').value.trim();
  if (!v) return;
  CONFIG.token = v;
  tokenStore.set(v);
  D.status = 'connecting';
  await D.poll();
  D.pollTrends(TREND_TAGS).then(() => ui.refresh());
});
document.getElementById('token-btn').onclick = () => askToken();
if (!CONFIG.token) askToken();

pollLoop();
trendLoop();
if (CONFIG.present) setPresent(true);

// ---------------------------------------------------------------- render loop
const clock = new THREE.Clock();
const tmpP = new THREE.Vector3();
function frame() {
  const dt = Math.min(0.1, clock.getDelta());
  const t = clock.elapsedTime;

  if (presenting) {
    dwell += dt;
    ui.setProgress(dwell / CONFIG.cycleSec);
    if (dwell >= CONFIG.cycleSec) {
      dwell = 0;
      const i = VIEWS.indexOf(view);
      select(VIEWS[(i + 1) % VIEWS.length].id);
    }
  }

  if (tween) {
    tween.k = Math.min(1, tween.k + dt / tween.dur);
    const e = ease(tween.k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    camera.position.y += Math.sin(Math.PI * e) * tween.p0.distanceTo(tween.p1) * 0.18;
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.k >= 1) { tween = null; orbitT = 0; }
  } else if (presenting) {
    // slow sway around the focus point while dwelling
    orbitT += dt;
    const ang = Math.sin((orbitT / 28) * Math.PI * 2) * 0.16;
    tmpP.copy(basePos).sub(baseTgt).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    camera.position.copy(baseTgt).add(tmpP);
    controls.target.copy(baseTgt);
  }
  controls.update();
  plant.update(dt, t, D);
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.__sghp = { D, plant, camera, controls, select };
