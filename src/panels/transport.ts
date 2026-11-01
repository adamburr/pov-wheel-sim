// A design crosses from the worker to the page as plain data (structured clone keeps no functions
// or classes): rings travel as their points, the wheel as its dimensions, and the surface the panel
// lies on as its table. Unpacking builds the helpers again.
import { type Flat, type Hole, type PanelDesign, type SideResult, surfaceFns } from './design';
import { type Pt, Ring } from './geom';
import { Wheel, type WheelSpec } from './wheel';

type PackedHole = Omit<Hole, 'ring'> & { ring: Pt[] };
type PackedFlat = Omit<Flat, 'outline' | 'holes' | 'bore'> & { outline: Pt[]; holes: PackedHole[]; bore: { bulge: Flat['bore']['bulge']; ring: Pt[] } };
type PackedSide = Omit<SideResult, 'g' | 'sf'> & { g: PackedFlat };
export type PackedDesign = Omit<PanelDesign, 'wheel' | 'sides'> & { wheel: WheelSpec; sides: { LEFT: PackedSide; RIGHT: PackedSide } };

function packSide({ sf: _sf, ...s }: SideResult): PackedSide {
  const { outline, holes, bore, ...g } = s.g;
  return { ...s, g: { ...g, outline: outline.pts, holes: holes.map((h) => ({ ...h, ring: h.ring.pts })), bore: { bulge: bore.bulge, ring: bore.ring.pts } } };
}

function unpackSide(s: PackedSide): SideResult {
  const g: Flat = {
    ...s.g, outline: new Ring(s.g.outline), holes: s.g.holes.map((h) => ({ ...h, ring: new Ring(h.ring) })),
    bore: { bulge: s.g.bore.bulge, ring: new Ring(s.g.bore.ring) },
  };
  return { ...s, g, sf: surfaceFns(s.surface) };
}

export function packDesign(d: PanelDesign): PackedDesign {
  return { ...d, wheel: d.wheel.p, sides: { LEFT: packSide(d.sides.LEFT), RIGHT: packSide(d.sides.RIGHT) } };
}

export function unpackDesign(d: PackedDesign): PanelDesign {
  return { ...d, wheel: new Wheel(d.wheel), sides: { LEFT: unpackSide(d.sides.LEFT), RIGHT: unpackSide(d.sides.RIGHT) } };
}
