"""
Geometric model of a laced bicycle wheel (default: 32-hole, 3-cross, symmetric front hub).

Coordinates: x, y in the wheel plane (mm, hub centre at origin), z along the axle,
+z = RIGHT side of the bike. Angles in degrees, counter-clockwise seen from the right.

Model:
  * Rim holes i = 0..N-1 at angle i*360/N. Holes alternate flanges: even -> LEFT, odd -> RIGHT.
    Valve hole between holes N-1 and 0.
  * Each flange has N/2 holes; the two flanges are offset by half a hole spacing.
  * On each flange, spokes alternate between the two directions (leading / trailing) around
    the rim; a k-cross spoke leaves the hub k * 720/N degrees away from its rim hole.
  * Heads-in spokes leave from the OUTER face of the flange, heads-out spokes from the INNER
    face (flange thickness apart). Direction +1 = heads-in, -1 = heads-out.
  * Spokes run straight to the rim at r = ERD/2, z = rim_offset (plus optional offset drilling).
  * At each spoke's outermost crossing the pair is interlaced: the heads-out spoke is bent
    outboard over the heads-in spoke by about one spoke diameter, tapering over interlace_len.

!! Dimensions are TYPICAL VALUES, not measurements. Replace with the M-values from the guide. !!
"""
import math
from dataclasses import dataclass, field

TYPICAL_FRONT = dict(
    spokes=32, crosses=3,
    erd=600.0,             # effective rim diameter (spoke ends)
    rim_wall_r=296.0,      # radius of the rim's inner wall, where nipples exit (BSD/2 - rim depth)
    nipple_exposed=6.0,    # M20: nipple length showing inside the rim wall
    rim_offset=0.0,        # rim hole offset from the centre plane (symmetric rim = 0)
    offset_drill=0.0,      # +/- alternate hole offset of offset-drilled rims (0 = in line)
    pcd_left=40.0, pcd_right=40.0,           # flange spoke-hole circle diameters
    c2f_left=35.0, c2f_right=35.0,           # hub centre to flange centre
    flange_t=2.8,          # flange thickness
    flange_outer_extra=4.5,  # flange outer edge beyond the hole circle (radius)
    hole_d=2.6,            # flange hole diameter
    spoke_d=2.0,           # 14 g
    head_h=2.0,            # spoke head height proud of the flange face (heads-out spokes)
    old=100.0,             # over-locknut width
    interlace_len=35.0,    # length over which the interlace bend fades (each way)
)

# Typical rim numbers by size (ERD varies by rim model: use the maker's ERD when you know it).
WHEEL_PRESETS = {
    "700c": dict(erd=600.0, rim_wall_r=296.0),
    "29in": dict(erd=600.0, rim_wall_r=296.0),
    "650b": dict(erd=560.0, rim_wall_r=276.0),
    "26in": dict(erd=540.0, rim_wall_r=266.0),
    "24in": dict(erd=488.0, rim_wall_r=240.0),
    "20in": dict(erd=390.0, rim_wall_r=191.0),
}

@dataclass
class Spoke:
    i: int                  # rim hole index
    side: int               # -1 left, +1 right
    direction: int          # +1 heads-in, -1 heads-out
    rim_deg: float
    hub_deg: float
    p0: tuple               # (x, y, z) at the flange
    p1: tuple               # (x, y, z) at the rim (spoke end)
    crossings: list = field(default_factory=list)   # (t along spoke 0..1, other spoke index, x, y)
    interlace: tuple = None  # (t, x, y, +1 outboard / -1 inboard)

    def at(self, t):
        return tuple(a + (b - a)*t for a, b in zip(self.p0, self.p1))

    @property
    def length(self):
        return math.dist(self.p0, self.p1)


class Wheel:
    def __init__(self, **kw):
        self.p = {**TYPICAL_FRONT, **kw}
        p = self.p
        N, k = p["spokes"], p["crosses"]
        self.hole_pitch = 360/N
        cross_deg = k*720/N
        self.spokes = []
        per_side = {-1: 0, 1: 0}
        for i in range(N):
            side = -1 if i % 2 == 0 else 1
            j = per_side[side]; per_side[side] += 1
            direction = 1 if j % 2 == 0 else -1
            rim = i*self.hole_pitch
            hub = rim + direction*cross_deg
            pcd = p["pcd_left"] if side < 0 else p["pcd_right"]
            c2f = p["c2f_left"] if side < 0 else p["c2f_right"]
            zf = side*(c2f + direction*p["flange_t"]/2)          # heads-in: outer face
            r0, r1 = pcd/2, p["erd"]/2
            zr = p["rim_offset"] + side*p["offset_drill"]
            p0 = (r0*math.cos(math.radians(hub)), r0*math.sin(math.radians(hub)), zf)
            p1 = (r1*math.cos(math.radians(rim)), r1*math.sin(math.radians(rim)), zr)
            self.spokes.append(Spoke(i, side, direction, rim, hub % 360, p0, p1))
        self._find_crossings()

    # ---------------------------------------------------------------- geometry
    def _find_crossings(self):
        S = self.spokes
        for a in range(len(S)):
            for b in range(a + 1, len(S)):
                A, B = S[a], S[b]
                if A.side != B.side or A.direction == B.direction:
                    continue
                hit = seg_intersect(A.p0[:2], A.p1[:2], B.p0[:2], B.p1[:2])
                if hit is None:
                    continue
                ta, tb, x, y = hit
                A.crossings.append((ta, b, x, y)); B.crossings.append((tb, a, x, y))
        for s in S:
            s.crossings.sort()
            if s.crossings:
                t, other, x, y = s.crossings[-1]                 # outermost crossing
                s.interlace = (t, x, y, 1 if s.direction < 0 else -1)

    def surface_z(self, s, t):
        """|z| of the spoke's OUTBOARD surface at parameter t (interlace bend included)."""
        z = abs(s.at(t)[2]) + self.p["spoke_d"]/2
        if s.interlace:
            ti, _, _, sgn = s.interlace
            dist = abs(t - ti)*s.length
            z += sgn*self.p["spoke_d"]/2*max(0.0, 1 - dist/self.p["interlace_len"])
        return z

    def side_spokes(self, side):
        return [s for s in self.spokes if s.side == side]

    def hub_angles(self, side):
        return sorted(round(s.hub_deg, 3) for s in self.side_spokes(side))

    def valve_deg(self):
        return -self.hole_pitch/2

    def nipple_tip_r(self):
        return self.p["rim_wall_r"] - self.p["nipple_exposed"]

    def flange_outer_r(self, side):
        pcd = self.p["pcd_left"] if side < 0 else self.p["pcd_right"]
        return pcd/2 + self.p["flange_outer_extra"]

    def spoke_length_formula(self, side):
        """Standard spoke-length formula (for comparison with the measured spokes)."""
        p = self.p
        pcd = p["pcd_left"] if side < 0 else p["pcd_right"]
        c2f = p["c2f_left"] if side < 0 else p["c2f_right"]
        R, r = p["erd"]/2, pcd/2
        a = math.radians(p["crosses"]*720/p["spokes"])
        return math.sqrt(R*R + r*r + c2f*c2f - 2*R*r*math.cos(a)) - p["hole_d"]/2

    def supports_under_line(self, side, deg, r0, r1):
        """Spokes of one side crossing a radial line (plan view) between r0 and r1:
        returns [(r, |z| of outboard surface, spoke index)] sorted by r."""
        a = math.radians(deg)
        q0, q1 = (r0*math.cos(a), r0*math.sin(a)), (r1*math.cos(a), r1*math.sin(a))
        out = []
        for idx, s in enumerate(self.spokes):
            if s.side != side:
                continue
            hit = seg_intersect(s.p0[:2], s.p1[:2], q0, q1)
            if hit:
                t, u, x, y = hit
                out.append((math.hypot(x, y), self.surface_z(s, t), idx))
        return sorted(out)

    def check(self):
        """Lacing invariants: unique flange holes, crossings per spoke, spoke lengths."""
        res = {}
        for side, name in ((-1, "left"), (1, "right")):
            hubs = self.hub_angles(side)
            res[f"{name}_flange_holes_unique"] = len(set(round(h % 360, 2) for h in hubs)) == self.p["spokes"]//2
            res[f"{name}_crossings_per_spoke"] = sorted({len(s.crossings) for s in self.side_spokes(side)})
            ls = [s.length for s in self.side_spokes(side)]
            res[f"{name}_spoke_len_model"] = (round(min(ls), 1), round(max(ls), 1))
            res[f"{name}_spoke_len_formula"] = round(self.spoke_length_formula(side), 1)
            res[f"{name}_outermost_cross_r"] = sorted({round(math.hypot(s.interlace[1], s.interlace[2]))
                                                       for s in self.side_spokes(side) if s.interlace})
        return res


def seg_intersect(a0, a1, b0, b1):
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = a0, a1, b0, b1
    d = (x1 - x2)*(y3 - y4) - (y1 - y2)*(x3 - x4)
    if abs(d) < 1e-12:
        return None
    t = ((x1 - x3)*(y3 - y4) - (y1 - y3)*(x3 - x4))/d
    u = -((x1 - x2)*(y1 - y3) - (y1 - y2)*(x1 - x3))/d
    if 0 < t < 1 and 0 < u < 1:
        return t, u, x1 + t*(x2 - x1), y1 + t*(y2 - y1)
    return None


if __name__ == "__main__":
    import json
    w = Wheel()
    print(json.dumps(w.check(), indent=1))
