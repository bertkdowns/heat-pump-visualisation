// 3D plant model laid out after the SGHP P&ID (V24).
// Plan coordinates: x → right, z → toward the viewer (down the drawing), y up.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TAGS, tagLabel, tempRGB, cssTemp, fmt } from './tags.js';

const Y = 1; // pipe rack height
const KIND = { water: 0, liq: 1, vap: 2, tp: 3, steam: 4 };

// ------------------------------------------------------------------ shaders
const VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

// Water: chevrons pointing along the flow. n-butane: barber-pole helix with
// droplets (liquid), bubble rings (vapour) or both (two-phase). Steam: wisps.
const FS = /* glsl */ `
uniform vec3 uA; uniform vec3 uB;
uniform float uPhase; uniform float uLen; uniform float uCirc;
uniform float uKind; uniform float uFlow; uniform float uAlpha; uniform float uStale; uniform float uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 col = mix(uA, uB, vUv.x);
  float s = vUv.x * uLen - uPhase;
  float a = vUv.y * uCirc;
  vec3 c = col;
  if (uKind < 0.5) {
    float w = abs(fract(vUv.y * 2.0) - 0.5) * 2.0;
    float ph = fract((s + w * 0.3) / 0.9);
    float m = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.2, 0.3, ph));
    c = col * (0.8 + 0.45 * m * (0.25 + 0.75 * uFlow));
  } else if (uKind < 3.5) {
    float stripe = step(0.5, fract((s + a) / 0.48));
    c = col * (0.72 + 0.16 * stripe);
    float cs = uKind < 1.5 ? 0.16 : (uKind < 2.5 ? 0.32 : 0.24);
    vec2 g = vec2(s, a) / cs;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash(id);
    float present = uKind < 1.5 ? 0.85 : (uKind < 2.5 ? 0.4 : 0.6);
    if (h < present) {
      f += (vec2(hash(id + 1.7), hash(id + 4.3)) - 0.5) * 0.35;
      float d = length(f);
      bool liquid = uKind < 1.5 || (uKind > 2.5 && hash(id + 2.2) < 0.5);
      if (liquid) {
        float r = 0.2 + 0.08 * hash(id + 9.1);
        c = mix(c, col * 1.3 + 0.08, smoothstep(r, r - 0.08, d) * 0.9);
      } else {
        float r = 0.3 + 0.1 * hash(id + 9.1);
        float ring = smoothstep(r, r - 0.05, d) - smoothstep(r - 0.08, r - 0.14, d);
        c = mix(c, vec3(1.0), ring * 0.75);
      }
    }
  } else {
    float wv = sin(s * 3.0 + a * 2.0 + sin(s * 1.3 - uTime * 0.5) * 2.0) * 0.5 + 0.5;
    c = mix(col, vec3(1.0), 0.35 + 0.45 * smoothstep(0.55, 1.0, wv) * (0.3 + 0.7 * uFlow));
  }
  vec3 n = normalize(vN);
  float dif = max(dot(n, normalize(vec3(0.3, 0.85, 0.45))), 0.0);
  float rim = pow(1.0 - abs(dot(n, normalize(-vV))), 2.0);
  c = c * (0.5 + 0.6 * dif) + rim * 0.15;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(lum * 0.55), uStale);
  gl_FragColor = vec4(c, uAlpha);
}`;

function pipeMaterial(kind, alpha = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uB: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uPhase: { value: 0 }, uLen: { value: 1 }, uCirc: { value: 0.96 },
      uKind: { value: kind }, uFlow: { value: 0 }, uAlpha: { value: alpha },
      uStale: { value: 0 }, uTime: { value: 0 },
    },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: alpha < 1,
    depthWrite: alpha >= 1,
  });
}

// polyline with rounded corners
function roundedPath(pts, r = 0.45) {
  const path = new THREE.CurvePath();
  let prev = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i < pts.length - 1 && r > 0) {
      const d1 = p.clone().sub(pts[i - 1]);
      const d2 = pts[i + 1].clone().sub(p);
      const rr = Math.min(r, d1.length() / 2, d2.length() / 2);
      const a = p.clone().sub(d1.normalize().multiplyScalar(rr));
      const b = p.clone().add(d2.normalize().multiplyScalar(rr));
      if (a.distanceTo(prev) > 1e-4) path.add(new THREE.LineCurve3(prev.clone(), a));
      path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
      prev = b;
    } else {
      path.add(new THREE.LineCurve3(prev.clone(), p.clone()));
      prev = p.clone();
    }
  }
  return path;
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const nz = (x, d = 0) => (Number.isFinite(x) ? x : d);

const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x8b97a8, metalness: 0.7, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x343b47, metalness: 0.5, roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2c6ea6, metalness: 0.5, roughness: 0.35 }),
  green: new THREE.MeshStandardMaterial({ color: 0x2f7d5b, metalness: 0.4, roughness: 0.45 }),
  bitzer: new THREE.MeshStandardMaterial({ color: 0x2f8a47, metalness: 0.25, roughness: 0.5 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe48a2a, metalness: 0.3, roughness: 0.5 }),
  cabinet: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.2, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xaecbe8, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.16,
    depthWrite: false, side: THREE.DoubleSide,
  }),
  blade: new THREE.MeshStandardMaterial({ color: 0xd8dee8, metalness: 0.6, roughness: 0.3 }),
};

const INST_COLOR = { T: 0xff9a3c, P: 0x3cc8ff, F: 0x5cff9a, L: 0x6aa8ff, V: 0xd0d0d0, S: 0xffffff };

export class Plant {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pipes = [];
    this.labels = [];
    this.spinners = [];
    this.updaters = [];  // called on each data update: (D) => void
    this.frame = [];     // called every frame: (dt, t, D) => void
    this.build();
  }

  // ------------------------------------------------------------ primitives
  add(obj) { this.root.add(obj); return obj; }

  mesh(geo, mat, pos, rot) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    return this.add(m);
  }

  // o: { kind, r, tA, tB, flow(D) -> world units/s, alpha, bend }
  pipe(sys, pts, o) {
    const path = roundedPath(pts.map(v3), o.bend ?? 0.45);
    const len = path.getLength();
    const r = o.r ?? 0.15;
    const geo = new THREE.TubeGeometry(path, Math.max(8, Math.ceil(len * 10)), r, 14, false);
    const mat = pipeMaterial(KIND[o.kind], o.alpha ?? 1);
    mat.uniforms.uLen.value = len;
    mat.uniforms.uCirc.value = Math.max(0.96, Math.round((2 * Math.PI * r) / 0.96) * 0.96);
    const m = this.add(new THREE.Mesh(geo, mat));
    if (o.order) m.renderOrder = o.order;
    const p = { sys, mat, o, phase: Math.random() * 10, speed: 0 };
    this.pipes.push(p);
    return p;
  }

  label(pos, html, cls) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    const obj = new CSS2DObject(el);
    obj.position.copy(v3(pos));
    this.add(obj);
    return el;
  }

  // Instrument bubble + leader + live value label
  inst(sys, tag, pos, o = {}) {
    const meta = TAGS[tag] || { kind: 'S', unit: '', scale: 1, dp: 0, desc: tag };
    const off = o.off || [0, 1.25, 0];
    const lp = [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]];
    const col = INST_COLOR[meta.kind] || 0xffffff;
    this.mesh(new THREE.SphereGeometry(0.11, 14, 10),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 }),
      [pos[0], pos[1] + 0.17, pos[2]]);
    const g = new THREE.BufferGeometry().setFromPoints([v3([pos[0], pos[1] + 0.2, pos[2]]), v3(lp)]);
    this.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7d8ba3, transparent: true, opacity: 0.55 })));
    const name = o.name || tagLabel(tag);
    const el = this.label(lp,
      `<span class="tn">${name}</span><span class="tv"><b>—</b><i>${meta.unit}</i></span>`,
      `tag k-${meta.kind} sys-${sys}${o.cls ? ' ' + o.cls : ''}`);
    el.title = `${name} · ${meta.desc}${o.note ? '\n' + o.note : ''}`;
    const b = el.querySelector('b');
    const lab = { sys, tag, el, b, meta, fb: o.fb };
    this.labels.push(lab);
    this.updaters.push((D) => {
      const v = D.V(tag);
      let txt = fmt(v, meta.dp);
      if (o.fb) txt += `<small> fb ${fmt(D.V(o.fb), 0)}</small>`;
      b.innerHTML = txt;
      el.classList.toggle('bad', !Number.isFinite(v));
      el.classList.toggle('stale', D.stale(tag));
      if (meta.kind === 'T' && meta.unit === '°C') el.style.setProperty('--tc', cssTemp(v));
    });
    return el;
  }

  // Equipment name plate with optional dynamic line
  eq(sys, pos, name, id, dyn) {
    const el = this.label(pos, `<b>${name}</b><span>${id}</span>${dyn ? '<em></em>' : ''}`, `eq sys-${sys}`);
    if (dyn) {
      const em = el.querySelector('em');
      this.updaters.push((D) => { em.innerHTML = dyn(D); });
    }
    return el;
  }

  spin(obj, axis, revPerSec) { this.spinners.push({ obj, axis, rate: revPerSec, cur: 0 }); }

  // ------------------------------------------------------------ equipment
  // Shell-and-tube style exchanger lying along x
  hx(sys, c, len, o) {
    const rs = o.r ?? 0.9;
    const [x, y, z] = c;
    const x0 = x - len / 2, x1 = x + len / 2;
    const glass = this.mesh(new THREE.CylinderGeometry(rs, rs, len, 36, 1, true), MAT.glass, c, [0, 0, Math.PI / 2]);
    glass.renderOrder = 3;
    for (const xe of [x0, x1]) {
      this.mesh(new THREE.CylinderGeometry(rs + 0.08, rs + 0.08, 0.14, 36), MAT.steel, [xe, y, z], [0, 0, Math.PI / 2]);
    }
    // saddles
    for (const xs of [x0 + 0.5, x1 - 0.5]) {
      this.mesh(new THREE.BoxGeometry(0.25, y - 0.2, rs * 1.3), MAT.dark, [xs, (y - 0.2) / 2, z]);
    }
    const sh = o.shell, tb = o.tube;
    const sPts = sh.dir > 0 ? [[x0 + 0.07, y, z], [x1 - 0.07, y, z]] : [[x1 - 0.07, y, z], [x0 + 0.07, y, z]];
    this.pipe(sys, sPts, { ...sh, r: rs * 0.9, alpha: 0.42, bend: 0, order: 2 });
    const tPts = tb.dir > 0 ? [x0, x1] : [x1, x0];
    const off = [[0, 0.3], [0.28, -0.16], [-0.28, -0.16]];
    for (const [dz, dy] of off) {
      this.pipe(sys, [[tPts[0], y + dy * rs / 0.9, z + dz * rs / 0.9], [tPts[1], y + dy * rs / 0.9, z + dz * rs / 0.9]],
        { ...tb, r: 0.1 * rs / 0.9 + 0.02, bend: 0 });
    }
  }

  // Vertical vessel. pos = bottom centre.
  vessel(sys, pos, r, h, o = {}) {
    const [x, y0, z] = pos;
    const cy = y0 + h / 2;
    const shell = this.mesh(new THREE.CapsuleGeometry(r, h - 2 * r, 10, 32), MAT.glass, [x, cy, z]);
    shell.renderOrder = 3;
    // legs
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      this.mesh(new THREE.CylinderGeometry(0.05, 0.05, r * 0.8), MAT.dark,
        [x + Math.cos(a) * r * 0.7, y0 + r * 0.3, z + Math.sin(a) * r * 0.7]);
    }
    // hoops
    for (const yy of [y0 + r, y0 + h - r]) {
      this.mesh(new THREE.TorusGeometry(r + 0.01, 0.025, 6, 40), MAT.steel, [x, yy, z], [Math.PI / 2, 0, 0]);
    }
    if (o.level) {
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), y0 + h / 2);
      const liqMat = new THREE.MeshStandardMaterial({
        color: 0x3388ff, transparent: true, opacity: 0.72, roughness: 0.2, metalness: 0.1,
        clippingPlanes: [plane], side: THREE.DoubleSide,
      });
      const liq = this.mesh(new THREE.CapsuleGeometry(r * 0.94, h - 2 * r, 10, 32), liqMat, [x, cy, z]);
      liq.renderOrder = 1;
      const surf = this.mesh(new THREE.CircleGeometry(1, 40),
        new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.85, emissive: 0x224466, side: THREE.DoubleSide }),
        [x, cy, z], [-Math.PI / 2, 0, 0]);
      surf.renderOrder = 1;
      let cur = 0.5;
      this.frame.push((dt, t, D) => {
        const target = clamp(nz(o.level(D), 0));
        cur = lerp(cur, target, Math.min(1, dt * 1.5));
        const hl = y0 + 0.06 + cur * (h - 0.12) + Math.sin(t * 2.1) * 0.015;
        plane.constant = hl;
        const dy = Math.max(0, Math.max(y0 + r - hl, hl - (y0 + h - r)));
        const rr = Math.sqrt(Math.max(0.0001, (r * 0.94) ** 2 - dy * dy));
        surf.position.y = hl;
        surf.scale.set(rr, rr, 1);
        surf.rotation.z = Math.sin(t * 0.7) * 0.02;
        surf.visible = cur > 0.01;
        const c = tempRGB(nz(D.V(o.temp), NaN));
        liqMat.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        surf.material.color.setRGB(c[0] * 1.2, c[1] * 1.2, c[2] * 1.2, THREE.SRGBColorSpace);
      });
      this.levelOf = this.levelOf || {};
      return { x, y0, z, r, h, level: () => cur };
    } else if (o.temp) {
      // refrigerant vessel: tinted fill to show it holds butane at that temperature
      const m = new THREE.MeshStandardMaterial({ color: 0x777777, transparent: true, opacity: 0.38, depthWrite: false });
      const inner = this.mesh(new THREE.CapsuleGeometry(r * 0.9, h - 2 * r, 8, 24), m, [x, cy, z]);
      inner.renderOrder = 1;
      this.updaters.push((D) => {
        const c = tempRGB(D.V(o.temp));
        m.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
      });
    }
    return { x, y0, z, r, h };
  }

  // Centrifugal pump with VSD. axis: direction of the pipe it sits on ('x'|'z')
  pump(sys, pos, speedTag, axis, side = 1) {
    const [x, y, z] = pos;
    this.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 32), MAT.blue, [x, y, z]);
    this.mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 32), MAT.steel, [x, y + 0.25, z], [Math.PI / 2, 0, 0]);
    const imp = new THREE.Group();
    imp.position.set(x, y + 0.27, z);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.09), MAT.blade);
      b.rotation.y = (i / 6) * Math.PI;
      b.position.set(0, 0, 0);
      imp.add(b);
    }
    imp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), MAT.orange));
    this.add(imp);
    this.spin(imp, 'y', (D) => (nz(D.V(speedTag)) / 100) * 2.2);
    // motor + VSD beside the pipe
    const px = axis === 'z' ? side : 0, pz = axis === 'x' ? side : 0;
    const motor = this.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 24), MAT.blue,
      [x + px * 0.85, y, z + pz * 0.85], axis === 'z' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
    motor.castShadow = true;
    const vsd = this.mesh(new THREE.BoxGeometry(0.45, 0.65, 0.3), MAT.cabinet, [x + px * 1.75, 0.45, z + pz * 1.75]);
    const led = this.mesh(new THREE.BoxGeometry(0.2, 0.08, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22ff88, emissiveIntensity: 0 }),
      [x + px * 1.75, 0.6, z + pz * 1.75 + 0.16]);
    this.updaters.push((D) => { led.material.emissiveIntensity = nz(D.V(speedTag)) > 1 ? 1.4 : 0; });
    return [x + px * 1.75, 0.8, z + pz * 1.75];
  }

  // Globe / control valve. o: { out, fb, manual, three }
  valve(sys, pos, axis, o = {}) {
    const [x, y, z] = pos;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const cone = new THREE.ConeGeometry(0.26, 0.34, 18);
    const c1 = new THREE.Mesh(cone, MAT.dark), c2 = new THREE.Mesh(cone, MAT.dark);
    if (axis === 'x') {
      c1.rotation.z = -Math.PI / 2; c1.position.x = -0.17;
      c2.rotation.z = Math.PI / 2; c2.position.x = 0.17;
    } else {
      c1.rotation.x = Math.PI / 2; c1.position.z = -0.17;
      c2.rotation.x = -Math.PI / 2; c2.position.z = 0.17;
    }
    g.add(c1, c2);
    if (o.three) {
      const c3 = new THREE.Mesh(cone, MAT.dark);
      if (o.three === 'x+') { c3.rotation.z = Math.PI / 2; c3.position.x = 0.17; }
      if (o.three === 'x-') { c3.rotation.z = -Math.PI / 2; c3.position.x = -0.17; }
      g.add(c3);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45), MAT.steel);
    stem.position.y = 0.25;
    g.add(stem);
    if (o.manual) {
      const hw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 24), MAT.orange);
      hw.rotation.x = Math.PI / 2; hw.position.y = 0.46;
      g.add(hw);
    } else {
      const act = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 24), MAT.orange);
      act.position.y = 0.5;
      g.add(act);
      const ind = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x33ff77, emissiveIntensity: 0 }));
      ind.rotation.x = Math.PI / 2; ind.position.y = 0.5;
      g.add(ind);
      if (o.out) {
        this.updaters.push((D) => {
          const f = clamp(nz(D.V(o.out)) / 100);
          ind.material.emissiveIntensity = 0.15 + 1.6 * f;
          act.scale.y = 0.6 + 0.8 * f;
        });
      }
    }
    this.add(g);
  }

  // Box housing with spinning fans on top (dry cooler / outdoor unit)
  fanUnit(sys, c, size, nFans, rate) {
    const [x, y, z] = c;
    const [w, h, d] = size;
    this.mesh(new THREE.BoxGeometry(w, h, d), MAT.cabinet, [x, y + h / 2, z]);
    const fr = Math.min(w / nFans, d) * 0.4;
    for (let i = 0; i < nFans; i++) {
      const fx = x - w / 2 + (w / nFans) * (i + 0.5);
      this.mesh(new THREE.TorusGeometry(fr + 0.05, 0.05, 8, 32), MAT.dark, [fx, y + h + 0.03, z], [Math.PI / 2, 0, 0]);
      const rot = new THREE.Group();
      rot.position.set(fx, y + h + 0.06, z);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(fr * 1.9, 0.03, fr * 0.38), MAT.blade);
        b.rotation.y = (k / 4) * Math.PI;
        b.rotation.x = 0.25;
        rot.add(b);
      }
      rot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), MAT.dark));
      this.add(rot);
      this.spin(rot, 'y', rate);
    }
  }

  signal(pts) {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(v3));
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xff9a3c, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.75 }));
    l.computeLineDistances();
    this.add(l);
  }

  zone(id, name, x0, x1, z0, z1, color) {
    const w = x1 - x0, d = z1 - z0;
    const pad = this.mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false }),
      [(x0 + x1) / 2, 0.01, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]);
    pad.receiveShadow = true;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    edge.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    edge.rotation.x = -Math.PI / 2;
    this.add(edge);
    const el = this.label([x0 + 0.4, 0.05, z0 + 0.7], name, `zone sys-${id}`);
    el.style.setProperty('--zc', '#' + color.toString(16).padStart(6, '0'));
  }

  // ------------------------------------------------------------ plant
  build() {
    const lpm = (tag, k = 1, design = 100) => (D) => (nz(D.V(tag)) / design) * k;
    const pct = (tag, k = 1) => (D) => (nz(D.V(tag)) / 100) * k;

    this.zone('hp', 'HEAT PUMP · n-BUTANE', -14, 13.8, -4.6, 6.9, 0xffb347);
    this.zone('so', 'SOURCE LOOP', -16, 0.6, 6.9, 17.2, 0x4cd97b);
    this.zone('ww', 'WARM WATER & COOLING', -17, 0.7, -19.4, -4.6, 0xffd23f);
    this.zone('hw', 'HOT WATER & STEAM', 0.7, 17.4, -19.4, -4.6, 0xff6a5a);

    // ================= HEAT PUMP (n-butane) =================
    const mf = (k) => (D) => (nz(D.V('HPMF01')) / 500) * k;
    const VAP = 2.4, LIQ = 0.7, TP = 1.5;

    // compressor
    this.compressor([9, Y, 5]);
    // suction: evaporator -> accumulator -> compressor
    this.pipe('hp', [[-2, Y, 5], [2.4, Y, 5]], { kind: 'vap', r: 0.17, tA: 'HPTT07', flow: mf(VAP) });
    this.vessel('hp', [3, 0, 5], 0.6, 2.7, { temp: 'HPTT01' });
    this.eq('hp', [3, 3.1, 5], 'SUCTION ACCUMULATOR', 'HP-SA01');
    this.pipe('hp', [[3.6, Y, 5], [7.5, Y, 5]], { kind: 'vap', r: 0.17, tA: 'HPTT01', flow: mf(VAP) });
    this.inst('hp', 'HPTT07', [-0.9, Y, 5], { off: [-0.5, 1.3, 0] });
    this.inst('hp', 'HPPT01', [0.4, Y, 5], { off: [0.5, 1.3, 0], note: 'Evaporator outlet / suction pressure' });
    this.inst('hp', 'HPTT01', [5.6, Y, 5], { off: [0, 1.4, 0] });

    // discharge -> oil separator -> condenser
    this.pipe('hp', [[10, Y + 1.15, 5], [11.3, Y + 1.15, 5], [11.3, Y, 5], [12.2, Y, 5], [12.2, Y, -3], [9.05, Y, -3]], { kind: 'vap', r: 0.12, tA: 'HPTT02', tB: 'HPTT02', flow: mf(VAP * 1.6) });
    this.inst('hp', 'HPTT02', [12.2, Y, 3.6], { off: [0.9, 1.2, 0] });
    this.inst('hp', 'HPPT02', [12.2, Y, 2.5], { off: [0.9, 1.2, 0] });
    this.vessel('hp', [12.2, 0, 0.6], 0.42, 2.3, { temp: 'HPTT02' });
    this.eq('hp', [12.2, 2.7, 0.6], 'OIL SEPARATOR', 'HP-OS01');

    this.hx('hp', [6, Y, -3], 6, {
      tube: { kind: 'vap', dir: -1, tA: 'HPTT02', tB: 'HPTT03', flow: mf(VAP) },
      shell: { kind: 'water', dir: 1, tA: 'HWTT51', tB: 'HWTT52', flow: lpm('HWVF51', 1.4, 120) },
    });
    this.eq('hp', [6, -0.1, -1.8], 'CONDENSER', 'HP-CD01', (D) => `Q ${fmt(D.X.qCond, 1)} kW`);

    // condenser -> receiver -> subcooler (liquid)
    this.pipe('hp', [[2.95, Y, -3], [0.3, Y, -3]], { kind: 'liq', r: 0.12, tA: 'HPTT03', flow: mf(LIQ) });
    this.inst('hp', 'HPTT03', [2.2, Y, -3], { off: [0.1, 1.3, 0.4] });
    this.inst('hp', 'HPPT03', [1.1, Y, -3], { off: [-0.2, 1.3, 0.6] });
    this.vessel('hp', [-0.2, 0, -3], 0.5, 2.1, { temp: 'HPTT03' });
    this.eq('hp', [-0.2, -0.1, -2], 'LIQUID RECEIVER', 'HP-LR01');
    this.pipe('hp', [[-0.7, Y, -3], [-2.45, Y, -3]], { kind: 'liq', r: 0.12, tA: 'HPTT03', flow: mf(LIQ) });
    this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.35, 16), MAT.steel, [-1.5, Y, -3], [0, 0, Math.PI / 2]);

    this.hx('hp', [-5, Y, -3], 5, {
      tube: { kind: 'liq', dir: -1, tA: 'HPTT03', tB: 'HPTT04', flow: mf(LIQ) },
      shell: { kind: 'water', dir: 1, tA: 'WWTT41', tB: 'WWTT42', flow: lpm('WWVF41', 1.2, 30) },
    });
    this.eq('hp', [-5, -0.1, -1.8], 'SUBCOOLER', 'HP-SC01', (D) => `Q ${fmt(D.X.qSub, 1)} kW`);

    // liquid line -> dryer -> MF -> solenoid -> EEV
    this.pipe('hp', [[-7.55, Y, -3], [-12, Y, -3], [-12, Y, 2.8]], { kind: 'liq', r: 0.12, tA: 'HPTT04', tB: 'HPTT05', flow: mf(LIQ) });
    this.inst('hp', 'HPTT04', [-8.2, Y, -3], { off: [0.2, 1.3, 0.5] });
    this.valve('hp', [-9.5, Y, -3], 'x', { manual: true });
    this.mesh(new THREE.BoxGeometry(0.5, 0.4, 0.9), MAT.dark, [-12, Y, -1.8]);
    this.eq('hp', [-13.1, Y, -1.8], 'DRYER', 'HP-FD01');
    this.inst('hp', 'HPMF01', [-12, Y, -0.6], { off: [-1.3, 1.0, 0] });
    this.mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), MAT.steel, [-12, Y, -0.6]);
    this.valve('hp', [-12, Y, 0.6], 'z', { manual: false });
    this.eq('hp', [-13.2, Y, 0.6], 'SOLENOID', 'HP-LLSV01', (D) => (D.B('HPSV01') ? '<span class="on">OPEN</span>' : '<span class="off">CLOSED</span>'));
    this.inst('hp', 'HPTT05', [-12, Y, 1.7], { off: [-1.3, 1.0, 0] });
    this.valve('hp', [-12, Y, 2.8], 'z', { out: 'HPEV01' });
    this.inst('hp', 'HPEV01', [-12, Y, 2.8], { off: [-1.4, 1.2, 0.3], name: 'HP-EEV01' });
    this.pipe('hp', [[-12, Y, 2.8], [-12, Y, 5], [-8.05, Y, 5]], { kind: 'tp', r: 0.14, tA: 'HPTT06', flow: mf(TP) });
    this.inst('hp', 'HPTT06', [-10.4, Y, 5], { off: [0, 1.3, 0.5] });

    // IHX branch (liquid through the IHX section of the evaporator)
    this.pipe('hp', [[-9, Y, -3], [-9, Y, -1], [-3, Y, -1], [-3, Y, 4.15]], { kind: 'liq', r: 0.08, tA: 'HPTT04', flow: mf(LIQ * 0.6) });
    this.pipe('hp', [[-4.2, Y, 4.15], [-4.2, Y, -0.2], [-10, Y, -0.2], [-10, Y, -3]], { kind: 'liq', r: 0.08, tA: 'HPTT04', tB: 'HPTT05', flow: mf(LIQ * 0.6) });
    this.inst('hp', 'HPTC02', [-6.5, Y, -1], { off: [0, 0.9, 0], note: 'IHX liquid line (reads fault)' });
    this.valve('hp', [-4.2, Y, 1.6], 'z', { manual: true });

    this.hx('hp', [-5, Y, 5], 6, {
      tube: { kind: 'tp', dir: 1, tA: 'HPTT06', tB: 'HPTT07', flow: mf(TP) },
      shell: { kind: 'water', dir: -1, tA: 'SOTT31', tB: 'SOTT32', flow: lpm('SOVF31', 1.3, 160) },
    });
    this.eq('hp', [-5, -0.1, 6.3], 'EVAPORATOR + IHX', 'HP-EVP01', (D) => `Q ${fmt(D.X.qEvap, 1)} kW`);

    // superheat control: TT07/PT01 -> EEV
    this.signal([[-0.9, Y + 0.25, 4.6], [-0.9, Y + 0.25, 3.5], [-11.5, Y + 0.25, 3.5], [-11.5, Y + 0.25, 2.8]]);
    this.inst('hp', 'HPEV01_Superheat', [-6, Y + 0.25, 3.5], { off: [0, 0.8, 0], name: 'SH CTRL' });

    // ================= SOURCE LOOP =================
    const soF = lpm('SOVF31', 1.3, 160);
    this.pipe('so', [[-7.4, Y, 5.9], [-7.4, Y, 10.45]], { kind: 'water', r: 0.17, tA: 'SOTT32', flow: soF });
    this.inst('so', 'SOTT32', [-7.4, Y, 6.3], { off: [-1.0, 1.2, 0] });
    this.inst('so', 'SOPT31', [-7.4, Y, 8.0], { off: [-1.0, 1.2, 0] });
    this.inst('so', 'SOVF31', [-7.4, Y, 9.0], { off: [1.1, 1.2, 0] });
    this.mesh(new THREE.BoxGeometry(0.45, 0.45, 0.6), MAT.steel, [-7.4, Y, 9.0]);

    // propane heat pump exchanger EX-SP01 (plate HX)
    this.mesh(new THREE.BoxGeometry(1.0, 1.4, 1.25), MAT.steel, [-7.4, Y, 11.1]);
    for (let i = 0; i < 7; i++) this.mesh(new THREE.BoxGeometry(1.05, 1.3, 0.04), MAT.dark, [-7.4, Y, 10.6 + i * 0.16]);
    this.eq('so', [-6.0, 0.2, 11.1], 'PROPANE HX', 'EX-SP01', (D) => `+${fmt(D.X.qProp, 1)} kW`);
    this.pipe('so', [[-7.4, Y, 11.75], [-7.4, Y, 15], [-6.05, Y, 15]], { kind: 'water', r: 0.17, tA: 'SOTT33', flow: soF });
    this.inst('so', 'SOTT33', [-7.4, Y, 13.2], { off: [-1.0, 1.2, 0] });

    // PHNIX propane heat pump SO-HP31: air-source R290 unit with two inverter compressors.
    // Its own water circuit carries the heat to EX-SP01.
    const pxRun = (D) => nz(D.X.pxRun);
    this.fanUnit('so', [-12.6, 0, 11.4], [3.3, 2.1, 1.9], 2, (D) => (pxRun(D) ? 1.2 + nz(D.V('PX_C1HZ')) / 60 : 0));
    this.eq('so', [-12.6, 3.0, 11.4], 'PROPANE HEAT PUMP', 'SO-HP31 · PHNIX',
      (D) => `<span class="${D.X.pxMode === 'DEFROST' ? 'off' : pxRun(D) ? 'on' : ''}">${D.X.pxMode}</span> · set ${fmt(D.V('PX_SET'), 0)} °C`);
    const phF = (D) => (pxRun(D) ? 1.4 : 0);
    this.pipe('so', [[-10.95, Y, 10.8], [-7.9, Y, 10.8]], { kind: 'water', r: 0.11, tA: 'PX_TOUT', flow: phF });
    this.pipe('so', [[-7.9, Y, 11.45], [-10.95, Y, 11.45]], { kind: 'water', r: 0.11, tA: 'PX_TIN', flow: phF });
    this.inst('so', 'PX_TOUT', [-9.6, Y, 10.8], { off: [0.2, 1.3, -0.9], name: 'SO-HP31 T<sub>out</sub>' });
    this.inst('so', 'PX_TIN', [-9.6, Y, 11.45], { off: [0.2, 0.9, 1.1], name: 'SO-HP31 T<sub>in</sub>' });
    this.inst('so', 'PX_TAMB', [-14.25, 1.6, 11.4], { off: [-0.9, 1.0, 0.6], name: 'Outdoor air' });
    // controller panel: both compressors
    const pel = this.label([-12.6, 1.3, 13.5], `<span class="tn">SO-HP31 compressors</span><span class="vsd"></span>`, 'tag k-S sys-so wide');
    const pv = pel.querySelector('.vsd');
    this.updaters.push((D) => {
      const row = (n) => `<b>${fmt(D.V(`PX_C${n}HZ`), 0)}</b><i>Hz</i> <b>${fmt(D.V(`PX_C${n}A`), 1)}</b><i>A</i>`;
      pv.innerHTML = `${row(1)}<br>${row(2)}`;
      pel.classList.toggle('stale', D.stale('PX_C1HZ'));
    });
    this.labels.push({ sys: 'so', el: pel });

    // hold-up tank
    const tank = this.vessel('so', [-5, 0, 15], 1.0, 2.7, { level: (D) => D.V('SOLT31') / 100, temp: 'SOTC31' });
    this.eq('so', [-5, 3.2, 15], 'HOLD-UP TANK', 'SO-ST01');
    this.inst('so', 'SOLT31', [-4.05, 1.8, 15], { off: [1.4, 0.8, 0.6] });
    this.inst('so', 'SOTC31', [-4.1, 0.6, 15.6], { off: [1.3, 0.2, 1.0], note: 'Hold-up tank temperature (V24)' });

    // supply: tank -> pump -> evaporator
    this.pipe('so', [[-3.95, Y, 15], [-2.6, Y, 15], [-2.6, Y, 5.95]], { kind: 'water', r: 0.17, tA: 'SOTC31', tB: 'SOTT31', flow: soF });
    const soV = this.pump('so', [-2.6, Y, 12.4], 'SOVS31', 'z', 1);
    this.inst('so', 'SOVS31', soV, { off: [0.6, 1.0, 0], name: 'SO-VS31' });
    this.eq('so', [-2.6, -0.1, 13.4], 'PUMP', 'SO-PU31');
    this.inst('so', 'SOTT31', [-2.6, Y, 6.5], { off: [1.1, 1.2, 0] });

    // ================= WARM WATER LOOP =================
    const wwF = lpm('WWVF41', 1.2, 30);
    // fraction through Lab Cooler 1 set by 3-way mixing valve WW-GV41
    const coolFrac = (D) => clamp(nz(D.V('WWGV41O'), nz(D.V('WWGV41'))) / 100);
    const mkF = (D) => clamp(nz(D.V('WWGV42O')) / 100) * 0.6 * (nz(D.V('WWVF41')) > 1 ? 1 : 0);

    this.pipe('ww', [[-7, Y, -10], [-7, Y, -3.95]], { kind: 'water', r: 0.14, tA: 'WWTT41', flow: wwF });
    this.inst('ww', 'WWTT41', [-7, Y, -9.0], { off: [-1.3, 1.1, 0] });
    const wwV = this.pump('ww', [-7, Y, -7], 'WWVS41', 'z', -1);
    this.inst('ww', 'WWVS41', wwV, { off: [-0.6, 1.0, 0], name: 'WW-VS41' });
    this.eq('ww', [-7, -0.1, -6.1], 'PUMP', 'WW-PU41');
    this.inst('ww', 'WWPT41', [-7, Y, -5.2], { off: [-1.2, 1.1, 0] });
    this.vessel('ww', [-10.2, 0, -8], 0.4, 1.0, {});
    this.pipe('ww', [[-9.8, 0.5, -8], [-7.1, 0.5, -8], [-7.1, Y - 0.15, -8]], { kind: 'water', r: 0.05, tA: 'WWTT41', flow: () => 0 });

    this.pipe('ww', [[-3, Y, -3.95], [-3, Y, -10]], { kind: 'water', r: 0.14, tA: 'WWTT42', flow: wwF });
    this.inst('ww', 'WWTT42', [-3, Y, -5.0], { off: [1.2, 1.1, 0] });
    this.inst('ww', 'WWVF41', [-3, Y, -6.4], { off: [1.2, 1.1, 0] });
    this.mesh(new THREE.BoxGeometry(0.4, 0.4, 0.55), MAT.steel, [-3, Y, -6.4]);

    // to Lab Cooler 1 and back
    this.pipe('ww', [[-3, Y, -10], [-3, Y, -14], [-3.35, Y, -14]], { kind: 'water', r: 0.14, tA: 'WWTT42', flow: (D) => wwF(D) * coolFrac(D) });
    this.valve('ww', [-3, Y, -12.2], 'z', { manual: true });
    this.hx('ww', [-5, Y, -14], 3.2, {
      r: 0.7,
      tube: { kind: 'water', dir: -1, tA: 'WWTT42', tB: 'WWTT43', flow: (D) => wwF(D) * coolFrac(D) },
      shell: { kind: 'water', dir: 1, tA: 'CWTC21', tB: 'CWTC22', flow: pct('CWGV21O', 0.8) },
    });
    this.eq('ww', [-5, -0.1, -12.9], 'LAB COOLER 1', 'WW-HX01');
    this.pipe('ww', [[-6.65, Y, -14], [-7, Y, -14], [-7, Y, -10]], { kind: 'water', r: 0.14, tA: 'WWTT43', flow: (D) => wwF(D) * coolFrac(D) });
    this.inst('ww', 'WWTT43', [-7, Y, -13.1], { off: [-1.3, 1.1, 0] });
    this.pipe('ww', [[-10.5, Y, -12], [-7.1, Y, -12]], { kind: 'water', r: 0.07, tA: 15, flow: () => 0 });
    this.eq('ww', [-10.6, 0.3, -12], 'FRESH WATER', 'FW');
    // WW-TC41 is not in use (reads −32768, sensor fault), so it isn't drawn
    // this.inst('ww', 'WWTC41', [-7, Y, -11.1], { off: [-1.3, 1.0, 0] });
    // bypass + mixing valve
    this.pipe('ww', [[-3, Y, -10], [-7, Y, -10]], { kind: 'water', r: 0.12, tA: 'WWTT42', flow: (D) => wwF(D) * (1 - coolFrac(D)) });
    this.valve('ww', [-5, Y, -10], 'x', { manual: true });
    this.valve('ww', [-7, Y, -10], 'z', { out: 'WWGV41O', three: 'x+' });
    this.inst('ww', 'WWGV41O', [-7, Y, -10], { off: [-1.5, 1.4, 0.3], name: 'WW-GV41', fb: 'WWGV41' });
    this.signal([[-7.4, Y + 0.2, -9.0], [-8.0, Y + 0.2, -9.0], [-8.0, Y + 0.2, -10], [-7.3, Y + 0.2, -10]]);

    // make-up to hot water loop via level control valve WW-GV42
    this.pipe('ww', [[-3, Y, -8.2], [3.6, Y, -8.2]], { kind: 'water', r: 0.09, tA: 'WWTT42', flow: mkF });
    this.valve('ww', [-1.6, Y, -8.2], 'x', { manual: true });
    this.valve('hw', [1.6, Y, -8.2], 'x', { out: 'WWGV42O' });
    this.inst('hw', 'WWGV42O', [1.6, Y, -8.2], { off: [0, 1.3, -0.6], name: 'WW-GV42', fb: 'WWGV42', note: 'Make-up level control valve. Feedback reads 0 while commanded open.' });

    // cooling water circuit: fans -> GV21 -> Lab Cooler 1 -> fans
    const cwF = pct('CWGV21O', 0.9);
    this.fanUnit('ww', [-13.4, 0, -16.8], [3.2, 1.3, 2.4], 2, (D) => (nz(D.V('CWGV21O')) / 100) * 3);
    this.eq('ww', [-13.4, 2.1, -16.8], 'DRY COOLER FANS', 'CW');
    this.pipe('ww', [[-11.8, Y, -16.4], [-6, Y, -16.4], [-6, Y, -14.65]], { kind: 'water', r: 0.11, tA: 'CWTC21', flow: cwF });
    this.valve('ww', [-9.6, Y, -16.4], 'x', { out: 'CWGV21O' });
    this.inst('ww', 'CWGV21O', [-9.6, Y, -16.4], { off: [0, 1.3, 0.4], name: 'CW-GV21', fb: 'CWGV21' });
    this.inst('ww', 'CWTC21', [-7.8, Y, -16.4], { off: [0, 1.1, 0.4] });
    this.pipe('ww', [[-4, Y, -14.65], [-4, Y, -18.8], [-13.4, Y, -18.8], [-13.4, Y, -18.05]],
      { kind: 'water', r: 0.11, tA: 'CWTC22', flow: cwF });
    this.inst('ww', 'CWTC22', [-4, Y, -16.8], { off: [1.1, 1.1, 0] });

    // ================= HOT WATER & STEAM =================
    const hwF = lpm('HWVF51', 1.4, 120);
    const flash = this.vessel('hw', [6, 0, -14], 1.1, 6.2, { level: (D) => D.V('HWLT51') / 100, temp: 'HWTT51' });
    this.eq('hw', [6, -0.1, -12.5], 'FLASH TANK', 'HW-FTK01');
    this.inst('hw', 'HWLT51', [4.95, 3.6, -14], { off: [-1.6, 0.6, 0] });

    this.pipe('hw', [[4.95, Y, -14], [3.6, Y, -14], [3.6, Y, -8.2]], { kind: 'water', r: 0.15, tA: 'HWTT51', flow: hwF });
    this.valve('hw', [3.6, Y, -12.8], 'z', { manual: true });
    this.pipe('hw', [[3.6, Y, -8.2], [3.6, Y, -3.95]], { kind: 'water', r: 0.15, tA: 'HWTT51', flow: hwF });
    const hwV = this.pump('hw', [3.6, Y, -7], 'HWVS51', 'z', 1);
    this.inst('hw', 'HWVS51', hwV, { off: [0.6, 1.0, 0], name: 'HW-VS51' });
    this.eq('hw', [3.6, -0.1, -6.1], 'PUMP', 'HW-PU51');
    this.inst('hw', 'HWPT51', [3.6, Y, -5.6], { off: [-1.3, 1.0, 0] });
    this.inst('hw', 'HWTT51', [3.6, Y, -4.6], { off: [-1.3, 1.0, 0] });

    this.pipe('hw', [[8.4, Y, -3.95], [8.4, Y, -12.4], [8.4, 3.9, -12.4], [8.4, 3.9, -14], [7.05, 3.9, -14]], { kind: 'water', r: 0.15, tA: 'HWTT52', flow: hwF });
    this.inst('hw', 'HWTT52', [8.4, Y, -5.0], { off: [1.3, 1.0, 0] });
    this.inst('hw', 'HWVF51', [8.4, Y, -6.6], { off: [1.3, 1.0, 0] });
    this.mesh(new THREE.BoxGeometry(0.45, 0.45, 0.6), MAT.steel, [8.4, Y, -6.6]);
    this.valve('hw', [8.4, Y, -10], 'z', { manual: true });

    // steam line
    const stF = (D) => clamp(nz(D.V('STGV61O')) / 100) * clamp(nz(D.V('STPT61')) / 0.8) * 3;
    this.pipe('hw', [[6, 6.15, -14], [6, 7.2, -14], [14.65, 7.2, -14]], { kind: 'steam', r: 0.2, tA: 'STTT61', flow: stF });
    this.inst('hw', 'STPT61', [8, 7.2, -14], { off: [0, 1.2, 0] });
    this.inst('hw', 'STTT61', [9.5, 7.2, -14], { off: [0, 1.2, 0] });
    this.valve('hw', [11.2, 7.2, -14], 'x', { out: 'STGV61O' });
    this.inst('hw', 'STGV61O', [11.2, 7.2, -14], { off: [0, 1.5, 0], name: 'ST-GV61', fb: 'STGV61', note: 'Steam pressure control valve' });
    this.mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), MAT.steel, [12.8, 7.2, -14]);
    this.eq('hw', [12.8, 6.4, -14], 'ST-VF61', 'not logged');
    this.signal([[8, 7.6, -14], [8, 8.6, -14], [11.2, 8.6, -14], [11.2, 7.95, -14]]);
    this.signal([[4.9, 3.6, -14], [1.6, 3.6, -14], [1.6, 3.6, -8.2], [1.6, 1.8, -8.2]]);
    // chimney
    this.mesh(new THREE.CylinderGeometry(0.35, 0.4, 9, 24), MAT.steel, [15, 4.5, -14]);
    this.mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 24), MAT.dark, [15, 9, -14]);
    this.eq('hw', [15, -0.2, -12.8], 'TO CHIMNEY', 'steam vent', (D) => `≈ ${fmt(D.X.steamKgH, 0)} kg/h (est.)`);

    this.plume = new Plume(this.root, new THREE.Vector3(15, 9.1, -14), 500);
    this.frame.push((dt, t, D) => this.plume.update(dt, stF(D) / 3));
    this.bubbles = new Bubbles(this.root, flash);
    this.frame.push((dt, t, D) => this.bubbles.update(dt, clamp(nz(D.V('STPT61')) / 0.5) * clamp(nz(D.V('HWVF51')) / 60), flash.level()));
  }

  // Bitzer semi-hermetic 4-cylinder piston compressor (4NESP-20), painted Bitzer green.
  // Axis along x: suction shut-off valve on the motor end (−x), crankcase with two cylinder
  // banks in a V on the +x half, discharge valve on top between the heads.
  compressor(pos) {
    const [x, y, z] = pos;
    const body = new THREE.Group();
    body.position.set(x, y, z);
    this.add(body);
    const G = MAT.bitzer;
    const add = (geo, mat, p, r, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r); parent.add(m); return m; };
    const cylX = (r, len, cx, mat, cy = 0, cz = 0) => add(new THREE.CylinderGeometry(r, r, len, 32), mat, [cx, cy, cz], [0, 0, Math.PI / 2]);

    // motor housing with cast ribs
    cylX(0.58, 1.4, -0.7, G);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add(new THREE.BoxGeometry(1.2, 0.08, 0.07), G, [-0.7, Math.cos(a) * 0.6, Math.sin(a) * 0.6], [a, 0, 0]);
    }
    cylX(0.63, 0.09, -1.42, G);            // motor end cover
    cylX(0.65, 0.07, 0.0, MAT.dark);       // flange to crankcase
    // suction shut-off valve + spindle
    cylX(0.2, 0.16, -1.52, MAT.steel);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12), MAT.steel, [-1.52, 0.3, 0]);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 6), MAT.dark, [-1.52, 0.47, 0]);
    // terminal box on the motor housing
    add(new THREE.BoxGeometry(0.72, 0.3, 0.6), G, [-0.75, 0.7, 0]);
    add(new THREE.BoxGeometry(0.78, 0.05, 0.66), MAT.dark, [-0.75, 0.87, 0]);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), MAT.dark, [-1.05, 0.72, 0.36], [Math.PI / 2, 0, 0]);
    const lamp = add(new THREE.SphereGeometry(0.06, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33ff77, emissiveIntensity: 0 }), [-0.45, 0.92, 0.18]);
    // name plate
    add(new THREE.BoxGeometry(0.42, 0.24, 0.02), MAT.blade, [-0.7, -0.05, 0.6]);

    // crankcase with oil sump, oil pump end cover and sight glass
    add(new THREE.BoxGeometry(1.3, 0.9, 1.06), G, [0.65, -0.12, 0]);
    cylX(0.57, 1.3, 0.65, G);
    add(new THREE.BoxGeometry(1.2, 0.2, 1.12), G, [0.65, -0.52, 0]);
    cylX(0.44, 0.14, 1.36, G);
    cylX(0.2, 0.14, 1.48, MAT.dark);
    add(new THREE.TorusGeometry(0.11, 0.025, 8, 20), MAT.dark, [0.55, -0.3, 0.535]);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20),
      new THREE.MeshStandardMaterial({ color: 0xd9b04a, emissive: 0x6b4a10, emissiveIntensity: 0.7, roughness: 0.1 }),
      [0.55, -0.3, 0.535], [Math.PI / 2, 0, 0]);

    // two cylinder banks in a V; heads warm up with the discharge temperature
    const headMat = G.clone();
    for (const side of [-1, 1]) {
      const bank = new THREE.Group();
      bank.position.set(0.65, 0.3, 0);
      bank.rotation.x = side * 0.72;
      body.add(bank);
      add(new THREE.BoxGeometry(1.12, 0.46, 0.5), G, [0, 0.3, 0], null, bank);
      add(new THREE.BoxGeometry(1.22, 0.16, 0.6), headMat, [0, 0.6, 0], null, bank);
      for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.05, 0.14, 0.6), headMat, [-0.5 + i * 0.2, 0.75, 0], null, bank);
    }
    // discharge manifold between the heads and discharge shut-off valve
    add(new THREE.CylinderGeometry(0.075, 0.075, 1.0, 12), MAT.steel, [1.0, 1.02, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.26, 0.26, 0.26), MAT.steel, [1.0, 1.15, 0]);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 12), MAT.steel, [1.0, 1.4, 0]);
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 6), MAT.dark, [1.0, 1.54, 0]);

    // cast feet on a plinth
    for (const fx of [-0.95, 0.7]) add(new THREE.BoxGeometry(0.32, 0.32, 1.25), G, [fx, -0.62, 0]);
    this.mesh(new THREE.BoxGeometry(2.9, y - 0.78, 1.45), MAT.dark, [x, (y - 0.78) / 2, z]);

    let run = 0;
    this.frame.push((dt, t, D) => {
      const hz = nz(D.V('HPCO01_FREQUENCY'));
      run = lerp(run, hz > 1 ? 1 : 0, Math.min(1, dt * 3));
      const a = 0.012 * run * (0.5 + hz / 140);
      body.position.set(x + Math.sin(t * 91) * a, y + Math.sin(t * 77 + 1) * a, z + Math.cos(t * 83) * a);
      const trip = nz(D.raw.HPCO01_TRIP_FLAGS) !== 0;
      lamp.material.emissive.setHex(trip ? 0xff3344 : 0x33ff77);
      lamp.material.emissiveIntensity = trip ? 1.5 + Math.sin(t * 6) : 0.1 + 1.8 * run;
    });
    this.updaters.push((D) => {
      const td = D.V('HPTT02');
      headMat.emissive.setRGB(...tempRGB(td));
      headMat.emissiveIntensity = Number.isFinite(td) ? clamp((td - 40) / 80) * 0.35 : 0;
    });

    this.eq('hp', [x, -0.15, z + 1.25], 'COMPRESSOR', 'HP-CO01 · Bitzer 4NESP-20',
      (D) => `${fmt(D.V('HPCO01_FREQUENCY'), 1)} Hz · ${fmt(D.V('HPCO01_POWER'), 1)} kW`);
    this.inst('hp', 'HPTC03', [x - 0.3, y + 0.6, z + 0.4], { off: [-0.4, 1.3, -0.4], note: 'Compressor body thermocouple' });
    // Drive discharge-temperature sensor is unplugged (reads 200 °C). Uncomment once rewired.
    // this.inst('hp', 'HPCO01_DISCHARGE_TEMPERATURE', [x + 1.0, y + 1.6, z], { off: [0.6, 1.0, 0.6], name: 'HP-CO01 T<sub>dis</sub>' });

    // VSD cabinet
    const vx = x - 0.4, vz = z + 1.9;
    this.mesh(new THREE.BoxGeometry(1.0, 1.7, 0.5), MAT.cabinet, [vx, 0.85, vz]);
    const scr = this.mesh(new THREE.PlaneGeometry(0.6, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22ddff, emissiveIntensity: 0 }), [vx, 1.25, vz + 0.26]);
    this.updaters.push((D) => { scr.material.emissiveIntensity = nz(D.V('HPCO01_FREQUENCY')) > 1 ? 1 : 0.05; });
    this.signal([[vx, 1.7, vz], [vx, 1.9, z], [x - 0.4, 1.4, z]]);
    const el = this.label([vx + 1.5, 2.3, vz + 0.4],
      `<span class="tn">HP-VSD01</span><span class="vsd"></span>`, 'tag k-S sys-hp wide');
    const vsd = el.querySelector('.vsd');
    this.updaters.push((D) => {
      vsd.innerHTML = `<b>${fmt(D.V('HPCO01_FREQUENCY'), 1)}</b><i>Hz</i> <b>${fmt(D.V('HPCO01_POWER'), 1)}</b><i>kW</i><br>` +
        `<b>${fmt(D.V('HPCO01_CURRENT'), 1)}</b><i>A</i> <b>${fmt(D.V('HPCO01_VOLTAGE'), 0)}</b><i>V</i>`;
      el.classList.toggle('stale', D.stale('HPCO01_FREQUENCY'));
    });
  }

  // ------------------------------------------------------------ runtime
  onData(D) {
    for (const p of this.pipes) {
      const val = (x) => (typeof x === 'function' ? x(D) : typeof x === 'string' ? D.V(x) : x);
      const a = tempRGB(val(p.o.tA));
      const b = tempRGB(val(p.o.tB ?? p.o.tA));
      p.mat.uniforms.uA.value.set(...a);
      p.mat.uniforms.uB.value.set(...b);
      const tagA = typeof p.o.tA === 'string' ? p.o.tA : null;
      p.mat.uniforms.uStale.value = tagA && D.stale(tagA) ? 0.75 : 0;
    }
    for (const u of this.updaters) u(D);
  }

  update(dt, t, D) {
    for (const p of this.pipes) {
      const target = p.o.flow ? Math.max(0, nz(p.o.flow(D))) : 0;
      p.speed = lerp(p.speed, target, Math.min(1, dt * 2));
      p.phase = (p.phase + p.speed * dt) % 1440;
      p.mat.uniforms.uPhase.value = p.phase;
      p.mat.uniforms.uFlow.value = clamp(p.speed);
      p.mat.uniforms.uTime.value = t;
    }
    for (const s of this.spinners) {
      const target = Math.max(0, nz(typeof s.rate === 'function' ? s.rate(D) : s.rate));
      s.cur = lerp(s.cur, target, Math.min(1, dt * 1.5));
      s.obj.rotation[s.axis] += s.cur * Math.PI * 2 * dt;
    }
    for (const f of this.frame) f(dt, t, D);
  }

  setFocus(sys) {
    for (const l of this.labels) {
      l.el.classList.toggle('dim', sys !== 'overview' && l.sys !== sys);
    }
  }
}

// --------------------------------------------------------------- particles
function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const SPRITE = softSprite();

class Plume {
  constructor(parent, origin, n) {
    this.o = origin; this.n = n; this.acc = 0;
    this.pos = new Float32Array(n * 3).fill(-1000);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(99);
    this.life = new Float32Array(n).fill(1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({
      size: 1.6, map: SPRITE, transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true,
    }));
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    this.next = 0;
  }
  update(dt, rate) {
    this.acc += rate * 140 * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      const i = this.next; this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = this.o.x + (Math.random() - 0.5) * 0.3;
      this.pos[i * 3 + 1] = this.o.y;
      this.pos[i * 3 + 2] = this.o.z + (Math.random() - 0.5) * 0.3;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.5 + 0.35;
      this.vel[i * 3 + 1] = 1.6 + Math.random() * 1.2;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      this.age[i] = 0;
      this.life[i] = 2.5 + Math.random() * 2;
    }
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] > this.life[i]) { this.col[i * 4 + 3] = 0; continue; }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      this.vel[i * 3 + 1] *= 1 - 0.35 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 4] = this.col[i * 4 + 1] = this.col[i * 4 + 2] = 0.95;
      this.col[i * 4 + 3] = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k);
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

class Bubbles {
  constructor(parent, v) {
    this.v = v; this.n = 120;
    this.pos = new Float32Array(this.n * 3);
    this.spd = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.reset(i, Math.random());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.18, map: SPRITE, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0 });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 4;
    parent.add(this.pts);
  }
  reset(i, f = 0) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * this.v.r * 0.8;
    this.pos[i * 3] = this.v.x + Math.cos(a) * rr;
    this.pos[i * 3 + 1] = this.v.y0 + 0.3 + f * (this.v.h * 0.5);
    this.pos[i * 3 + 2] = this.v.z + Math.sin(a) * rr;
    this.spd[i] = 0.6 + Math.random() * 0.8;
  }
  update(dt, intensity, level) {
    this.mat.opacity = 0.8 * intensity;
    const top = this.v.y0 + 0.06 + level * (this.v.h - 0.12);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3 + 1] += this.spd[i] * dt * (0.3 + intensity);
      if (this.pos[i * 3 + 1] > top) this.reset(i);
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
}
