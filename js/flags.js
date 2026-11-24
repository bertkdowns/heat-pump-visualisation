// Bit decodings for the PLC status words (from the PLC global variable tables).
// Each entry: [PLC alias, short label, description]. Index = bit number.

export const TRIPS = [ // HPCO01_TRIP_FLAGS: a set bit means that trip is active
  ['TRIP_LOW_SUPERHEAT', 'Low superheat', 'Superheat below 1.5 K for 10 s'],
  ['TRIP_HIGH_SUCTION_PRESSURE', 'High suction pressure', 'Suction pressure above 6 bar'],
  ['TRIP_LOW_SUCTION_PRESSURE', 'Low suction pressure', 'Suction pressure below 0.15 bar'],
  ['TRIP_HIGH_DISCHARGE_PRESSURE', 'High discharge pressure', 'Discharge pressure above 2740 kPa'],
  null,
  ['TRIP_HIGH_STEAM_PRESSURE', 'High steam pressure', 'Steam pressure at 1.6 bar g for 5 s (relief valve should lift at 1.5 bar g)'],
  ['TRIP_HIGH_STEAM_TEMPERATURE', 'High steam temperature', 'Steam temperature reached 130 °C (about 1.6 bar g)'],
  ['TRIP_HIGH_WW_TEMPERATURE', 'High warm water temperature', 'Warm water temperature reached 98 °C'],
  ['TRIP_HIGH_CW_TEMPERATURE_IN', 'High cooling water inlet temperature', 'Cooling water getting too hot: more heat is being made than can be rejected'],
  ['TRIP_HIGH_CW_TEMPERATURE_OUT', 'High cooling water outlet temperature', 'Cooling water reached 50 °C (protects the PVC pipes)'],
  ['TRIP_LOW_HW_LEVEL', 'Low flash tank level', 'HW-LT51 below 5 % for 20 s'],
  ['TRIP_HIGH_HW_LEVEL', 'High flash tank level', 'HW-LT51 above 95 % for 20 s'],
  ['TRIP_COMPRESSOR_FAULT', 'Compressor fault', 'Compressor controller CM-RC-02 has a fault'],
  ['TRIP_LOW_OIL_LEVEL', 'Low oil level', 'Compressor oil level too low'],
];

export const OVERRIDES = [ // OVERRIDE_FLAGS: a set bit means the PLC has taken over that action
  ['OVERRIDE_WARM_WATER_HOT', 'Warm water hot', 'Warm water too hot, cooling it'],
  ['OVERRIDE_COOLING_WATER_HOT', 'Cooling water hot', 'Cooling water too hot, cooling it down'],
  ['OVERRIDE_HIGH_FLASH_LEVEL', 'High flash tank level', 'Flash tank above 90 %, WW-GV42 closed'],
  ['OVERRIDE_LOW_FLASH_LEVEL', 'Low flash tank level', 'Flash tank below 10 %, WW-GV42 opened'],
  ['OVERRIDE_LOW_WW_PUMP_SPEED', 'Low warm water pump speed', ''],
  ['OVERRIDE_LOW_SUPERHEAT', 'Low superheat', 'Superheat below 3 K for 5 s, shutdown routine started'],
  ['OVERRIDE_LOW_HW_PRESSURE', 'Low hot water pressure', 'Hot water pressure below 2 bar; pressure held to stop the water boiling'],
];

export const STARTUP = [ // STARTUP_FLAGS: a bit is LOW when that condition is met
  ['STARTUP_WW_PUMP_ON', 'Warm water pump on'],
  ['STARTUP_SO_PUMP_ON', 'Source pump on'],
  ['STARTUP_HW_PUMP_ON', 'Hot water pump on'],
  ['STARTUP_CW_VALVE_OPEN', 'Cooling water valve open'],
  ['STARTUP_WW_FLOW_READY', 'Warm water flow ready'],
  ['STARTUP_SO_FLOW_READY', 'Source flow ready'],
  ['STARTUP_HW_FLOW_READY', 'Hot water flow ready'],
  ['STARTUP_HW_LEVEL_UP', 'Flash tank level up'],
  ['STARTUP_SO_HEAT_SUFFICIENT', 'Source heat sufficient'],
  ['STARTUP_WW_PRESSURE_SUFFICIENT', 'Warm water pressure sufficient'],
  ['STARTUP_SO_HP_SUFFICIENT', 'Source heat pump sufficient', 'not used'],
  ['STARTUP_SO_HP_ON', 'Source heat pump on', 'not used'],
  ['STARTUP_WW_VALVE_OPEN', 'Warm water valve open'],
  ['STARTUP_GD_STABLE', 'Gas detector stable'],
  ['STARTUP_OIL_SUFFICIENT', 'Oil level OK', 'no oil level alarm'],
  ['STARTUP_EV_5_PERCENT', 'EEV at 5 %'],
];

/** Set bit numbers in a 16-bit word. */
export function setBits(word) {
  const out = [];
  const w = Number(word) & 0xffff;
  for (let i = 0; i < 16; i++) if (w & (1 << i)) out.push(i);
  return out;
}

/** Decode active bits against a table; undocumented bits are still reported. */
export function decode(word, table, kind) {
  return setBits(word).map((i) => {
    const e = table[i];
    return e ? { bit: i, alias: e[0], label: e[1], desc: e[2] || '' }
      : { bit: i, alias: `bit ${i}`, label: `${kind} bit ${i}`, desc: 'Not in the PLC table' };
  });
}

/** Startup conditions: one row per documented bit; met when the bit is low. */
export function startupState(word) {
  const w = Number(word) & 0xffff;
  return STARTUP.map(([alias, label, note], bit) => ({
    bit, alias, label, note: note || '', unused: note === 'not used', met: !(w & (1 << bit)),
  }));
}
