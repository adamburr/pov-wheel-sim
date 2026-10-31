// The panel designs across many lacings and wheel sizes: slow tests, in a file of their own so they run
// beside the rest.
import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { derive } from '../src/sim/timing';
import { designPanels } from '../src/panels/design';
import { panelInputs } from '../src/panels/fromParams';
import { design } from './panelDesign';

describe('every lacing', () => {
  it('designs every common lacing, every edge tied', () => {
    for (const [spokes, crosses] of [[24, 3], [28, 3], [32, 0], [32, 1], [32, 2], [32, 4], [36, 0], [36, 2], [36, 3], [36, 4]]) {
      const d = design(2, { spokes, spokeCrosses: crosses });
      expect(d.sides.LEFT.summary.tieGaps + d.sides.RIGHT.summary.tieGaps, `${spokes} spokes ${crosses}-cross`).toBe(0);
      expect(d.sides.LEFT.summary.discCross).toBe(crosses); // the outermost cross
      expect(d.sides.LEFT.summary.discTies, `${spokes} spokes ${crosses}-cross`).toBeGreaterThan(0);
    }
  }, 60_000); // designs a panel for many wheels: slow on a CI runner
});

describe('every wheel size', () => {
  it('places the LEDs the same way for the simulator and the panels on every wheel size', () => {
    for (const [bsdMm, spokes, crosses] of [[622, 32, 3], [559, 32, 3], [406, 28, 2], [305, 28, 2], [203, 16, 1]]) {
      const p = { ...defaultParams(), bsdMm, spokes, spokeCrosses: crosses, panelTipRadiusMm: 0, stripCount: 2 };
      const { wheel, panel } = panelInputs(p);
      const d = designPanels(wheel, panel), L = d.sides.LEFT.summary, sd = derive(p);
      expect(d.rimNote).toBe('');
      expect(L.tipR).toBeLessThan(bsdMm / 2 - p.rimDepthMm); // inside the rim
      expect(sd.ledsPerStrip).toBe(L.ledsPerStrip);
      expect(sd.rStart * 1000).toBeCloseTo(L.ledStartR, 0);
      expect(sd.rEnd * 1000).toBeCloseTo(L.ledEndR, 0);
    }
  });
});
