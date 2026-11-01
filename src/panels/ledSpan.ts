// Where the LEDs sit on each strip, by the panels' rules: laid from the blade tip inward in whole
// pixels, so the outermost LED sits as far out as it can. The simulator and the panel design both
// use this, so they always agree. Nothing here needs the panels' geometry (or clipper): the
// simulator loads it at startup.

/** The standard strip (Adafruit 2328) in its weatherproof sleeve: width and thickness (mm). */
export const STRIP_SLEEVE_W = 14, STRIP_SLEEVE_T = 4;

/** The fixed parts of the rule (mm). */
export const SPAN_DEFAULTS = {
  tipClear: 3,       // tip-end corners inside the rim wall
  tipSlotClear: 1,   // a slot's bottom (or a short blade's tip) this far inside the nipples' inner ends
  stripStartGap: 3,  // first LED at least this far outside the bore
  stripMaxLen: 500,  // one half-metre strip per blade at most
  nippleExposed: 6,  // nipple length showing inside the rim wall (typical)
  tipToLed: 2,       // the strip's last pixel ends this far inside the tip
};

/** What the LED positions depend on (mm). */
export interface SpanInput {
  rimWallR: number;
  nippleExposed: number;
  tipEndR: number | null;     // measured tip radius; null = automatic: just inside the nipples
  tipClear: number;
  tipSlot: 'auto' | 'none';
  tipSlotClear: number;
  stripW: number; tieW: number; tieClear: number; gridEdge: number;
  bladeW: number;             // 0 = the narrowest that holds the strip ties
  boreMinD: number;
  stripStartGap: number;
  stripStartR: number | null; // the strips stop at least this far from the axle; null = just outside the bore
  stripMaxLen: number;
  ledPitch: number;
}

export interface LedSpan {
  bladeW: number;
  /** The rim wall the design assumes: the wheel's, or just outside a measured tip that wouldn't fit inside it. */
  rimWallR: number;
  rimNote: string;
  /** The blade tips' radius. */
  rEnd: number;
  /** The inner end of the first pixel. */
  ledStart: number;
  ledsPerStrip: number;
}

export const holeSize = (pp: { tieW: number; tieClear: number }) => pp.tieW + pp.tieClear;
/** Strip ties: hole centres on the strip's edges. */
export const rowOffset = (pp: { stripW: number }) => pp.stripW / 2;
/** Narrowest blade: the strip ties plus gridEdge outside them. */
export const minBladeW = (pp: { stripW: number; tieW: number; tieClear: number; gridEdge: number }) =>
  Math.ceil(2 * (rowOffset(pp) + holeSize(pp) / 2 + pp.gridEdge));

export function ledSpan(s: SpanInput): LedSpan {
  const bladeW = Math.max(s.bladeW, minBladeW(s));
  let rimWallR = s.rimWallR, rimNote = '', rEnd: number;
  if (s.tipEndR) { // measured tip position: make sure the modelled rim sits outside it
    const need = Math.hypot(s.tipEndR, bladeW / 2) + s.tipClear;
    if (rimWallR < need) {
      rimWallR = need;
      rimNote = `Rim wall assumed at r = ${need.toFixed(1)} mm, just outside the tip. Measure the rim to confirm.`;
    }
    rEnd = s.tipEndR;
  } else {
    rEnd = Math.sqrt(Math.max(0, (rimWallR - s.tipClear) ** 2 - (bladeW / 2) ** 2));
  }
  // An automatic tip stops short of the nipples too, so it needs no nipple slot: a slot across a
  // strip's lane would end that strip early, by how the blades fall among the spokes, which only
  // the full design knows. Only a measured tip reaches past them, slotted round each nipple.
  if (s.tipSlot === 'none' || !s.tipEndR) { // the tip's corners, too, stay inside the nipples
    rEnd = Math.min(rEnd, Math.sqrt(Math.max(0, (rimWallR - s.nippleExposed - s.tipSlotClear) ** 2 - (bladeW / 2) ** 2)));
  }
  // whole pixels from the tip in, no closer to the axle than the hub or the panels' own limit, and
  // one half-metre strip at most
  const top = rEnd - SPAN_DEFAULTS.tipToLed;
  const stripMin = Math.max(s.boreMinD / 2 + s.stripStartGap, s.stripStartR ?? 0, top - s.stripMaxLen);
  const ledsPerStrip = Math.max(0, Math.floor((top - stripMin) / s.ledPitch + 1e-9));
  return { bladeW, rimWallR, rimNote, rEnd, ledStart: top - ledsPerStrip * s.ledPitch, ledsPerStrip };
}
