// PLC tag metadata. Raw values in InfluxDB are scaled integers
// (see thesis "Data Explanation"): TT/TC 0.1 °C, PT kPa g, VF 0.1 L/min,
// GV/VS 0.1 %, LT %, MF kg/h.
import { CONFIG } from './config.js';

const T = (desc) => ({ kind: 'T', unit: '°C', scale: 0.1, dp: 1, desc });
const P = (desc) => ({ kind: 'P', unit: 'bar g', scale: 0.01, dp: 2, desc });
const F = (desc) => ({ kind: 'F', unit: 'L/min', scale: 0.1, dp: 1, desc });
const PCT = (desc, scale = 0.1, dp = 1) => ({ kind: 'V', unit: '%', scale, dp, desc });

export const TAGS = {
  // Source loop (3x)
  SOTT31: T('Source supply to evaporator'),
  SOTT32: T('Source return from evaporator'),
  SOTT33: T('After propane heat pump exchanger'),
  SOTC31: T('Source loop thermocouple'),
  SOPT31: P('Source loop pressure'),
  SOVF31: F('Source loop flow'),
  SOLT31: { kind: 'L', unit: '%', scale: 1, dp: 0, desc: 'Hold-up tank level' },
  SOVS31: PCT('Source pump VSD'),
  SOVS32: PCT('Source VSD 2'),
  PHTC32: T('Propane heat pump thermocouple'),

  // Heat pump, n-butane (HP)
  HPTT01: T('Compressor suction'),
  HPTT02: T('Compressor discharge'),
  HPTT03: T('Condenser outlet'),
  HPTT04: T('Subcooler outlet'),
  HPTT05: T('Before expansion valve'),
  HPTT06: T('After expansion valve'),
  HPTT07: T('Evaporator outlet'),
  HPTC02: T('IHX liquid line'),
  HPTC03: T('Heat pump thermocouple 3'),
  HPPT01: P('Suction pressure'),
  HPPT02: P('Discharge pressure'),
  HPPT03: P('Condenser outlet pressure'),
  HPPT06: P('Evaporator outlet pressure'),
  HPMF01: { kind: 'F', unit: 'kg/h', scale: 1, dp: 0, desc: 'Butane mass flow' },
  HPEV01: PCT('Expansion valve opening'),
  HPEV01_Superheat: { kind: 'T', unit: 'K', scale: 0.1, dp: 1, desc: 'Superheat (PLC)' },
  HPCO01: PCT('Compressor speed command', 1, 0),
  HPCO01_FREQUENCY: { kind: 'S', unit: 'Hz', scale: 0.1, dp: 1, desc: 'Compressor VSD frequency' },
  HPCO01_POWER: { kind: 'S', unit: 'kW', scale: 0.1, dp: 1, desc: 'Compressor power' },
  HPCO01_CURRENT: { kind: 'S', unit: 'A', scale: 0.01, dp: 1, desc: 'Compressor current' },
  HPCO01_VOLTAGE: { kind: 'S', unit: 'V', scale: 0.1, dp: 0, desc: 'VSD output voltage' },
  HPCO01_DISCHARGE_TEMPERATURE: T('Discharge temperature (drive)'),
  HPGD01: { kind: 'S', unit: '', scale: 1, dp: 0, desc: 'Gas detector' },

  // Warm water loop (4x) + cooling water (2x)
  WWTT41: T('Warm water pump inlet'),
  WWTT42: T('Warm water after subcooler'),
  WWTT43: T('Warm water after cooler'),
  WWTC41: T('Warm water before mixing valve'),
  WWPT41: P('Warm water pump discharge'),
  WWVF41: F('Warm water flow'),
  WWGV41: PCT('Mixing valve feedback'),
  WWGV41O: PCT('Mixing valve output'),
  WWGV42: PCT('Make-up valve feedback'),
  WWGV42O: PCT('Make-up valve output'),
  WWVS41: PCT('Warm water pump VSD'),
  CWTC21: T('Cooling water from fans'),
  CWTC22: T('Cooling water to fans'),
  CWTC23: T('Cooling water thermocouple 3'),
  CWGV21: PCT('Cooling water valve feedback'),
  CWGV21O: PCT('Cooling water valve output'),

  // Hot water loop (5x) + steam (6x)
  HWTT51: T('Condenser water inlet'),
  HWTT52: T('Condenser water outlet'),
  HWTC51: T('Flash tank outlet'),
  HWPT51: P('Hot water pump discharge'),
  HWVF51: F('Hot water flow'),
  HWLT51: { kind: 'L', unit: '%', scale: 1, dp: 0, desc: 'Flash tank level' },
  HWVS51: PCT('Hot water pump VSD'),
  STPT61: P('Steam pressure'),
  STTT61: T('Steam temperature'),
  STGV61: PCT('Steam valve feedback'),
  STGV61O: PCT('Steam valve output'),
};

// "HPTT02" -> "HP-TT02"
export function tagLabel(tag) {
  if (tag === 'HPEV01_Superheat') return 'HP-SH';
  const m = tag.match(/^([A-Z]{2})([A-Z]{2}\d{2})(O?)/);
  return m ? `${m[1]}-${m[2]}${m[3]}` : tag;
}

// Turbo colormap (Google, polynomial approximation), returns sRGB 0..1
export function turbo(x) {
  x = Math.min(1, Math.max(0, x));
  const c = (v) => Math.min(1, Math.max(0, v));
  return [
    c(0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))))),
    c(0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))))),
    c(0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))))),
  ];
}

export function tempRGB(t) {
  if (!Number.isFinite(t)) return [0.4, 0.43, 0.48];
  const x = 0.07 + 0.88 * Math.min(1, Math.max(0, (t - CONFIG.tMin) / (CONFIG.tMax - CONFIG.tMin)));
  return turbo(x);
}
export const cssRGB = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
export const cssTemp = (t) => cssRGB(tempRGB(t));

export function fmt(v, dp = 1) {
  return Number.isFinite(v) ? v.toFixed(dp) : '—';
}

// ---------- thermodynamics for soft sensors ----------
const rho = (t) => 1000 - 0.0178 * Math.pow(Math.abs(t - 4), 1.7); // kg/m3, water
const cp = (t) => 4.18 + 1.05e-5 * (t - 35) ** 2;                    // kJ/kgK, water
// kW from volumetric flow (L/min) and temperature change
export function duty(lpm, tIn, tOut) {
  const tm = (tIn + tOut) / 2;
  return (lpm / 60000) * rho(tm) * cp(tm) * (tOut - tIn);
}
// n-butane saturation temperature (°C) from bar abs. NIST Antoine (272–425 K)
export function butaneTsat(barA) {
  if (!(barA > 0)) return NaN;
  return 1175.581 / (4.35576 - Math.log10(barA)) + 2.071 - 273.15;
}
// water saturation temperature (°C) from bar abs. Antoine 100–374 °C
export function waterTsat(barA) {
  if (!(barA > 0)) return NaN;
  return 1810.94 / (8.14019 - Math.log10(barA * 750.062)) - 244.485;
}

export function derived(V) {
  const atm = 1.01325;
  const X = {};
  X.qEvap = duty(V('SOVF31'), V('SOTT32'), V('SOTT31'));      // heat given up by source water
  X.qProp = duty(V('SOVF31'), V('SOTT32'), V('SOTT33'));      // heat added by propane heat pump
  X.qCond = duty(V('HWVF51'), V('HWTT51'), V('HWTT52'));      // heat to hot water loop
  X.qSub = duty(V('WWVF41'), V('WWTT41'), V('WWTT42'));       // heat to warm water loop
  X.w = V('HPCO01_POWER');
  X.qHeat = X.qCond + X.qSub;
  X.cop = X.w > 0.5 ? X.qHeat / X.w : NaN;
  X.balance = X.w > 0.5 ? (X.qHeat - X.qEvap - X.w) / X.qHeat * 100 : NaN;
  X.tSatEvap = butaneTsat(V('HPPT01') + atm);
  X.tSatCond = butaneTsat(V('HPPT03') + atm);
  X.shCalc = V('HPTT01') - X.tSatEvap;
  X.subcool = X.tSatCond - V('HPTT04');
  X.pr = (V('HPPT02') + atm) / (V('HPPT01') + atm);
  X.lift = X.tSatCond - X.tSatEvap;
  X.copCarnot = (X.tSatCond + 273.15) / X.lift;
  X.eta = X.cop / X.copCarnot * 100;
  X.tSatSteam = waterTsat(V('STPT61') + atm);
  // Steam potential: condenser duty / (h_g(steam) - h_f(make-up water))
  const hg = 2676 + 1.5 * (V('STTT61') - 100);
  const hf = 4.19 * V('WWTT42');
  X.steamKgH = V('STPT61') > 0.05 && X.qCond > 0 ? X.qCond / (hg - hf) * 3600 : 0;
  return X;
}
