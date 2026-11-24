# SGHP live plant view

A 3D SCADA-style view of the Ahuora steam generating heat pump, built with three.js.
It reads live PLC tags straight from InfluxDB (`heat-pump.ahuoratech.app`, org `lab`,
bucket `data`) and lays the plant out after P&ID V24.

## Run

The page uses ES modules, so serve it over HTTP rather than opening the file:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. Any static host works (GitHub Pages etc.); the InfluxDB
server allows cross-origin requests.

## Controls

| Key | Action |
| --- | --- |
| 1–5 | Overview, heat pump, source loop, warm water, hot water & steam |
| P / space | Presentation mode (cycles views, camera flies between them) |
| ← / → | Previous / next view |
| L | Labels: all → focused system only → off |
| F | Fullscreen |

Dragging or scrolling the 3D view leaves presentation mode.

## URL parameters

| Param | Default | |
| --- | --- | --- |
| `present` | off | start in presentation mode |
| `cycle` | 60 | seconds per view in presentation mode |
| `poll` | 2000 | live value refresh (ms) |
| `trend` | 60 | sparkline window (minutes) |
| `token` | — | InfluxDB read-only token; saved in this browser, then removed from the address bar |
| `url`, `org`, `bucket` | see `js/config.js` | InfluxDB connection |

Example kiosk URL: `index.html?present&cycle=45&token=YOUR_READ_ONLY_TOKEN`

The token is not stored in this repo. On first visit the page asks for it (🔑 button to change it)
and keeps it in that browser's localStorage.

## What is shown

- **Colour** = temperature (turbo scale, 0–150 °C) on every pipe, exchanger and tank fill.
  Exchangers grade from inlet to outlet colour.
- **Texture** = fluid. Water pipes show chevrons that move in the flow direction.
  n-butane uses a helical stripe with droplets (liquid), bubble rings (vapour) or both
  (two-phase after the EEV). Steam shows white wisps.
- **Motion** scales with the measurements: pipe pattern speed with flow (VF / MF tags),
  pump impellers with VSD %, compressor rotor and vibration with VSD Hz, fan speed with
  CW-GV21, tank levels with LT tags, and the steam plume with ST-GV61 × steam pressure.
- **Labels** give live values for every logged temperature, pressure, flow, level and valve.
  Labels turn grey when a tag is stale and red ("BAD") for sensor faults (−32768).
- **Soft sensors** in the side panel: duties from water-side ΔT × flow, COP, energy-balance
  error, butane saturation temperatures (Antoine), superheat, subcooling, Carnot COP,
  and an estimate of steam production.

## Tag notes / data quirks

- Scaling: TT/TC ×0.1 °C, PT kPa g (shown as bar g), VF ×0.1 L/min, GV/VS ×0.1 %, LT %,
  MF kg/h, HPCO01 frequency/power/voltage ×0.1, current ×0.01.
- **HW-TC51 always equals CW-TC23**, sample for sample, and reads about 27 °C. A channel
  mapping looks wrong. The model treats CW-TC23 as the Lab Cooler 2 cooling-water return.
- **HP-PT06 is pinned at 6.11 bar g** (likely the transmitter's range limit), so suction
  calculations use HP-PT01.
- **WW-GV42 feedback stays 0** while its output moves, and **ST-GV61 / CW-GV21 feedback
  reads above 100 %**, so animation uses the PLC output (`…O`) tags.
- HP-TC02 and WW-TC41 report −32768 (sensor fault).
- The Lab Cooler 2 branch flow is not metered, so its animation only shows that the
  branch exists.

## Files

- `js/config.js` – connection settings and token handling
- `js/data.js` – InfluxDB queries / CSV parsing
- `js/tags.js` – tag metadata, colour map, thermodynamic soft sensors
- `js/plant.js` – 3D layout, equipment, pipe shader, particles
- `js/ui.js` – views, KPI panel, sparklines, alarms
- `js/main.js` – renderer, camera tours, presentation mode
