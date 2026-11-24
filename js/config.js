// Connection + behaviour settings. Every value can be overridden with a URL
// query parameter, e.g. index.html?present&cycle=45&token=...
const p = new URLSearchParams(location.search);

// The InfluxDB token is never stored in the repo. It comes from ?token=...
// (then saved in this browser and removed from the address bar) or from the
// connect dialog. Use a read-only token.
const TOKEN_KEY = 'sghp.influxToken';
const store = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set(v) { try { localStorage.setItem(TOKEN_KEY, v); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};
const urlToken = p.get('token');
if (urlToken) {
  store.set(urlToken);
  p.delete('token');
  const q = p.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
}

export const tokenStore = store;

export const CONFIG = {
  url: p.get('url') || 'https://heat-pump.ahuoratech.app',
  org: p.get('org') || 'lab',
  bucket: p.get('bucket') || 'data',
  token: urlToken || store.get(),
  pollMs: Number(p.get('poll') || 2000),     // live value refresh
  trendMs: 30000,                             // sparkline refresh
  trendMinutes: Number(p.get('trend') || 60), // sparkline window
  cycleSec: Number(p.get('cycle') || 60),     // presentation dwell per view
  present: p.has('present'),
  staleSec: 30,
  tMin: 0,     // temperature colour scale (°C)
  tMax: 150,
};
