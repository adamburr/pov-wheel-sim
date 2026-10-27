// The panel design's inputs from the app's settings. The strips, LED density, spokes, rim and
// magnet sensors are the same settings the simulator uses; the rest are the panels' own.
import { type Params, WHEELS } from '../params';
import type { PanelDesign, PanelSpec, WheelInput } from './design';

/** Strip counts the panel layouts cover. */
export const PANEL_STRIPS = [2, 3, 4];

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
      strips: p.stripCount, ledPitch: 1000 / p.ledDensity, material: p.panelMaterial,
      boreD: p.panelBoreMm, tipEndR: p.panelTipRadiusMm > 0 ? p.panelTipRadiusMm : null, tipSlot: p.panelTipSlot,
      stripW: p.panelStripWidthMm, stripT: p.panelStripThickMm, tieW: p.panelTieWidthMm, tieClear: p.panelTieClearMm,
      holesEvery: p.panelHolesEvery, gridEdge: p.panelEdgeMm, boreEdge: p.panelBoreEdgeMm, holeMinR: p.panelHoleMinRMm, cornerR: p.panelCornerMm,
      wCenter: p.panelBladeWidthMm, centerCol: p.panelCenterHoles, plateHoles: p.panelPlateHoles, plateHalfW: p.panelPlateHalfWidthMm,
      plateTaper: p.panelPlateTaperMm, plateLen: p.panelPlateLengthMm, plateTaperCols: p.panelTaperCols > 0 ? p.panelTaperCols : null,
      forkCrownR: p.forkCrownRadiusMm, forkCrownHalf: p.forkCrownHalfMm,
      // magnetometer boards under the left blades: one per strip, or one in all
      sensor: p.syncMode === 'hall', sensorAll: p.hallPerStrip,
    },
  };
}

/** Changes whenever the design's inputs change. */
export const panelKey = (p: Params) => JSON.stringify(panelInputs(p));

/**
 * Point the simulator's strips at where these panels hold the LEDs. The rim depth comes down too
 * when the outer LEDs would otherwise sit closer to the rim than the simulator allows.
 */
export function applyToSim(p: Params, d: PanelDesign) {
  p.ledDensity = d.sim.ledDensity;
  p.stripStartMm = d.sim.stripStartMm;
  p.stripLengthMm = d.sim.stripLengthMm;
  p.autoLength = false;
  const room = p.bsdMm / 2 - 8 - (d.sim.stripStartMm + d.sim.stripLengthMm); // the simulator keeps LEDs 8 mm inside the rim wall
  if (p.rimDepthMm > room) p.rimDepthMm = Math.max(1, Math.floor(room));
}
