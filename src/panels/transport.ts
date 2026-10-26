// A design crosses from the worker to the page as plain data (structured clone keeps no functions
// or classes): rings travel as their points, the wheel as its dimensions, and the bent shape as its
// tables. Unpacking builds the helpers again.
import { bendFns, type Flat, type Hole, hwFn, type Mech, type PanelDesign, type SideResult } from './design';
import { type Pt, Ring } from './geom';
import { Wheel, type WheelSpec } from './wheel';

type PackedHole = Omit<Hole, 'ring'> & { ring: Pt[] };
type PackedFlat = Omit<Flat, 'outline' | 'holes' | 'hw'> & { outline: Pt[]; holes: PackedHole[] };
type PackedMech = Omit<Mech, keyof ReturnType<typeof bendFns>>;
type PackedSide = Omit<SideResult, 'g' | 'm'> & { g: PackedFlat; m: PackedMech };
export type PackedDesign = Omit<PanelDesign, 'wheel' | 'sides'> & { wheel: WheelSpec; sides: { LEFT: PackedSide; RIGHT: PackedSide } };

function packSide(s: SideResult): PackedSide {
  const { hw: _hw, outline, holes, ...g } = s.g;
  const { planR: _p, rhoOf: _r, zAtRho: _z, zMid: _m, ...m } = s.m;
  return { ...s, g: { ...g, outline: outline.pts, holes: holes.map((h) => ({ ...h, ring: h.ring.pts })) }, m };
}

function unpackSide(s: PackedSide): SideResult {
  const g: Flat = { ...s.g, outline: new Ring(s.g.outline), holes: s.g.holes.map((h) => ({ ...h, ring: new Ring(h.ring) })), hw: hwFn(s.g.hwSpec) };
  return { ...s, g, m: { ...s.m, ...bendFns(s.m.bend) } };
}

export function packDesign(d: PanelDesign): PackedDesign {
  return { ...d, wheel: d.wheel.p, sides: { LEFT: packSide(d.sides.LEFT), RIGHT: packSide(d.sides.RIGHT) } };
}

export function unpackDesign(d: PackedDesign): PanelDesign {
  return { ...d, wheel: new Wheel(d.wheel), sides: { LEFT: unpackSide(d.sides.LEFT), RIGHT: unpackSide(d.sides.RIGHT) } };
}
