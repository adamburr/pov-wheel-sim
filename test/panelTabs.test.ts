// Every tab ends on a spoke line, on every wheel and strip count: slow, in a file of its own so it runs
// beside the rest.
import { describe, expect, it } from 'vitest';
import { holeSize } from '../src/panels/design';
import { dist, pmod, type Pt } from '../src/panels/geom';
import { design } from './panelDesign';

describe('tabs cut from the wedges', () => {
  it('ends every tab on a spoke line, and keeps every spoke tie inside the panel', () => {
    for (const [bsdMm, spokes, spokeCrosses] of [[622, 32, 3], [559, 32, 3], [406, 28, 3], [305, 28, 2]]) {
      for (const n of [1, 2, 3, 4]) {
        // the default wheel (700c, 32 spokes, 3-cross, measured tips) reuses the designs the other tests made
        const d = bsdMm === 622 ? design(n) : design(n, { bsdMm, spokes, spokeCrosses, panelTipRadiusMm: 0 });
        const pp = d.spec, reach = d.wheel.p.spokeD / 2 + pp.spokeGap + holeSize(pp) / 2 + (holeSize(pp) / 2 + pp.gridEdge) * Math.SQRT2 + 2;
        for (const s of [d.sides.LEFT, d.sides.RIGHT]) {
          const own = d.wheel.spokes.filter((k) => k.side === s.side);
          const pts = s.g.outlineBulge;
          // the outline's straight runs that lie along one of the panel's spokes: parallel, within a tie's pad of it
          const onSpoke = pts.flatMap(([x0, y0, b], i) => {
            const [x1, y1] = pts[(i + 1) % pts.length];
            if (b || Math.hypot(x1 - x0, y1 - y0) < 3) return [];
            const a = Math.atan2(y1 - y0, x1 - x0), mid: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
            return own.some((k) => {
              const ka = Math.atan2(k.p1[1] - k.p0[1], k.p1[0] - k.p0[0]);
              if (Math.abs(pmod(a - ka + Math.PI / 2, Math.PI) - Math.PI / 2) > 1e-6) return false;
              return Math.abs((mid[0] - k.p0[0]) * Math.sin(ka) - (mid[1] - k.p0[1]) * Math.cos(ka)) <= reach;
            }) ? [mid] : [];
          });
          for (const t of s.spokeTies.filter((x) => x.earMm > 0)) {
            const at: Pt = [(t.holes[0][0] + t.holes[1][0]) / 2, (t.holes[0][1] + t.holes[1][1]) / 2];
            expect(onSpoke.some((q) => dist(q, at) < 25), `tab at r ${t.r} on ${s.label}, ${n} strips, ${bsdMm}`).toBe(true);
          }
          for (const h of s.g.holes.filter((q) => q.kind === 'spoke')) {
            expect(s.g.outline.contains(h.ring.pts[0])).toBe(true);
            expect(s.g.outline.boundaryDist(h.ring, pp.gridEdge)).toBeGreaterThanOrEqual(pp.gridEdge - 0.1);
          }
        }
      }
    }
  }, 60_000); // designs a panel for many wheels: slow on a CI runner
});
