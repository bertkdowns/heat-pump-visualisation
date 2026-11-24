import { fmt, tagLabel, TAGS, cssTemp } from './tags.js';

const K = (label, fn, unit, dp = 1, hint = '') => ({ label, fn, unit, dp, hint });

export const VIEWS = [
  {
    id: 'overview', key: '1', name: 'Overview',
    cam: { pos: [0, 37, 34], tgt: [-0.5, 0, 0.5] },
    title: 'Steam generating heat pump',
    desc: 'Source water at about 60 °C is lifted by an n-butane heat pump. The condenser heats a pressurised hot-water loop that flashes to steam, and the subcooler heats the warm-water loop.',
    kpis: [
      K('Compressor', (D) => D.V('HPCO01_FREQUENCY'), 'Hz'),
      K('Compressor power', (D) => D.V('HPCO01_POWER'), 'kW'),
      K('Heat delivered', (D) => D.X.qHeat, 'kW', 1, 'Condenser + subcooler, from water-side ΔT and flow'),
      K('COP (heating)', (D) => D.X.cop, '', 2),
      K('Heat from source', (D) => D.X.qEvap, 'kW'),
      K('Energy balance error', (D) => D.X.balance, '%', 1, '(Qcond + Qsub − Qevap − W) / Qheat'),
      K('Steam pressure', (D) => D.V('STPT61'), 'bar g', 2),
      K('Steam (estimated)', (D) => D.X.steamKgH, 'kg/h', 0, 'Qcond / (h_g − h_f of make-up water)'),
    ],
    trends: ['HPCO01_FREQUENCY', 'HPCO01_POWER', 'STPT61', 'HWLT51'],
  },
  {
    id: 'hp', key: '2', name: 'Heat pump', sys: 'hp',
    cam: { pos: [-0.8, 22, 23], tgt: [-0.8, 0, 0.8] },
    title: 'n-butane heat pump',
    desc: 'Compressor HP-CO01 → oil separator → condenser → receiver → subcooler → EEV → evaporator/IHX → suction accumulator. Butane is shown with a helical pattern: droplets for liquid, bubble rings for vapour, both for two-phase.',
    kpis: [
      K('Frequency', (D) => D.V('HPCO01_FREQUENCY'), 'Hz'),
      K('Power', (D) => D.V('HPCO01_POWER'), 'kW'),
      K('Current', (D) => D.V('HPCO01_CURRENT'), 'A'),
      K('Mass flow', (D) => D.V('HPMF01'), 'kg/h', 0),
      K('Pressure ratio', (D) => D.X.pr, '', 2),
      K('T sat evap / cond', (D) => [D.X.tSatEvap, D.X.tSatCond], '°C', 1, 'n-butane Antoine from HP-PT01 / HP-PT03'),
      K('Temperature lift', (D) => D.X.lift, 'K'),
      K('Superheat PLC / calc', (D) => [D.V('HPEV01_Superheat'), D.X.shCalc], 'K'),
      K('Subcooling', (D) => D.X.subcool, 'K', 1, 'Tsat(HP-PT03) − HP-TT04'),
      K('EEV opening', (D) => D.V('HPEV01'), '%'),
      K('COP / Carnot', (D) => [D.X.cop, D.X.copCarnot], '', 2),
      K('2nd-law efficiency', (D) => D.X.eta, '%', 0),
      K('Gas detector HP-GD01', (D) => D.V('HPGD01'), 'raw', 0, 'Baseline ≈ 1; alarm above 20'),
    ],
    trends: ['HPPT02', 'HPPT01', 'HPTT02', 'HPMF01', 'HPEV01', 'HPEV01_Superheat'],
  },
  {
    id: 'so', key: '3', name: 'Source loop', sys: 'so',
    cam: { pos: [-6.5, 13.5, 27], tgt: [-6.5, 0, 10.5] },
    title: 'Source loop',
    desc: 'Water from hold-up tank SO-ST01 is pumped through the evaporator. The PHNIX propane heat pump (EX-SP01) puts the heat back. Lab Cooler 2 (WW-HX02, added in P&ID V24) can bleed heat to the dry-cooler circuit.',
    kpis: [
      K('Flow', (D) => D.V('SOVF31'), 'L/min'),
      K('Evaporator duty', (D) => D.X.qEvap, 'kW'),
      K('Propane HP duty', (D) => D.X.qProp, 'kW'),
      K('Supply / return', (D) => [D.V('SOTT31'), D.V('SOTT32')], '°C'),
      K('Tank level', (D) => D.V('SOLT31'), '%', 0),
      K('Tank temperature', (D) => D.V('SOTC31'), '°C'),
      K('Pump VSD', (D) => D.V('SOVS31'), '%', 0),
      K('Loop pressure', (D) => D.V('SOPT31'), 'bar g', 2),
    ],
    trends: ['SOTT31', 'SOTT32', 'SOTT33', 'SOVF31', 'SOLT31'],
  },
  {
    id: 'ww', key: '4', name: 'Warm water', sys: 'ww',
    cam: { pos: [-6.5, 20, 7], tgt: [-6.5, 0, -10.5] },
    title: 'Warm water & cooling',
    desc: 'The subcooler heats the warm-water loop. Mixing valve WW-GV41 sends part of the flow through Lab Cooler 1 to hold the pump inlet temperature, and WW-GV42 feeds make-up water to the flash tank. The dry-cooler fans then serve Lab Cooler 1 and Lab Cooler 2 in series.',
    kpis: [
      K('Flow', (D) => D.V('WWVF41'), 'L/min'),
      K('Subcooler duty', (D) => D.X.qSub, 'kW'),
      K('In / out', (D) => [D.V('WWTT41'), D.V('WWTT42')], '°C'),
      K('Mixing valve GV41', (D) => D.V('WWGV41O'), '%', 0),
      K('Make-up valve GV42', (D) => D.V('WWGV42O'), '%', 0),
      K('Pump VSD', (D) => D.V('WWVS41'), '%', 0),
      K('Cooling water in / out', (D) => [D.V('CWTC21'), D.V('CWTC22')], '°C'),
      K('CW valve GV21', (D) => D.V('CWGV21O'), '%', 0),
    ],
    trends: ['WWTT41', 'WWTT42', 'WWTT43', 'WWVF41', 'WWGV41O', 'CWTC22'],
  },
  {
    id: 'hw', key: '5', name: 'Hot water & steam', sys: 'hw',
    cam: { pos: [8.5, 19, 11], tgt: [8.5, 3.5, -10] },
    title: 'Hot water & steam',
    desc: 'HW-PU51 circulates pressurised water through the condenser into flash tank HW-FTK01. Steam leaves through pressure-control valve ST-GV61 to the chimney, and level control opens WW-GV42 to add make-up water.',
    kpis: [
      K('Flow', (D) => D.V('HWVF51'), 'L/min'),
      K('Condenser duty', (D) => D.X.qCond, 'kW'),
      K('In / out', (D) => [D.V('HWTT51'), D.V('HWTT52')], '°C'),
      K('Flash tank level', (D) => D.V('HWLT51'), '%', 0),
      K('Steam pressure', (D) => D.V('STPT61'), 'bar g', 2),
      K('Steam T / T sat', (D) => [D.V('STTT61'), D.X.tSatSteam], '°C'),
      K('Steam valve GV61', (D) => D.V('STGV61O'), '%', 0),
      K('Steam (estimated)', (D) => D.X.steamKgH, 'kg/h', 0),
    ],
    trends: ['HWTT51', 'HWTT52', 'HWVF51', 'HWLT51', 'STPT61', 'STTT61', 'STGV61O'],
  },
];

export const TREND_TAGS = [...new Set(VIEWS.flatMap((v) => v.trends))];

const $ = (s) => document.querySelector(s);

export class UI {
  constructor(D, cfg, handlers) {
    this.D = D; this.cfg = cfg; this.h = handlers;
    this.view = VIEWS[0];
    const nav = $('#views');
    for (const v of VIEWS) {
      const b = document.createElement('button');
      b.textContent = v.name;
      b.dataset.id = v.id;
      b.title = `${v.name} (${v.key})`;
      b.onclick = () => handlers.select(v.id, true);
      nav.appendChild(b);
    }
    $('#present').onclick = () => handlers.togglePresent();
    $('#labels').onclick = () => this.cycleLabels();
    $('#panel-toggle').onclick = () => document.body.classList.toggle('panel-hidden');
    $('#fullscreen').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    };
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) handlers.select(v.id, true);
      if (e.key === 'p' || e.key === ' ') { e.preventDefault(); handlers.togglePresent(); }
      if (e.key === 'l') this.cycleLabels();
      if (e.key === 'f') $('#fullscreen').click();
      if (e.key === 'ArrowRight') handlers.step(1);
      if (e.key === 'ArrowLeft') handlers.step(-1);
    });
    this.labelMode = 0;
    setInterval(() => this.clock(), 1000);
  }

  cycleLabels() {
    this.labelMode = (this.labelMode + 1) % 3;
    document.body.dataset.labels = ['all', 'focus', 'none'][this.labelMode];
    $('#labels').textContent = ['Labels: all', 'Labels: focus', 'Labels: off'][this.labelMode];
  }

  setView(v) {
    this.view = v;
    document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('active', b.dataset.id === v.id));
    document.body.dataset.view = v.id;
    $('#p-title').textContent = v.title;
    $('#p-desc').textContent = v.desc;
    const k = $('#kpis');
    k.innerHTML = '';
    this.kpiEls = v.kpis.map((kp) => {
      const row = document.createElement('div');
      row.className = 'kpi';
      row.title = kp.hint;
      row.innerHTML = `<span>${kp.label}</span><b></b><i>${kp.unit}</i>`;
      k.appendChild(row);
      return row.querySelector('b');
    });
    const tr = $('#trends');
    tr.innerHTML = '';
    this.trendEls = v.trends.map((tag) => {
      const row = document.createElement('div');
      row.className = 'trend';
      const m = TAGS[tag] || {};
      row.innerHTML = `<div class="th"><span>${tagLabel(tag)}</span><em>${m.desc || ''}</em><b></b></div><canvas></canvas>`;
      tr.appendChild(row);
      return { tag, cv: row.querySelector('canvas'), val: row.querySelector('b') };
    });
    $('#trend-h').textContent = `Last ${this.cfg.trendMinutes} min`;
    this.refresh();
  }

  setPresent(on) {
    $('#present').classList.toggle('on', on);
    $('#present').innerHTML = on ? '❚❚ Presenting' : '▶ Present';
    document.body.classList.toggle('presenting', on);
  }
  setProgress(f) { $('#progress i').style.width = `${(f * 100).toFixed(2)}%`; }

  clock() {
    const D = this.D;
    const st = $('#status');
    st.className = `pill ${D.status}`;
    if (D.status === 'live') st.textContent = 'LIVE';
    else if (D.status === 'stale') st.textContent = 'STALE';
    else if (D.status === 'error') st.textContent = 'NO CONNECTION';
    else st.textContent = 'CONNECTING';
    st.title = D.error || '';
    $('#clock').textContent = D.latest
      ? `data ${new Date(D.latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      : '';
  }

  refresh() {
    const D = this.D;
    if (!this.kpiEls) return;
    this.view.kpis.forEach((kp, i) => {
      const v = kp.fn(D);
      this.kpiEls[i].textContent = Array.isArray(v) ? v.map((x) => fmt(x, kp.dp)).join(' / ') : fmt(v, kp.dp);
    });
    for (const t of this.trendEls) this.drawTrend(t);
    this.alarms();
    this.clock();
  }

  drawTrend({ tag, cv, val }) {
    const D = this.D;
    const m = TAGS[tag] || { scale: 1, dp: 1, unit: '' };
    const v = D.V(tag);
    val.innerHTML = `${fmt(v, m.dp)} <i>${m.unit}</i>`;
    if (m.kind === 'T') val.style.color = cssTemp(v);
    const data = (D.trend[tag] || []).map(([t, y]) => [t, y * m.scale]).filter(([, y]) => y > -3000 && y < 3000);
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 260, H = cv.clientHeight || 38;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    if (data.length < 2) {
      g.fillStyle = '#5a6578'; g.font = '11px Inter, sans-serif'; g.fillText('no data in window', 4, H / 2 + 4);
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const [, y] of data) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const t0 = Date.now() - this.cfg.trendMinutes * 60000, t1 = Date.now();
    const X = (t) => ((t - t0) / (t1 - t0)) * W, Yy = (y) => H - ((y - lo) / (hi - lo)) * H;
    const stroke = m.kind === 'T' ? cssTemp(v) : getComputedStyle(document.body).getPropertyValue('--accent') || '#5cc8ff';
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(120,170,255,0.18)');
    grad.addColorStop(1, 'rgba(120,170,255,0)');
    g.beginPath();
    data.forEach(([t, y], i) => (i ? g.lineTo(X(t), Yy(y)) : g.moveTo(X(t), Yy(y))));
    g.lineTo(X(data[data.length - 1][0]), H); g.lineTo(X(data[0][0]), H); g.closePath();
    g.fillStyle = grad; g.fill();
    g.beginPath();
    data.forEach(([t, y], i) => (i ? g.lineTo(X(t), Yy(y)) : g.moveTo(X(t), Yy(y))));
    g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#7c889c'; g.font = '10px JetBrains Mono, monospace';
    g.fillText(fmt(hi - pad, m.dp), 2, 10);
    g.fillText(fmt(lo + pad, m.dp), 2, H - 2);
  }

  alarms() {
    const D = this.D;
    const a = [];
    if (D.status === 'error') a.push(['err', `InfluxDB: ${D.error}`]);
    if (D.status === 'stale') a.push(['warn', `No new PLC data since ${new Date(D.latest).toLocaleString()}`]);
    // baseline reading is ~1 (raw counts); alarm only on a clear rise
    if (D.V('HPGD01') > 20) a.push(['err', `Gas detector HP-GD01 reading ${D.V('HPGD01')}`]);
    if (D.raw.HPCO01_TRIP_FLAGS) a.push(['err', `Compressor trip flags 0x${D.raw.HPCO01_TRIP_FLAGS.toString(16)}`]);
    if (D.B('SHUTDOWN_STARTED')) a.push(['warn', 'Shutdown sequence in progress']);
    if (D.raw.OVERRIDE_FLAGS) a.push(['warn', `PLC overrides active (0x${D.raw.OVERRIDE_FLAGS.toString(16)})`]);
    $('#alarms').innerHTML = a.map(([c, t]) => `<div class="${c}">${t}</div>`).join('');
  }
}
