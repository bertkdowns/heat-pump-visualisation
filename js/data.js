// InfluxDB 2.x access straight from the browser (the server allows CORS).
import { TAGS, derived } from './tags.js';

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
    const flux = `from(bucket: "${this.cfg.bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._field == "value" and r.topic =~ /^(PLC|PLC_BOOL)\\//)
  |> last()
  |> keep(columns: ["_time", "_value", "topic"])`;
    try {
      const rows = await this.query(flux);
      for (const r of rows) {
        if (!r.topic) continue;
        const tag = r.topic.split('/')[1];
        const v = r._value;
        this.raw[tag] = v === 'true' ? true : v === 'false' ? false : Number(v);
        const t = parseTime(r._time);
        this.time[tag] = t;
        if (r.topic.startsWith('PLC/') && t > this.latest) this.latest = t;
      }
      this.status = Date.now() - this.latest > this.cfg.staleSec * 1000 ? 'stale' : 'live';
      this.error = '';
    } catch (e) {
      this.status = 'error';
      this.error = e.message;
    }
    this.X = derived(this.V);
    this.emit();
  }

  async pollTrends(tags) {
    const re = tags.join('|');
    const every = Math.max(10, Math.round(this.cfg.trendMinutes * 60 / 120));
    const flux = `from(bucket: "${this.cfg.bucket}")
  |> range(start: -${this.cfg.trendMinutes}m)
  |> filter(fn: (r) => r._field == "value" and r._measurement == "mqtt_consumer" and r.topic =~ /^PLC\\/(${re})$/)
  |> toFloat()
  |> aggregateWindow(every: ${every}s, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "topic"])`;
    try {
      const rows = await this.query(flux);
      const tr = {};
      for (const r of rows) {
        if (!r.topic) continue;
        const tag = r.topic.split('/')[1];
        (tr[tag] ||= []).push([parseTime(r._time), Number(r._value)]);
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
    return this.latest - t > this.cfg.staleSec * 1000 || Date.now() - t > 6 * 3600 * 1000;
  }
}
