// InfluxDB 2.x access straight from the browser (the server allows CORS).
import { TAGS, MODBUS, MODBUS_TAG, modbusFilter, derived } from './tags.js';

// raw Modbus registers are unsigned 16-bit; the PHNIX values are signed
const s16 = (v) => (v >= 32768 && v < 65536 ? v - 65536 : v);

function splitCSV(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Flux CSV may contain several tables, each with its own header row
function parseCSV(text) {
  const rows = [];
  let header = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { header = null; continue; }
    const cells = splitCSV(line);
    if (!header || (cells[1] === 'result' && cells[2] === 'table')) { header = cells; continue; }
    const o = {};
    header.forEach((h, i) => { o[h] = cells[i]; });
    rows.push(o);
  }
  return rows;
}

const parseTime = (s) => Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
const iso = (ms) => new Date(ms).toISOString();

export class DataStore {
  constructor(cfg) {
    this.cfg = cfg;
    this.raw = {};
    this.time = {};
    this.trend = {};
    this.latest = 0;
    this.status = 'connecting';
    this.error = '';
    this.listeners = [];
    this.X = {};
    this.V = this.V.bind(this);
    // Historical replay: { base, wall, speed, paused }. Data time = base + (wall clock since `wall`) × speed.
    this.replay = null;
    this.gen = 0;              // bumped on every mode change so late answers from the old mode are dropped
    this.replayListeners = [];
  }

  // ------------------------------------------------------------ replay clock
  /** Current data time: wall clock when live, the replay position when replaying. */
  now() {
    const r = this.replay;
    if (!r) return Date.now();
    return r.paused ? r.base : r.base + (Date.now() - r.wall) * r.speed;
  }
  onReplay(fn) { this.replayListeners.push(fn); }
  setReplay(startMs, speed = 1) {
    this.replay = Number.isFinite(startMs) && startMs < Date.now() - 60000
      ? { base: startMs, wall: Date.now(), speed, paused: false } : null;
    this.gen++;
    this.raw = {}; this.time = {}; this.trend = {}; this.latest = 0; this.X = {};
    this.status = 'connecting';
    this.replayListeners.forEach((fn) => fn(this.replay));
  }
  setSpeed(speed) {
    const r = this.replay;
    if (!r) return;
    r.base = this.now(); r.wall = Date.now(); r.speed = speed;
    this.replayListeners.forEach((fn) => fn(r));
  }
  setPaused(on) {
    const r = this.replay;
    if (!r) return;
    r.base = this.now(); r.wall = Date.now(); r.paused = on;
    this.replayListeners.forEach((fn) => fn(r));
  }
  /** Flux range() arguments: the last `sec` seconds before the current data time. */
  range(sec) {
    if (!this.replay) return `start: -${sec}s`;
    const t = this.now();
    return `start: ${iso(t - sec * 1000)}, stop: ${iso(t + 1)}`;
  }

  on(fn) { this.listeners.push(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  async query(flux) {
    const { url, org, token } = this.cfg;
    const r = await fetch(`${url}/api/v2/query?org=${encodeURIComponent(org)}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/vnd.flux',
        Accept: 'application/csv',
      },
      body: flux,
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = text;
      try { msg = JSON.parse(text).message; } catch { /* keep text */ }
      throw new Error(`InfluxDB ${r.status}: ${msg}`);
    }
    return parseCSV(text);
  }

  async poll() {
    // a replay that catches up with the present becomes live
    if (this.replay && this.now() > Date.now() - 5000) this.setReplay(null);
    const gen = this.gen;
    const plc = `from(bucket: "${this.cfg.bucket}")
  |> range(${this.range(7 * 86400)})
  |> filter(fn: (r) => r._field == "value" and r.topic =~ /^(PLC|PLC_BOOL)\\//)
  |> last()
  |> keep(columns: ["_time", "_value", "topic"])`;
    const mb = `from(bucket: "${this.cfg.bucket}")
  |> range(${this.range(86400)})
  |> filter(fn: (r) => r._measurement == "mqtt_consumer" and (${modbusFilter(Object.keys(MODBUS))}))
  |> last()
  |> keep(columns: ["_time", "_value", "topic", "_field"])`;
    // the PHNIX registers are optional: a failure there must not take the PLC view down
    const [res, mbRes] = await Promise.allSettled([this.query(plc), this.query(mb)]);
    if (gen !== this.gen) return; // mode changed while waiting
    if (res.status === 'fulfilled') {
      for (const r of res.value) {
        if (!r.topic) continue;
        const tag = r.topic.split('/')[1];
        const v = r._value;
        this.raw[tag] = v === 'true' ? true : v === 'false' ? false : Number(v);
        const t = parseTime(r._time);
        this.time[tag] = t;
        if (r.topic.startsWith('PLC/') && t > this.latest) this.latest = t;
      }
      this.status = this.now() - this.latest > this.cfg.staleSec * 1000 * (this.replay ? Math.max(1, this.replay.speed) : 1)
        ? 'stale' : 'live';
      this.error = '';
    } else {
      this.status = 'error';
      this.error = res.reason.message;
    }
    if (mbRes.status === 'fulfilled') {
      for (const r of mbRes.value) {
        const tag = r.topic && MODBUS_TAG[`${r.topic.split('/')[2]}/${r._field}`];
        if (!tag) continue;
        this.raw[tag] = s16(Number(r._value));
        this.time[tag] = parseTime(r._time);
      }
    } else console.warn('PHNIX query failed', mbRes.reason);
    this.X = derived(this.V);
    this.emit();
  }

  async pollTrends(tags) {
    const gen = this.gen;
    const every = Math.max(10, Math.round(this.cfg.trendMinutes * 60 / 120));
    const plcTags = tags.filter((t) => !MODBUS[t]), mbTags = tags.filter((t) => MODBUS[t]);
    const q = [];
    if (plcTags.length) q.push(`from(bucket: "${this.cfg.bucket}")
  |> range(${this.range(this.cfg.trendMinutes * 60)})
  |> filter(fn: (r) => r._field == "value" and r._measurement == "mqtt_consumer" and r.topic =~ /^PLC\\/(${plcTags.join('|')})$/)
  |> toFloat()
  |> aggregateWindow(every: ${every}s, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "topic"])`);
    if (mbTags.length) q.push(`from(bucket: "${this.cfg.bucket}")
  |> range(${this.range(this.cfg.trendMinutes * 60)})
  |> filter(fn: (r) => r._measurement == "mqtt_consumer" and (${modbusFilter(mbTags)}))
  |> toFloat()
  |> filter(fn: (r) => r._value != 32767.0)
  |> map(fn: (r) => ({ r with _value: if r._value >= 32768.0 then r._value - 65536.0 else r._value }))
  |> aggregateWindow(every: ${every}s, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "topic", "_field"])`);
    try {
      const results = await Promise.all(q.map((f) => this.query(f)));
      if (gen !== this.gen) return;
      const tr = {};
      for (const rows of results) {
        for (const r of rows) {
          if (!r.topic) continue;
          const tag = r.topic.startsWith('PLC/') ? r.topic.split('/')[1] : MODBUS_TAG[`${r.topic.split('/')[2]}/${r._field}`];
          if (tag) (tr[tag] ||= []).push([parseTime(r._time), Number(r._value)]);
        }
      }
      this.trend = tr;
    } catch (e) {
      console.warn('trend query failed', e);
    }
  }

  // Scaled engineering value, NaN when missing / sensor fault (-32768)
  V(tag) {
    const r = this.raw[tag];
    if (typeof r !== 'number' || !Number.isFinite(r) || r <= -32768 || r >= 32767) return NaN;
    const m = TAGS[tag];
    return m ? r * m.scale : r;
  }
  B(tag) { return this.raw[tag] === true; }
  stale(tag) {
    const t = this.time[tag];
    if (!t) return true;
    return this.latest - t > this.cfg.staleSec * 1000 || this.now() - t > 6 * 3600 * 1000;
  }
}
