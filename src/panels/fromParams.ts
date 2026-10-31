// The panel design's inputs from the app's settings, and where the LEDs sit for them. The wheel,
// hub and fork, the strips and the LED placement are the same settings the simulator uses; the
// rest are the panels' own. Nothing here loads the designer: the simulator uses ledSpanOf at startup.
import { LED, type Params, WHEELS } from '../params';
import type { PanelSpec, WheelInput } from './design';
import { type LedSpan, ledSpan, SPAN_DEFAULTS, STRIP_SLEEVE_W } from './ledSpan';

/** Strip counts the panel layouts cover. */
export { PANEL_STRIP_RANGE as PANEL_STRIPS } from './strips';

/** A short wheel size for file names: "700c", "29in", or the bead seat diameter when it's custom. */
function sizeName(p: Params): string {
  const preset = WHEELS[p.wheelPreset];
  if (!preset || preset.bsdMm !== p.bsdMm) return `${Math.round(p.bsdMm)}bsd`;
  return p.wheelPreset.split(' ')[0].replace('"', 'in').replace(/[^0-9a-z.]/gi, '');
}

export function panelInputs(p: Params): { wheel: WheelInput; panel: Partial<PanelSpec> } {
  // Spoke ends sit about 4 mm beyond the rim's inner wall (ERD = 2 × (wall radius + 4), which
  // matches typical rims of every size).
  const rimWallR = p.bsdMm / 2 - p.rimDepthMm;
  return {
    wheel: {
      size: sizeName(p), spokes: p.spokes, crosses: p.spokeCrosses, rimWallR, erd: 2 * (rimWallR + 4),
      pcdLeft: p.hubFlangePcdMm, pcdRight: p.hubFlangePcdMm, c2fLeft: p.hubFlangeOffsetMm, c2fRight: p.hubFlangeOffsetMm,
      old: p.hubOldMm,
    },
    panel: {
      strips: p.stripCount, ledPitch: 1000 / LED.perM, material: p.panelMaterial,
      boreMinD: p.panelBoreMm, tipEndR: p.panelTipRadiusMm > 0 ? p.panelTipRadiusMm : null, tipSlot: p.panelTipSlot,
      tieW: p.panelTieWidthMm, tieClear: p.panelTieClearMm,
      stripStartR: p.panelStripMinMm, holesEvery: p.panelHolesEvery, gridEdge: p.panelEdgeMm, cornerR: p.panelCornerMm, bladeW: p.panelBladeWidthMm,
      discCross: p.panelDiscCross, tieSpan: p.panelTieSpanMm, tipTieZone: p.panelTipTieMm, earMax: p.panelTabMaxMm,
      forkCrownR: p.forkCrownRadiusMm, forkCrownHalf: p.forkCrownHalfMm,
    },
  };
}

/** Changes whenever the design's inputs change. */
export const panelKey = (p: Params) => JSON.stringify(panelInputs(p));

/** Where the LEDs sit for these settings, by the panels' rule (ledSpan.ts), without designing the panels. */
export function ledSpanOf(p: Params): LedSpan {
  return ledSpan({
    ...SPAN_DEFAULTS, rimWallR: p.bsdMm / 2 - p.rimDepthMm,
    tipEndR: p.panelTipRadiusMm > 0 ? p.panelTipRadiusMm : null, tipSlot: p.panelTipSlot,
    stripW: STRIP_SLEEVE_W, tieW: p.panelTieWidthMm, tieClear: p.panelTieClearMm, gridEdge: p.panelEdgeMm, bladeW: p.panelBladeWidthMm,
    boreMinD: p.panelBoreMm, stripStartR: p.panelStripMinMm, ledPitch: 1000 / LED.perM,
  });
}
