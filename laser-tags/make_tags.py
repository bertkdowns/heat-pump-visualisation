#!/usr/bin/env python3
"""Generate laser-cut equipment and sensor tags as DXF files.

    python3 laser-tags/make_tags.py

Writes, next to this script:
  equipment_tags.dxf  60 x 30 mm tags for each piece of equipment
  sensor_tags.dxf     30 x 10 mm tags for each sensor, plus a cable tag for
                      every piece of equipment that has a cable (pumps,
                      valves, compressor ...)
  preview.png         picture of both sheets for checking

DXF details (AutoCAD R12, units mm):
  layer CUT     (red)   tag outlines and cable-tie slots - cut through
  layer ENGRAVE (black) lettering as closed outlines - fill/raster engrave
Text is converted to outlines, so no fonts are needed on the laser PC.
No kerf compensation is applied.

Tag lists come from P&ID V24 (drawing + legend tables) and the PLC tags in
js/tags.js.
Edit EQUIPMENT / SENSORS below and re-run to change them.
"""
import math
import os

from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath

HERE = os.path.dirname(os.path.abspath(__file__))

# (tag id, name, has a cable). id None -> name-only tag, no cable tag.
# Items with a cable also get a small 30 x 10 mm tag for that cable.
EQUIPMENT = [
    # ---- heat pump (n-butane)
    ('HP-CO01', 'COMPRESSOR', True),
    ('HP-VS01', 'COMPRESSOR VSD', True),
    ('HP-OHE01', 'OIL HEATER', True),
    ('HP-SA01', 'SUCTION ACCUMULATOR', False),
    ('HP-OS01', 'OIL SEPARATOR', False),
    ('HP-CD01', 'CONDENSER', False),
    ('HP-LR01', 'LIQUID RECEIVER', False),
    ('HP-SC01', 'SUBCOOLER', False),
    ('HP-FD01', 'FILTER DRYER', False),
    ('HP-LLSV01', 'LIQUID LINE SOLENOID', True),
    ('HP-EEV01', 'EXPANSION VALVE', True),
    ('HP-EVP01', 'EVAPORATOR + IHX', False),
    ('HP-IV01', 'ISOLATION VALVE', False),
    ('HP-MV02', 'MANUAL VALVE', False),
    ('HP-MV03', 'MANUAL VALVE', False),
    ('HP-NV01', 'OIL RETURN NEEDLE VALVE', False),
    ('HP-DV01', 'OIL DRAIN VALVE', False),
    ('HP-RV01', 'RELIEF VALVE', False),
    ('HP-RV02', 'RELIEF VALVE', False),
    ('HP-PG01', 'PRESSURE GAUGE', False),
    ('HP-PG02', 'PRESSURE GAUGE', False),
    ('HP-SG01', 'SIGHT GLASS', False),
    ('HP-SG02', 'SIGHT GLASS', False),
    ('HP-SG03', 'SIGHT GLASS', False),
    ('HP-SG04', 'SIGHT GLASS', False),
    ('HP-SG05', 'SIGHT GLASS', False),
    # ---- source loop
    ('SO-PU31', 'SOURCE PUMP', True),
    ('SO-VS31', 'SOURCE PUMP VSD', True),
    ('SO-ST01', 'HOLD-UP TANK', False),
    ('SO-ET31', 'EXPANSION TANK', False),
    ('EX-SP01', 'PROPANE HX', False),
    (None, 'PROPANE HEAT PUMP', False),
    ('WW-HX02', 'LAB COOLER 2', False),
    ('SO-BV31', 'BALL VALVE', False),
    ('SO-BV32', 'BALL VALVE', False),
    ('SO-BV33', 'BALL VALVE', False),
    ('SO-BV34', 'BALL VALVE', False),
    ('SO-BV35', 'BALL VALVE', False),
    ('SO-BV36', 'BALL VALVE', False),
    ('SO-BV37', 'BALL VALVE', False),
    ('SO-BV38', 'BALL VALVE', False),
    ('SO-BV39', 'BALL VALVE', False),
    ('SO-BV50', 'BALL VALVE', False),
    ('SO-MV31', 'BALANCING VALVE', False),
    ('SO-CV31', 'CHECK VALVE', False),
    ('SO-WS01', 'STRAINER', False),
    ('SO-RV31', 'RELIEF VALVE', False),
    ('SO-AV31', 'AIR VENT', False),
    ('SO-DV01', 'DRAIN VALVE', False),
    # ---- warm water + cooling water + fresh water
    ('WW-PU41', 'WARM WATER PUMP', True),
    ('WW-VS41', 'WARM WATER PUMP VSD', True),
    ('WW-HX01', 'LAB COOLER 1', False),
    ('WW-ET41', 'EXPANSION TANK', False),
    ('WW-GV41', 'MIXING VALVE', True),
    ('WW-GV42', 'MAKE-UP VALVE', True),
    ('WW-BV41', 'BALL VALVE', False),
    ('WW-BV42', 'BALL VALVE', False),
    ('WW-MV41', 'BALANCING VALVE', False),
    ('WW-MV42', 'BALANCING VALVE', False),
    ('WW-MV43', 'BALANCING VALVE', False),
    ('WW-CV41', 'CHECK VALVE', False),
    ('WW-CV42', 'CHECK VALVE', False),
    ('WW-WS01', 'STRAINER', False),
    ('WW-RV41', 'RELIEF VALVE', False),
    ('WW-AV41', 'AIR VENT', False),
    ('WW-PG01', 'PRESSURE GAUGE', False),
    ('CW-GV21', 'COOLING WATER VALVE', True),
    (None, 'DRY COOLER', False),
    ('FW-BV71', 'BALL VALVE', False),
    ('FW-CV71', 'CHECK VALVE', False),
    ('FW-LV71', 'PRESSURE REDUCING VALVE', False),
    ('FW-PG01', 'PRESSURE GAUGE', False),
    # ---- hot water + steam
    ('HW-PU51', 'HOT WATER PUMP', True),
    ('HW-VS51', 'HOT WATER PUMP VSD', True),
    ('HW-FTK01', 'FLASH TANK', False),
    ('HW-BV51', 'BALL VALVE', False),
    ('HW-BV52', 'BALL VALVE', False),
    ('HW-BV53', 'BALL VALVE', False),
    ('HW-MV51', 'BALANCING VALVE', False),
    ('HW-CV51', 'CHECK VALVE', False),
    ('HW-WS01', 'STRAINER', False),
    ('HW-RV01', 'RELIEF VALVE', False),
    ('HW-PG01', 'PRESSURE GAUGE', False),
    ('HW-PG02', 'PRESSURE GAUGE', False),
    ('ST-GV61', 'STEAM VALVE', True),
    ('ST-BV61', 'BALL VALVE', False),
    ('ST-TG01', 'TEMPERATURE GAUGE', False),
]

SENSORS = [
    # source loop
    'SO-TT31', 'SO-TT32', 'SO-TT33', 'SO-TC31', 'SO-PT31', 'SO-VF31', 'SO-LT31', 'PH-TC32',
    # heat pump
    'HP-TT01', 'HP-TT02', 'HP-TT03', 'HP-TT04', 'HP-TT05', 'HP-TT06', 'HP-TT07',
    'HP-TC02', 'HP-TC03', 'HP-PT01', 'HP-PT02', 'HP-PT03', 'HP-PT06', 'HP-MF01', 'HP-GD01',
    # heat pump safety switches / compressor protection
    'HP-PS01', 'HP-HPS01', 'HP-HPS02', 'HP-LPS01', 'HP-TE01', 'HP-OLM01',
    # warm water + cooling water
    'WW-TT41', 'WW-TT42', 'WW-TT43', 'WW-TC41', 'WW-PT41', 'WW-VF41',
    'CW-TC21', 'CW-TC22', 'CW-TC23',
    # hot water + steam
    'HW-TT51', 'HW-TT52', 'HW-TC51', 'HW-PT51', 'HW-VF51', 'HW-LT51',
    'ST-PT61', 'ST-TT61', 'ST-VF61',
]

# ---------------------------------------------------------------- geometry
EQ = dict(w=60, h=30, r=2.0, slot_w=2.0, slot_l=10.0, slot_x=3.5)
SE = dict(w=30, h=10, r=1.0, slot_w=1.6, slot_l=6.0, slot_x=2.4)
GAP = 2.0          # spacing between tags on the sheet
EQ_COLS = 8        # 8 x 62 = 494 mm wide sheet
SE_COLS = 8        # 8 x 32 = 254 mm wide sheet

FONT = FontProperties(family='DejaVu Sans', weight='bold')


def arc(cx, cy, r, a0, a1, n=8):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n))
            for i in range(n + 1)]


def rounded_rect(x, y, w, h, r):
    p = []
    p += arc(x + w - r, y + r, r, -math.pi / 2, 0)
    p += arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    p += arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    p += arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    return p


def slot(cx, cy, w, l):
    """Vertical stadium-shaped slot, w wide, l long (overall)."""
    r = w / 2
    return arc(cx, cy + l / 2 - r, r, 0, math.pi) + arc(cx, cy - l / 2 + r, r, math.pi, 2 * math.pi)


_CAP = None


def width(s, cap):
    """Width in mm of s at cap height `cap`, unshrunk."""
    pts = text(s, 0, 0, cap, 1e9)
    xs = [x for p in pts for x, _ in p]
    return max(xs) - min(xs)


def text(s, cx, cy, cap, max_w):
    """Closed outlines of s, centred on (cx, cy), cap height `cap` mm,
    shrunk to fit max_w if needed."""
    global _CAP
    big = 100.0  # build large so curve flattening is fine, then scale down
    if _CAP is None:
        _CAP = TextPath((0, 0), 'H', size=big, prop=FONT).get_extents().height
    tp = TextPath((0, 0), s, size=big, prop=FONT)
    ext = tp.get_extents()
    k = cap / _CAP
    if ext.width * k > max_w:
        k = max_w / ext.width
    ox = cx - (ext.x0 + ext.width / 2) * k
    oy = cy - _CAP * k / 2
    return [[(ox + x * k, oy + y * k) for x, y in poly] for poly in tp.to_polygons(closed_only=True)]


def equipment_tag(x, y, tid, name):
    g = EQ
    cut = [rounded_rect(x, y, g['w'], g['h'], g['r']),
           slot(x + g['slot_x'], y + g['h'] / 2, g['slot_w'], g['slot_l']),
           slot(x + g['w'] - g['slot_x'], y + g['h'] / 2, g['slot_w'], g['slot_l'])]
    cx = x + g['w'] / 2
    tw = g['w'] - 2 * (g['slot_x'] + g['slot_w'] / 2 + 3.0)   # clear of slots
    eng = []
    if tid:
        eng += text(tid, cx, y + 19.5, 6.5, tw)
        # one line, shrunk to fit, unless that would go below ~2.6 mm cap height
        if width(name, 2.6) <= tw or ' ' not in name:
            eng += text(name, cx, y + 8.0, 3.2, tw)
        else:  # wrap long names onto two lines, split nearest the middle
            words = name.split()
            cuts = range(1, len(words))
            k = min(cuts, key=lambda i: abs(len(' '.join(words[:i])) - len(' '.join(words[i:]))))
            eng += text(' '.join(words[:k]), cx, y + 10.2, 2.8, tw)
            eng += text(' '.join(words[k:]), cx, y + 5.4, 2.8, tw)
    else:
        eng += text(name, cx, y + g['h'] / 2, 4.5, tw)
    return cut, eng


def sensor_tag(x, y, tid):
    g = SE
    cut = [rounded_rect(x, y, g['w'], g['h'], g['r']),
           slot(x + g['slot_x'], y + g['h'] / 2, g['slot_w'], g['slot_l']),
           slot(x + g['w'] - g['slot_x'], y + g['h'] / 2, g['slot_w'], g['slot_l'])]
    tw = g['w'] - 2 * (g['slot_x'] + g['slot_w'] / 2 + 1.6)
    return cut, text(tid, x + g['w'] / 2, y + g['h'] / 2, 4.5, tw)


def sheet(items, make, w, h, cols):
    """Lay tags out in a grid, top row first. Returns (cut, engrave) polylines."""
    rows = math.ceil(len(items) / cols)
    cut, eng = [], []
    for i, it in enumerate(items):
        r, c = divmod(i, cols)
        x = c * (w + GAP)
        y = (rows - 1 - r) * (h + GAP)
        a, b = make(x, y, *it)
        cut += a
        eng += b
    return cut, eng


# ------------------------------------------------------------- DXF writer
def write_dxf(path, layers):
    """layers: {name: (aci colour, [closed polylines])}. AutoCAD R12 ASCII."""
    out = []
    t = lambda code, val: out.extend((str(code), str(val)))
    t(0, 'SECTION'); t(2, 'HEADER')
    t(9, '$ACADVER'); t(1, 'AC1009')
    t(9, '$INSUNITS'); t(70, 4)   # mm
    t(9, '$MEASUREMENT'); t(70, 1)
    t(0, 'ENDSEC')
    t(0, 'SECTION'); t(2, 'TABLES')
    t(0, 'TABLE'); t(2, 'LTYPE'); t(70, 1)
    t(0, 'LTYPE'); t(2, 'CONTINUOUS'); t(70, 0); t(3, 'Solid line'); t(72, 65); t(73, 0); t(40, 0.0)
    t(0, 'ENDTAB')
    t(0, 'TABLE'); t(2, 'LAYER'); t(70, len(layers))
    for name, (col, _) in layers.items():
        t(0, 'LAYER'); t(2, name); t(70, 0); t(62, col); t(6, 'CONTINUOUS')
    t(0, 'ENDTAB')
    t(0, 'ENDSEC')
    t(0, 'SECTION'); t(2, 'ENTITIES')
    for name, (_, polys) in layers.items():
        for p in polys:
            if len(p) > 1 and math.dist(p[0], p[-1]) < 1e-6:
                p = p[:-1]
            t(0, 'POLYLINE'); t(8, name); t(66, 1); t(10, 0.0); t(20, 0.0); t(30, 0.0); t(70, 1)
            for x, y in p:
                t(0, 'VERTEX'); t(8, name); t(10, f'{x:.4f}'); t(20, f'{y:.4f}'); t(30, 0.0)
            t(0, 'SEQEND'); t(8, name)
    t(0, 'ENDSEC')
    t(0, 'EOF')
    with open(path, 'w', newline='\r\n') as f:
        f.write('\n'.join(out) + '\n')


def preview(path, sheets):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.path import Path
    from matplotlib.patches import PathPatch

    fig, axes = plt.subplots(len(sheets), 1, figsize=(14, 16),
                             gridspec_kw={'height_ratios': [s[3] for s in sheets]})
    for ax, (title, cut, eng, _) in zip(axes, sheets):
        if eng:
            verts, codes = [], []
            for p in eng:
                verts += p + [p[0]]
                codes += [Path.MOVETO] + [Path.LINETO] * (len(p) - 1) + [Path.CLOSEPOLY]
            ax.add_patch(PathPatch(Path(verts, codes), fc='black', ec='none'))
        for p in cut:
            xs, ys = zip(*(p + [p[0]]))
            ax.plot(xs, ys, color='red', lw=0.6)
        ax.set_aspect('equal')
        ax.autoscale()
        ax.set_title(title, loc='left')
        ax.tick_params(labelsize=7)
    fig.tight_layout()
    fig.savefig(path, dpi=200)


def main():
    eq_items = [(tid, name) for tid, name, _ in EQUIPMENT]
    se_items = [(s,) for s in SENSORS] + [(tid,) for tid, _, cable in EQUIPMENT if cable and tid]

    eq_cut, eq_eng = sheet(eq_items, equipment_tag, EQ['w'], EQ['h'], EQ_COLS)
    se_cut, se_eng = sheet(se_items, sensor_tag, SE['w'], SE['h'], SE_COLS)

    write_dxf(os.path.join(HERE, 'equipment_tags.dxf'), {'CUT': (1, eq_cut), 'ENGRAVE': (7, eq_eng)})
    write_dxf(os.path.join(HERE, 'sensor_tags.dxf'), {'CUT': (1, se_cut), 'ENGRAVE': (7, se_eng)})

    eq_rows = math.ceil(len(eq_items) / EQ_COLS)
    se_rows = math.ceil(len(se_items) / SE_COLS)
    preview(os.path.join(HERE, 'preview.png'), [
        (f'equipment_tags.dxf - {len(eq_items)} tags, 60 x 30 mm', eq_cut, eq_eng, eq_rows * (EQ['h'] + GAP)),
        (f'sensor_tags.dxf - {len(SENSORS)} sensor + {len(se_items) - len(SENSORS)} equipment-cable tags, 30 x 10 mm',
         se_cut, se_eng, se_rows * (SE['h'] + GAP)),
    ])
    print(f'equipment: {len(eq_items)} tags, sheet {EQ_COLS * (EQ["w"] + GAP) - GAP} x {eq_rows * (EQ["h"] + GAP) - GAP} mm')
    print(f'sensor:    {len(se_items)} tags, sheet {SE_COLS * (SE["w"] + GAP) - GAP} x {se_rows * (SE["h"] + GAP) - GAP} mm')


if __name__ == '__main__':
    main()
