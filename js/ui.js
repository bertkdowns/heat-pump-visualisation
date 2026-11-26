import { fmt, tagLabel, TAGS, cssTemp } from './tags.js';
import { TRIPS, OVERRIDES, decode, startupState } from './flags.js';

const isoSec = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
// value for <input type="datetime-local"> in the browser's time zone
const localInput = (ms) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 19); };
const fmtWhen = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const SPEEDS = [1, 5, 10, 30, 60];
const hex = (w) => `0x${Number(w).toString(16).toUpperCase().padStart(4, '0')}`;
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
      K('IHX duty', (D) => D.X.qIHX, 'kW', 2, 'Liquid side: HP-MF01 × (h(HP-TT04) − h(HP-TT05)), liquid n-butane at HP-PT03'),
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
    desc: 'Water from hold-up tank SO-ST01 is pumped through the evaporator. The PHNIX propane heat pump SO-HP31 puts the heat back through plate exchanger EX-SP01.',
    kpis: [
      K('Flow', (D) => D.V('SOVF31'), 'L/min'),
      K('Evaporator duty', (D) => D.X.qEvap, 'kW'),
      K('Propane HP duty', (D) => D.X.qProp, 'kW'),
      K('Supply / return', (D) => [D.V('SOTT31'), D.V('SOTT32')], '°C'),
      K('Tank level', (D) => D.V('SOLT31'), '%', 0),
      K('Tank temperature', (D) => D.V('SOTC31'), '°C'),
      K('Pump VSD', (D) => D.V('SOVS31'), '%', 0),
      K('Loop pressure', (D) => D.V('SOPT31'), 'bar g', 2),
      K('PHNIX compressors', (D) => [D.V('PX_C1HZ'), D.V('PX_C2HZ')], 'Hz', 0),
    ],
    trends: ['SOTT31', 'SOTT32', 'SOTT33', 'SOVF31', 'SOLT31'],
  },
  {
    id: 'px', key: '6', name: 'Propane HP', sys: 'so',
    cam: { pos: [-9.5, 8.5, 23.5], tgt: [-12.2, 1.2, 11.6] },
    title: 'PHNIX propane heat pump SO-HP31',
    desc: 'Air-source R290 heat pump with two inverter compressors. It heats its own water circuit, which warms the source loop through plate exchanger EX-SP01. Values come from its Modbus registers: the controller (device 0) and the two inverter boards (devices 3 and 4).',
    kpis: [
      K('Mode', (D) => D.X.pxMode, '', 0, 'Controller register 2012: 1 heating, 250 defrost'),
      K('Compressor 1 / 2', (D) => [D.V('PX_C1HZ'), D.V('PX_C2HZ')], 'Hz', 0, 'Inverter boards, register 2102'),
      K('Commanded 1 / 2', (D) => [D.V('PX_C1CMD'), D.V('PX_C2CMD')], 'Hz', 0),
      K('Input current 1 / 2', (D) => [D.V('PX_C1A'), D.V('PX_C2A')], 'A'),
      K('Apparent input', (D) => D.X.pxKVA, 'kVA', 1, '√3 · V · I for both inverter boards. No power factor is logged, so this is not kW.'),
      K('Water out / in', (D) => [D.V('PX_TOUT'), D.V('PX_TIN')], '°C'),
      K('Set point', (D) => D.V('PX_SET'), '°C'),
      K('Outdoor air / coil', (D) => [D.V('PX_TAMB'), D.V('PX_TCOIL')], '°C'),
      K('Discharge 1 / 2', (D) => [D.V('PX_TDIS1'), D.V('PX_TDIS2')], '°C'),
      K('Low pressure 1 / 2', (D) => [D.V('PX_PLO1'), D.V('PX_PLO2')], 'bar g'),
      K('Inverter module 1 / 2', (D) => [D.V('PX_C1TM'), D.V('PX_C2TM')], '°C', 0, 'Register 2110, probably the power module temperature'),
      K('Heat into source loop', (D) => D.X.qProp, 'kW', 1, 'EX-SP01 duty from SO-VF31 and SO-TT32 → SO-TT33'),
    ],
    trends: ['PX_C1HZ', 'PX_C2HZ', 'PX_TOUT', 'PX_TIN', 'PX_TAMB', 'PX_C1A'],
  },
  {
    id: 'ww', key: '4', name: 'Warm water', sys: 'ww',
    cam: { pos: [-6.5, 20, 7], tgt: [-6.5, 0, -10.5] },
    title: 'Warm water & cooling',
    desc: 'The subcooler heats the warm-water loop. Mixing valve WW-GV41 sends part of the flow through Lab Cooler 1 to hold the pump inlet temperature, and WW-GV42 feeds make-up water to the flash tank. The dry-cooler fans cool Lab Cooler 1 through valve CW-GV21.',
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
    this.sheet();
    // phones show alarms as one line; tap one for its description
    $('#alarms').addEventListener('click', (e) => e.target.closest('#alarms > div')?.classList.toggle('open'));
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
    this.menu();
    this.shareDialog();
    this.replayDialog();
    D.onReplay((r) => this.syncReplay(r));
    this.syncReplay(D.replay);
    setInterval(() => this.clock(), 1000);
  }

  // ------------------------------------------------------------ ⋮ menu
  menu() {
    const btn = $('#menu-btn'), m = $('#menu');
    if (!btn) return; // stale cached index.html
    const close = () => { m.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.onclick = (e) => {
      e.stopPropagation();
      m.hidden = !m.hidden;
      btn.setAttribute('aria-expanded', String(!m.hidden));
      if (!m.hidden) m.querySelector('button:not([hidden])')?.focus();
    };
    m.addEventListener('click', close);
    document.addEventListener('click', (e) => { if (!m.hidden && !m.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) { close(); btn.focus(); } });
    $('#live-btn').onclick = () => this.goLive();
  }

  // ------------------------------------------------------------ share link
  shareDialog() {
    const dlg = $('#share');
    if (!dlg) return;
    const url = $('#share-url'), msg = $('#share-msg');
    const update = () => { url.value = this.shareUrl(); msg.textContent = ''; msg.className = 'note'; };
    ['#share-token', '#share-view', '#share-time'].forEach((s) => { $(s).onchange = update; });
    $('#share-btn').onclick = () => {
      const tok = $('#share-token');
      tok.disabled = !this.cfg.token;
      if (!this.cfg.token) tok.checked = false;
      $('#share-view-name').textContent = this.view.name;
      $('#share-view').closest('label').hidden = this.view.id === 'overview';
      $('#share-time-row').hidden = !this.D.replay;
      if (this.D.replay) $('#share-time-text').textContent = `${fmtWhen(this.D.now())} (${this.D.replay.speed}×)`;
      update();
      $('#share-native').hidden = !navigator.share;
      dlg.showModal();
      url.select();
    };
    $('#share-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url.value);
      } catch {
        url.select();
        document.execCommand?.('copy');
      }
      msg.textContent = $('#share-token').checked ? 'Copied. The link contains the access token, so only send it to people who should see the data.' : 'Copied.';
      msg.className = 'note ok';
    };
    $('#share-native').onclick = () => navigator.share?.({ title: document.title, url: url.value }).catch(() => {});
  }

  shareUrl() {
    const p = new URLSearchParams(location.search);
    for (const k of ['token', 'start', 'speed', 'view']) p.delete(k);
    if ($('#share-view').checked && this.view.id !== 'overview') p.set('view', this.view.id);
    if (this.D.replay && $('#share-time').checked) {
      p.set('start', isoSec(this.D.now()));
      p.set('speed', String(this.D.replay.speed));
    }
    if ($('#share-token').checked && this.cfg.token) p.set('token', this.cfg.token);
    const q = p.toString();
    return `${location.origin}${location.pathname}${q ? `?${q}` : ''}`;
  }

  // ------------------------------------------------------------ historical replay
  replayDialog() {
    const dlg = $('#replay');
    if (!dlg) return;
    $('#replay-btn').onclick = () => {
      const D = this.D;
      $('#replay-start').value = localInput(D.replay ? D.now() : Date.now() - 3600 * 1000);
      $('#replay-start').max = localInput(Date.now());
      const sp = D.replay ? D.replay.speed : 1;
      dlg.querySelectorAll('input[name=speed]').forEach((r) => { r.checked = Number(r.value) === sp; });
      $('#replay-live').hidden = !D.replay;
      dlg.returnValue = '';
      dlg.showModal();
    };
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'live') this.goLive();
      if (dlg.returnValue !== 'start') return;
      const t = new Date($('#replay-start').value).getTime(); // datetime-local is parsed as local time
      const sp = Number(dlg.querySelector('input[name=speed]:checked')?.value || 1);
      if (Number.isFinite(t)) { this.D.setReplay(t, sp); this.h.kick?.(); }
    });
    // controls on the replay bar
    const bar = $('#replaybar');
    bar.innerHTML = `<span class="rp">REPLAY</span><span class="rt"></span>
      <button data-act="pause" title="Pause / play"></button>
      <span class="sp">${SPEEDS.map((v) => `<button data-speed="${v}" title="${v}× speed">${v}×</button>`).join('')}</span>
      <button data-act="live" title="Back to live data">Live</button>`;
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.speed) this.D.setSpeed(Number(b.dataset.speed));
      if (b.dataset.act === 'pause') this.D.setPaused(!this.D.replay?.paused);
      if (b.dataset.act === 'live') this.goLive();
      this.h.kick?.();
    });
  }

  goLive() {
    if (!this.D.replay) return;
    this.D.setReplay(null);
    this.h.kick?.();
  }

  // replay state changed: address bar, replay bar, menu entries
  syncReplay(r) {
    const p = new URLSearchParams(location.search);
    if (r) { p.set('start', isoSec(r.base)); p.set('speed', String(r.speed)); } else { p.delete('start'); p.delete('speed'); }
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    const bar = $('#replaybar');
    if (bar) {
      bar.hidden = !r;
      if (r) {
        bar.querySelector('[data-act=pause]').textContent = r.paused ? '▶' : '❚❚';
        bar.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === r.speed));
      }
    }
    const lb = $('#live-btn');
    if (lb) lb.hidden = !r;
    const sub = $('.name small');
    if (sub) sub.textContent = `n-butane · Ahuora lab · ${r ? 'replay' : 'live'}`;
    this.clock();
  }

  // Phones: the side panel becomes a bottom sheet. Collapsed, it shows the view title and a
  // strip of KPIs; tap or swipe the head to open the description, trends and legend.
  sheet() {
    const body = document.body, head = $('#sheet-head'), panel = $('#panel'), legend = $('#legend');
    if (!head) return; // stale cached index.html
    const mq = matchMedia('(max-width: 820px)');
    const place = () => {
      if (mq.matches) panel.appendChild(legend);
      else { body.appendChild(legend); body.classList.remove('sheet-open'); }
    };
    mq.addEventListener('change', place);
    place();
    let y0 = null;
    head.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    head.addEventListener('pointercancel', () => { y0 = null; });
    head.addEventListener('pointerup', (e) => {
      if (y0 === null || !mq.matches) return;
      const dy = e.clientY - y0;
      y0 = null;
      const open = body.classList.contains('sheet-open');
      body.classList.toggle('sheet-open', Math.abs(dy) < 12 ? !open : dy < 0);
      if (body.classList.contains('sheet-open')) panel.scrollTop = 0;
    });
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
    // keep ?view= in the address so a reload or copied address opens the same view
    const p = new URLSearchParams(location.search);
    if (v.id === 'overview') p.delete('view'); else p.set('view', v.id);
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
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
    $('#present').innerHTML = on ? '❚❚<span> Presenting</span>' : '▶<span> Present</span>';
    document.body.classList.toggle('presenting', on);
    if (on) document.body.classList.remove('sheet-open');
  }
  setProgress(f) { $('#progress i').style.width = `${(f * 100).toFixed(2)}%`; }

  clock() {
    const D = this.D;
    const st = $('#status');
    st.className = `pill ${D.replay && D.status !== 'error' ? 'replay' : D.status}`;
    if (D.replay) st.textContent = D.status === 'stale' ? 'REPLAY · NO DATA' : D.replay.paused ? 'REPLAY ❚❚' : `REPLAY ${D.replay.speed}×`;
    else if (D.status === 'live') st.textContent = 'LIVE';
    else if (D.status === 'stale') st.textContent = 'STALE';
    else if (D.status === 'error') st.textContent = 'NO CONNECTION';
    else st.textContent = 'CONNECTING';
    st.title = D.error || '';
    $('#clock').textContent = D.replay ? fmtWhen(D.now())
      : D.latest ? `data ${new Date(D.latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '';
    const rt = document.querySelector('#replaybar .rt');
    if (rt && D.replay) rt.textContent = fmtWhen(D.now());
  }

  refresh() {
    const D = this.D;
    if (!this.kpiEls) return;
    this.view.kpis.forEach((kp, i) => {
      const v = kp.fn(D);
      this.kpiEls[i].textContent = typeof v === 'string' ? v
        : Array.isArray(v) ? v.map((x) => fmt(x, kp.dp)).join(' / ') : fmt(v, kp.dp);
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
    const t1 = D.now(), t0 = t1 - this.cfg.trendMinutes * 60000;
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
    if (D.raw.HPCO01_TRIP_FLAGS) {
      for (const f of decode(D.raw.HPCO01_TRIP_FLAGS, TRIPS, 'Trip')) a.push(['err', `Trip: ${f.label}`, f.desc, f.alias]);
    }
    if (D.B('SHUTDOWN_STARTED')) a.push(['warn', 'Shutdown sequence in progress']);
    if (D.V('PX_MODE') === 250) a.push(['warn', 'PHNIX defrosting', 'Controller mode 250: the source heat pump is reversing to melt ice off its coil']);
    for (const n of [1, 2]) {
      const w = D.raw[`PX_C${n}FLT`];
      if (w) a.push(['warn', `PHNIX inverter ${n} protection word ${hex(w & 0xffff)}`, 'Register 2100; the bit meanings are not documented']);
    }
    if (D.raw.OVERRIDE_FLAGS) {
      for (const f of decode(D.raw.OVERRIDE_FLAGS, OVERRIDES, 'Override')) a.push(['warn', `Override: ${f.label}`, f.desc, f.alias]);
    }
    const html = a.map(([c, t, d, alias]) => `<div class="${c}"${alias ? ` title="${alias}"` : ''}>${t}${d ? `<small>${d}</small>` : ''}</div>`).join('');
    if (html !== this._alarmHtml) $('#alarms').innerHTML = this._alarmHtml = html;
    this.startup();
  }

  // Startup permissives: only meaningful while the compressor is off
  startup() {
    const D = this.D;
    const el = $('#startup');
    if (!el) return; // stale cached index.html
    const show = D.raw.HPCO01_ON === false && D.raw.STARTUP_FLAGS !== undefined && D.status !== 'error';
    el.hidden = !show;
    if (!show) return;
    if (!this._startupInit) {
      this._startupInit = true;
      if (innerWidth <= 820) el.open = false;
      el.addEventListener('toggle', () => { if (el.open) el.scrollIntoView({ block: 'nearest' }); });
    }
    const rows = startupState(D.raw.STARTUP_FLAGS);
    const used = rows.filter((r) => !r.unused);
    const met = used.filter((r) => r.met).length;
    const ok = met === used.length;
    const sum = el.querySelector('summary');
    sum.className = ok ? 'ok' : 'wait';
    sum.innerHTML = `Startup conditions <b>${met}/${used.length}</b><span>${ok ? 'ready to start' : 'heat pump off'}</span>`;
    const list = rows.map((r) => `<li class="${r.unused ? 'unused' : r.met ? 'met' : 'unmet'}" title="${r.alias} (bit ${r.bit})${r.note ? ` · ${r.note}` : ''}">`
      + `<i>${r.unused ? '–' : r.met ? '✓' : '✗'}</i>${r.label}</li>`).join('');
    const html = list + `<li class="raw">STARTUP_FLAGS ${hex(D.raw.STARTUP_FLAGS)} · ✓ met · ✗ not met · – not used</li>`;
    const ul = el.querySelector('ul');
    if (html !== this._startupHtml) ul.innerHTML = this._startupHtml = html;
  }
}
