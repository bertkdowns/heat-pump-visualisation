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
| 1–6 | Overview, heat pump, source loop, warm water, hot water & steam, propane heat pump |
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
  pump impellers with VSD %, compressor vibration with VSD Hz, dry-cooler fans with
  CW-GV21, PHNIX fans with its compressor speed, tank levels with LT tags, and the steam plume with ST-GV61 × steam pressure.
- **Labels** give live values for every logged temperature, pressure, flow, level and valve.
  Labels turn grey when a tag is stale and red ("BAD") for sensor faults (−32768).
- **Soft sensors** in the side panel: duties from water-side ΔT × flow, COP, energy-balance
  error, butane saturation temperatures (Antoine), superheat, subcooling, Carnot COP,
  and an estimate of steam production.

- **Compressor HP-CO01** is drawn as the installed Bitzer 4NESP-20 semi-hermetic
  4-cylinder piston compressor (Bitzer green): motor housing with suction valve, two
  finned cylinder heads in a V with the discharge valve between them, oil sight glass.
  The heads glow with the discharge temperature (HP-TT02).

## PHNIX propane heat pump (SO-HP31)

The PHNIX air-source R290 unit heats the source loop through plate exchanger EX-SP01.
It logs raw Modbus registers (`modbus/device/N/registers`, field = register number), not
PLC tags. `js/tags.js` (`MODBUS`) maps them, following the analysis in `phnix-analysis`:

| Device | Register | Shown as |
| --- | --- | --- |
| 0 (controller) | 2012 | Mode: 1 heating, 250 defrost (candidate), 0 cooling |
| 0 | 2013 | Water set point (×0.1 °C) |
| 0 | 2023 / 2024 | Water inlet / outlet (×0.1 °C) |
| 0 | 2026 / 2027 | Outdoor air / air coil (×0.1 °C) |
| 0 | 2043, 2047 / 2048 | Suction (candidate), discharge 1 / 2 (×0.1 °C) |
| 0 | 2087 / 2088 | Low pressure 1 / 2 (×0.1 bar g) |
| 3 / 4 (inverters) | 2102 / 1999 | Compressor actual / commanded Hz |
| 3 / 4 | 2105, 2106, 2108 | Supply V (line to line), input current (×0.1 A), DC link V |
| 3 / 4 | 2110 | Inverter module temperature (likely) |
| 3 / 4 | 2099 / 2100 | Status word / protection word (not decoded) |

Values are signed 16-bit; 32767 is a sensor fault. The panel shows apparent input power
(√3·V·I, kVA) because no power factor is logged. Defrost (mode 250) and a non-zero
inverter protection word show as amber alarms. View 6 frames the unit.

## Phones

Below 820 px wide the header packs into two rows (the views scroll sideways), the side
panel becomes a bottom sheet showing the view title and a strip of KPIs (tap or swipe it
up for the description, trends and legend), and alarms show one line each (tap for the
description). The 3D scene is centred in the space between the header and the sheet.

## PLC status words

`js/flags.js` decodes the three 16-bit status words from the PLC tables:

- **HPCO01_TRIP_FLAGS** – each set bit is shown as a red "Trip: …" alarm with its description.
- **OVERRIDE_FLAGS** – each set bit is shown as an amber "Override: …" alarm.
- **STARTUP_FLAGS** – a bit is *low* when that start condition is met. The startup
  checklist (top left) only appears while the compressor is off (`HPCO01_ON` false).
  Bits 10–11 (source heat pump) are not used by the PLC and are greyed out.

Undocumented bits still show up as "Trip bit N" / "Override bit N".

## Not drawn

Lab Cooler 2 (WW-HX02) and its branch off the source loop are left out: the branch is
valved shut and the cooler is not part of the heat pump process. The dry-cooler circuit
only serves Lab Cooler 1.

## Tag notes / data quirks

- Scaling: TT/TC ×0.1 °C, PT kPa g (shown as bar g), VF ×0.1 L/min, GV/VS ×0.1 %, LT %,
  MF kg/h, HPCO01 frequency/power/voltage ×0.1, current ×0.01.
- **HW-TC51 always equals CW-TC23**, sample for sample, and reads about 27 °C. A channel
  mapping looks wrong. Neither is drawn.
- **HP-PT06 is pinned at 6.11 bar g** (likely the transmitter's range limit), so suction
  calculations use HP-PT01.
- **WW-GV42 feedback stays 0** while its output moves, and **ST-GV61 / CW-GV21 feedback
  reads above 100 %**, so animation uses the PLC output (`…O`) tags.
- HP-TC02 and WW-TC41 report −32768 (sensor fault). Neither is in use, so neither is drawn.
- HPCO01_DISCHARGE_TEMPERATURE (the drive's discharge sensor) is unplugged for now and
  reads 200 °C, so its label is commented out in `js/plant.js`. Put it back once rewired.

## Files

- `js/config.js` – connection settings and token handling
- `js/data.js` – InfluxDB queries (PLC tags and PHNIX Modbus registers) / CSV parsing
- `js/flags.js` – trip, override and startup bit decodings
- `js/tags.js` – tag metadata, PHNIX register map, colour map, thermodynamic soft sensors
- `js/plant.js` – 3D layout, equipment, pipe shader, particles
- `js/ui.js` – views, KPI panel, sparklines, alarms
- `js/main.js` – renderer, camera tours, presentation mode
