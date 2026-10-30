// DXF output. The files are R12 (AC1009), the version every CAD, CAM and laser/waterjet service
// reads: closed POLYLINEs whose bulges make the corner fillets true arcs, plus the bore: a CIRCLE, or a
// closed POLYLINE with the wire slots that open into it.
import type { BulgePt, Pt } from './geom';
import { flatExtras, type PanelDesign, type SideResult } from './design';

type Code = [number, string | number];

class Dxf {
  private ents: Code[] = [];
  private x0 = Infinity; private y0 = Infinity; private x1 = -Infinity; private y1 = -Infinity;
  constructor(private units: 'in' | 'mm', private layers: [string, number][] = [['0', 7]]) {}

  private grow(x: number, y: number) {
    this.x0 = Math.min(this.x0, x); this.y0 = Math.min(this.y0, y); this.x1 = Math.max(this.x1, x); this.y1 = Math.max(this.y1, y);
  }

  polyline(pts: BulgePt[] | Pt[], layer = '0', closed = true) {
    this.ents.push([0, 'POLYLINE'], [8, layer], [66, 1], [10, 0], [20, 0], [30, 0], [70, closed ? 1 : 0]);
    for (const p of pts) {
      this.grow(p[0], p[1]);
      this.ents.push([0, 'VERTEX'], [8, layer], [10, p[0]], [20, p[1]], [30, 0]);
      if (p.length > 2 && p[2]) this.ents.push([42, p[2]]);
    }
    this.ents.push([0, 'SEQEND'], [8, layer]);
  }

  circle(c: Pt, r: number, layer = '0') {
    this.grow(c[0] - r, c[1] - r); this.grow(c[0] + r, c[1] + r);
    this.ents.push([0, 'CIRCLE'], [8, layer], [10, c[0]], [20, c[1]], [30, 0], [40, r]);
  }

  text(at: Pt, height: number, s: string, layer = '0') {
    this.ents.push([0, 'TEXT'], [8, layer], [10, at[0]], [20, at[1]], [30, 0], [40, height], [1, s.replace(/[^\x20-\x7e]/g, '?')]);
  }

  toString(): string {
    // coordinates, sizes and bulges are reals; flags, colours and counts are integers
    const real = (c: number) => (c >= 10 && c <= 59) || (c >= 110 && c <= 149) || (c >= 210 && c <= 239);
    const num = (c: number, v: number) => (!real(c) ? String(Math.round(v)) : Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v * 1e9) / 1e9));
    const out: Code[] = [
      [0, 'SECTION'], [2, 'HEADER'],
      [9, '$ACADVER'], [1, 'AC1009'],
      [9, '$INSUNITS'], [70, this.units === 'in' ? 1 : 4],
      [9, '$MEASUREMENT'], [70, this.units === 'in' ? 0 : 1],
      [9, '$EXTMIN'], [10, this.x0], [20, this.y0], [30, 0],
      [9, '$EXTMAX'], [10, this.x1], [20, this.y1], [30, 0],
      [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'TABLES'],
      [0, 'TABLE'], [2, 'LTYPE'], [70, 1],
      [0, 'LTYPE'], [2, 'CONTINUOUS'], [70, 0], [3, 'Solid line'], [72, 65], [73, 0], [40, 0],
      [0, 'ENDTAB'],
      [0, 'TABLE'], [2, 'LAYER'], [70, this.layers.length],
      ...this.layers.flatMap(([name, color]): Code[] => [[0, 'LAYER'], [2, name], [70, 0], [62, color], [6, 'CONTINUOUS']]),
      [0, 'ENDTAB'],
      [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'], ...this.ents, [0, 'ENDSEC'],
      [0, 'EOF'],
    ];
    return out.map(([c, v]) => `${String(c).padStart(3)}\n${typeof v === 'number' ? num(c, v) : v}`).join('\n') + '\n';
  }
}

const IN = 1 / 25.4;

/**
 * The cut file: 1:1, inches, one layer ("0"), closed outlines only: straight lines and true circular
 * arcs (polyline bulges) plus the bore (a circle, or one outline with its slots). The part is turned to its smallest bounding
 * box on the sheet and placed 2 mm in from the origin, so every coordinate is positive.
 */
export function cutDxf(s: SideResult): string {
  const th = (s.cutRot * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
  const R = ([x, y, b]: BulgePt): BulgePt => [x * cs - y * sn, x * sn + y * cs, b];
  const outline = s.g.outlineBulge.map(R), holes = s.g.holes.filter((h) => !h.slot).map((h) => h.bulge.map(R));
  const ox = -Math.min(...outline.map((p) => p[0])) + 2, oy = -Math.min(...outline.map((p) => p[1])) + 2;
  const T = ([x, y, b]: BulgePt): BulgePt => [(x + ox) * IN, (y + oy) * IN, b];
  const dxf = new Dxf('in');
  dxf.polyline(outline.map(T));
  for (const h of holes) dxf.polyline(h.map(T));
  if (s.g.holes.some((h) => h.slot)) dxf.polyline(s.g.bore.bulge.map(R).map(T));
  else dxf.circle([ox * IN, oy * IN], s.g.rBore * IN);
  return dxf.toString();
}

/** Both panels side by side in mm, with the LED strips, sensor boards, spokes and labels. For reference, not for cutting. */
export function referenceDxf(d: PanelDesign): string {
  const dxf = new Dxf('mm', [['0', 7], ['OUTLINE', 7], ['LED_STRIP', 30], ['SENSOR_UNDER', 6], ['SPOKES', 8], ['NOTES', 3]]);
  const L = d.sides.LEFT, R = d.sides.RIGHT;
  for (const [dx, label, s] of [[-L.g.rhoEnd - 30, 'LEFT  (seen from the right; reference only, do not cut)', L], [R.g.rhoEnd + 30, 'RIGHT (seen from the right; reference only, do not cut)', R]] as const) {
    const mv = <T extends number[]>(p: T) => [p[0] + dx, ...p.slice(1)] as T;
    dxf.polyline(s.g.outlineBulge.map(mv), 'OUTLINE');
    for (const h of s.g.holes) if (!h.slot) dxf.polyline(h.bulge.map(mv), 'OUTLINE');
    if (s.g.holes.some((h) => h.slot)) dxf.polyline(s.g.bore.bulge.map(mv), 'OUTLINE');
    else dxf.circle([dx, 0], s.g.rBore, 'OUTLINE');
    const { leds, sensors, spokes } = flatExtras(d, s);
    for (const l of leds) dxf.polyline(l.map(mv), 'LED_STRIP', false);
    for (const b of sensors) dxf.polyline(b.map(mv), 'SENSOR_UNDER');
    for (const sp of spokes) dxf.polyline(sp.map(mv), 'SPOKES', false);
    dxf.text([dx - 60, -s.g.rhoEnd - 30], 8, label, 'NOTES');
  }
  return dxf.toString();
}

/** File names for the downloads; identical parts (mirror images: one is turned over) make one cut file, ordered twice. */
export function cutFiles(d: PanelDesign): { name: string; text: string }[] {
  if (d.identical) return [{ name: `${d.name}_panel_QTY2_cut_in.dxf`, text: cutDxf(d.sides.LEFT) }];
  return [d.sides.LEFT, d.sides.RIGHT].map((s) => ({ name: `${d.name}_${s.label}_cut_in.dxf`, text: cutDxf(s) }));
}
