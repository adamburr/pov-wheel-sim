"""
Parametric, self-supporting LED panels for a front-wheel POV display  (pairs with pov-wheel-sim)

Two identical flat-cut panels hug the hub, one each side of the wheel. Each is a star of N straight,
tapered blades (N = LED strips per side: 2, 3 or 4). Every edge is a straight line with a small corner
radius; the only curve is the centre bore. Each blade carries one LED strip between two rows of square
tie holes centred on the strip edges, with a wider plate near the hub (battery / electronics) and a
nipple slot in the tip. Final material G-10/FR-4 1/16" (waterjet); wood prototypes in MATERIALS.

The blade tips meet in the wheel's centre plane near the rim and are zip-tied tip-to-tip to the other
panel's tips, never to the spokes. Pulling the tips together bends every blade like a leaf spring, and
the reaction clamps both panels onto the hub (each rests on its flange's spoke heads).

The script computes the bend (tip force, clamp, stress, bent shape), lengthens the flat blades so the
bent tips land on the measured tip radius, and checks clearance to every spoke, the fork, and tie heads.
See README.md for the full design notes.

Usage
    python3 pov_panels.py --all                            # G-10, 2, 3 and 4 blades per side
    python3 pov_panels.py --strips 3                       # one layout
    python3 pov_panels.py --set led_pitch=7.0 tip_slot=none

Output per configuration (in out/<name>/):
    <name>_panel_QTY2_cut_in.dxf    SendCutSend-ready: inches, one layer, closed outlines (order 2)
                                    (LEFT/RIGHT files instead if the two panels ever differ)
    <name>_reference_mm.dxf         both panels + LED lines + labels (NOT for cutting)
    <name>_preview.png, <name>_report.json

!! Wheel dimensions other than the bore and tip radius are TYPICAL VALUES until measured. !!
"""
import argparse, json, math, os, bisect
from shapely.geometry import Point, box, LineString, Polygon
from shapely.ops import unary_union, transform
from shapely.prepared import prep
from shapely import affinity, segmentize
import ezdxf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from wheel3x import Wheel, WHEEL_PRESETS

# ---------------------------------------------------------------- WHEEL (typical values)
WHEEL = dict(
    size="700c",
    spokes=32, crosses=3,
    pcd_left=44.0, pcd_right=44.0,      # M21 flange spoke-hole circles (must exceed the 1.5" bore for the panel to seat on the heads)
    c2f_left=35.0, c2f_right=35.0,      # hub centre to flange centre
    flange_t=2.8, spoke_d=2.0, head_h=2.0,
    old=100.0,                          # M3
    hub_end_d=26.0,                     # M6: largest diameter the bore must slide over / centre on
    nipple_exposed=6.0,                 # M20
)
# ---------------------------------------------------------------- PANEL / MATERIAL
PANEL = dict(
    strips=2,                 # LED strips (blades) per side
    even_spacing=True,        # exactly 360/strips apart (tips placed for best room between spokes)
    sandwich_ok=True,         # if even tips can't all sit between spokes (3 strips on 32 spokes), centre ONE tip on a
                              # spoke: the two panels' tips clamp that spoke and its nipple between them
    nipple_d=4.0,             # nipple shank diameter (typical 14 g brass), for the sandwiched tip
    tip_slot="all",           # slot in the tip end for a spoke nipple: "auto" = on every tip when a blade sits on a
                              # spoke (3 strips), "all" = always, "none" = never
    tip_slot_w=None,          # slot width; None = nipple_d + 1.0
    tip_slot_clear=1.0,       # slot bottom this far inside the nipple's inner end (bent, on the wheel)
    material="g10_063",       # see MATERIALS: sets thickness, E, density, stress target, cutout radius
    # Adafruit DotStar 144 LED/m black (product 2241, SK9822): 14 mm wide x 4 mm in its weatherproof sleeve
    strip_w=14.0, strip_t=4.0, led_pitch=1000/144,
    bore_d=38.1,              # measured: 1.5" centre hole
    tip_end_r=298.45,         # measured: bore edge to blade tip 11" -> tip end 11.75" from the axle (on the wheel)
    w_center=50.0,            # blade width at the centre (straight taper to the tip width)
    hub_w=8.0,                # minimum material round the bore
    corner_r=2.0,             # radius on every outline corner, outside and inside
    tip_clear=3.0,            # tip-end corners inside the rim wall
    # Zip ties: holes fit 40 lb (178 N, 3.6 x 1.27 mm) and 18 lb (80 N, 2.4 x 1.1 mm) nylon 6/6 ties.
    tie_w=3.6, tie_t=1.27,
    # tie head (HellermannTyton T30R, 3.6 mm strap: 6.0 wide x 5.9 long x 4.3 high). Heads go on the INNER face,
    # across the LED lane; a head that would hit a spoke there goes on the outer face beside the strip instead.
    tie_head=(6.0, 5.9, 4.3),
    tie_clear=1.0,            # square hole = tie width + 1.0 mm (4.6 mm): a tie passes either way
    holes_every=2,            # hole pairs every N LED pixels, centred on the gap between pixels
    grid_edge=4.0,            # minimum material from a hole to the outer edge
    bore_edge=3.0,            # minimum material from a hole to the centre bore
    grid_strip_gap=1.5,       # (used only if rows_on_strip_edges is False) material between a hole and the strip edge
    rows_on_strip_edges=True, # the rows beside the LED lane have their hole centres on the strip's edges
    strip_start_gap=3.0,      # LED strip starts this far outside the bore
    # LEFT panel electronics plate: straight-edged, centred on the hub, along the blades
    plate=True, plate_side="both",   # "both" = identical panels (same flex, tips meet in the centre); -1 = left only
    plate_half_w=41.3,        # half-width across the blades: 6 hole columns (snapped to the hole lattice)
    grid_pitch_y=None,        # hole pitch ACROSS the blades; None = the strip width (rows every 14 mm);
                              # along the blades the pitch is holes_every LED pixels
    center_col=True,          # keep the hole column through the hub (only its outer plate holes fit beside the bore);
                              # it stays on the centre line while the two halves of the grid slide outward
    push_out=True,            # shift each blade's hole grid out toward its tip as far as the edge rule allows
                              # (the two halves move apart; the outermost holes end grid_edge from the tip)
    plate_len=48.0,           # full width runs this far along each blade from the centre (snapped to the lattice)
    plate_taper=60.0,         # taper length, used only if plate_taper_end is None
    plate_taper_end=149.6,    # the taper meets the plain blade this far from the centre (upper limit if plate_taper_cols set)
    plate_taper_cols=4,       # fit the taper to the holes: it carries this many columns of the second hole row beyond
                              # the full-width plate (the edge clears the last one by grid_edge); None = use plate_taper_end
    sensor=True, sensor_side=-1,   # magnetometer boards under the LEFT blades (magnet on the left fork leg)
    sensor_r=110.0, sensor_board=(25.4, 17.8),
    min_spoke_clear=1.0,      # mm, required gap panel <-> any spoke
    # fork: straight blades from the dropouts (OLD/2) to the crown (typical: replace with M11/M12)
    fork_crown_r=340.0, fork_crown_half=22.0, min_fork_clear=3.0,
)
MATERIALS = {
    "g10_063":       dict(label='G-10/FR-4 1/16"', role="final, waterjet", thickness=1.600, E=18000.0, density=1.85, sigma_allow=60.0, cut_corner_r=1.0),
    # prototypes: stress targets are SHORT-TERM (about 1/3 of typical bending strength): fit checks and test rides only
    "birch_125":     dict(label='Baltic birch 1/8"', role="prototype, laser (blades along the face grain)", thickness=3.175, E=9000.0, density=0.68, sigma_allow=25.0, cut_corner_r=0.4),
    "hardboard_125": dict(label='Hardboard 1/8"', role="prototype, laser", thickness=3.175, E=4500.0, density=0.95, sigma_allow=15.0, cut_corner_r=0.4),
    "delrin_125":    dict(label='Delrin 150 1/8"', role="laser", thickness=3.175, E=2900.0, density=1.41, sigma_allow=20.0, cut_corner_r=0.4),
}
# -----------------------------------------------------------------------------

def rot(g, a): return affinity.rotate(g, a, origin=(0, 0))
def pol(r, a): return (r*math.cos(math.radians(a)), r*math.sin(math.radians(a)))
def disk(r): return Point(0, 0).buffer(r, resolution=360)
def adiff(a, b): return abs(((a - b + 180) % 360) - 180)

def fillet_ring(pts, r):
    """Fillet every corner of a closed straight-edged ring (CCW list of (x, y), no repeat) with
    radius r. Returns (bulge_pts, sampled): bulge_pts is [(x, y, bulge)] for a DXF LWPOLYLINE
    (straight lines + true circular arcs), sampled is the same outline as points for analysis."""
    n = len(pts)
    fil = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        a = (p0[0] - p1[0], p0[1] - p1[1]); b = (p2[0] - p1[0], p2[1] - p1[1])
        la, lb = math.hypot(*a), math.hypot(*b)
        ua, ub = (a[0]/la, a[1]/la), (b[0]/lb, b[1]/lb)
        th = math.acos(max(-1.0, min(1.0, ua[0]*ub[0] + ua[1]*ub[1])))      # corner angle
        turn = (p1[0] - p0[0])*(p2[1] - p1[1]) - (p1[1] - p0[1])*(p2[0] - p1[0])
        d = r/math.tan(th/2) if th > 1e-9 else 0.0
        rr = r
        lim = 0.49*min(la, lb)
        if d > lim:                     # edge too short for the full radius: shrink this one
            rr = r*lim/d; d = lim
        sweep = math.pi - th
        fil.append(dict(t1=(p1[0] + ua[0]*d, p1[1] + ua[1]*d), t2=(p1[0] + ub[0]*d, p1[1] + ub[1]*d),
                        bulge=math.copysign(math.tan(sweep/4), turn), sweep=sweep, r=rr, turn=turn, p=p1, ua=ua, ub=ub))
    bulge_pts, sampled = [], []
    for f in fil:
        bulge_pts.append((*f["t1"], f["bulge"])); bulge_pts.append((*f["t2"], 0.0))
        # sample the arc: centre lies along the corner bisector
        bis = (f["ua"][0] + f["ub"][0], f["ua"][1] + f["ub"][1]); lb_ = math.hypot(*bis)
        if f["sweep"] < 1e-6 or lb_ < 1e-12:
            sampled += [f["t1"], f["t2"]]; continue
        bis = (bis[0]/lb_, bis[1]/lb_)
        th = math.pi - f["sweep"]
        cd = f["r"]/math.sin(th/2)
        c = (f["p"][0] + bis[0]*cd, f["p"][1] + bis[1]*cd)
        a1 = math.atan2(f["t1"][1] - c[1], f["t1"][0] - c[0]); a2 = math.atan2(f["t2"][1] - c[1], f["t2"][0] - c[0])
        da = (a2 - a1 + math.pi) % (2*math.pi) - math.pi
        k = max(2, int(abs(da)/math.radians(10)) + 1)
        sampled += [(c[0] + f["r"]*math.cos(a1 + da*j/k), c[1] + f["r"]*math.sin(a1 + da*j/k)) for j in range(k + 1)]
    return bulge_pts, sampled

def clean_ring(pts, tol=1e-3):
    """Drop vertices that are collinear with their neighbours or double back (zero-width spikes)."""
    pts = list(pts)
    changed = True
    while changed and len(pts) > 3:
        changed = False
        for i in range(len(pts)):
            p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
            if math.dist(p0, p1) < tol:
                pts.pop(i); changed = True; break
            cross = (p1[0] - p0[0])*(p2[1] - p1[1]) - (p1[1] - p0[1])*(p2[0] - p1[0])
            if abs(cross) < tol*max(1e-9, math.dist(p0, p1) + math.dist(p1, p2)):
                pts.pop(i); changed = True; break
    return pts

def ccw(pts):
    area = sum(pts[i][0]*pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0]*pts[i][1] for i in range(len(pts)))
    return pts if area > 0 else pts[::-1]

def rect_pts(cx, cy, along_deg, L, W):
    c = [(-L/2, -W/2), (L/2, -W/2), (L/2, W/2), (-L/2, W/2)]
    ca, sa = math.cos(math.radians(along_deg)), math.sin(math.radians(along_deg))
    return [(cx + x*ca - y*sa, cy + x*sa + y*ca) for x, y in c]

# ---------------------------------------------------------------- layout
def gap_clearance(wh, deg, w_tip, r_end, depth=60.0):
    """Sideways room for a tip of width w_tip centred at angle deg: distance from a radial strip
    (r_end - depth .. r_end) to the nearest spoke, in plan."""
    strip = rot(box(r_end - depth, -w_tip/2, r_end, w_tip/2), deg)
    return min(LineString([s.p0[:2], s.p1[:2]]).distance(strip) for s in wh.spokes) - wh.p["spoke_d"]/2

def even_tip_angles(wh, n, w_tip, r_end, step=0.05):
    """Exactly even spacing (360/n). Rotate the whole star to give the tips the most room
    between spokes; ties broken by distance from the valve."""
    best = None
    k = 0
    while k*step < 360/n:
        a0 = k*step
        angs = [(a0 + j*360/n) % 360 for j in range(n)]
        c = min(gap_clearance(wh, a, w_tip, r_end) for a in angs)
        key = (round(c, 2), min(adiff(a, wh.valve_deg()) for a in angs))
        if best is None or key > best[0]:
            best = (key, angs)
        k += 1
    return sorted(best[1])

def tip_angles(wh, n, w_tip=30.0, r_end=290.0, want_clear=4.0):
    """Arm angles. Every tip sits in a gap between two rim holes (between spokes). Among all
    choices of n gaps, keep those whose tips clear the spokes by want_clear (else the best
    available), then take the one closest to evenly spaced, then farthest from the valve."""
    import itertools
    H, pitch = wh.p["spokes"], wh.hole_pitch
    mids = [(k + 0.5)*pitch for k in range(H)]
    clear = [gap_clearance(wh, m, w_tip, r_end) for m in mids]
    best = None
    for combo in itertools.combinations(range(H), n):
        angs = [mids[k] for k in combo]
        spac = [((angs[(i + 1) % n] - angs[i]) % 360) for i in range(n)]
        err = max(abs(sp - 360/n) for sp in spac)
        cmin = min(clear[k] for k in combo)
        valve = min(adiff(a, wh.valve_deg()) for a in angs)
        key = (0 if cmin >= want_clear else 1, round(err, 6), -cmin if cmin < want_clear else 0, -valve)
        if best is None or key < best[0]:
            best = (key, angs)
    return sorted(best[1])

def row_offset(pp):
    hole = pp["tie_w"] + pp["tie_clear"]
    return pp["strip_w"]/2 if pp["rows_on_strip_edges"] else pp["strip_w"]/2 + pp["grid_strip_gap"] + hole/2

def pitch_y(pp):
    return pp["grid_pitch_y"] or pp["strip_w"]

def tip_width(pp):
    """Narrowest the blade can be: strip + (gap, hole, edge) on each side."""
    hole = pp["tie_w"] + pp["tie_clear"]
    return math.ceil(2*(row_offset(pp) + hole/2 + pp["grid_edge"]))

def tip_slot_polys(pp, arms, rho_end):
    """Nipple slots cut into the tip ends (open at the end), one per arm."""
    if not pp.get("_slot"): return []
    w, depth = pp["_slot"]
    return [rot(box(rho_end - depth, -w/2, rho_end + 10, w/2), a) for a in arms]

def has_plate_(pp, side):
    return pp["plate"] and (pp["plate_side"] == "both" or side == pp["plate_side"])

def flat_geometry(wh, pp, side, arms, rho_end):
    """The panel as cut (flat). For two collinear blades the outline follows the hole lattice:
    plate edges sit grid_edge outside a lattice column/row, and the tip end is placed so the gap
    beyond the last hole equals the gap from the first hole to the bore (never longer than asked)."""
    collinear = len(arms) == 2 and adiff(arms[0] + 180, arms[1]) < 1e-6
    if not collinear:
        if len(arms) >= 3 and pp.get("push_out") and pp["plate"]:
            return _flat_star(wh, pp, side, arms, rho_end)
        return _flat_core(wh, pp, side, arms, rho_end)
    hole = pp["tie_w"] + pp["tie_clear"]
    step = pp["holes_every"]*pp["led_pitch"]
    y_row = row_offset(pp)
    edge = pp["grid_edge"]
    if pp.get("push_out"):
        # one lattice, phase 0, centre column removed; each half slides outward by the same amount
        # (the plate end moves with its holes, the taper still ends at plate_taper_end)
        cols = [y_row + k*pitch_y(pp) + hole/2 + edge for k in range(12)]
        W = max(v for v in cols if v <= pp["plate_half_w"] + step/2)
        L = min((i*step + hole/2 + edge for i in range(1, 60)), key=lambda v: abs(v - pp["plate_len"]))
        def rows_n(g): return sum(1 for x in g["hole_rhos"])
        g0 = _flat_core(wh, pp, side, arms, rho_end, L, W, 0.0, 0.0)
        n0 = rows_n(g0)
        s = max(0.0, rho_end - edge - hole/2 - g0["hole_rhos"][-1])     # last row hole lands grid_edge from the tip
        s = min(s, step - 1e-3)
        while s > 0:
            g = _flat_core(wh, pp, side, arms, rho_end, L + s, W, 0.0, s)
            if rows_n(g) >= n0: break
            s = max(0.0, s - 0.05)
        else:
            g = g0
        s = math.floor(s*100)/100
        g = _flat_core(wh, pp, side, arms, rho_end, L + s, W, 0.0, s)
        if has_plate_(pp, side) and pp.get("plate_taper_cols"):
            # steepest taper that still keeps the target hole of the second row grid_edge inside the edge
            yt = y_row + pitch_y(pp)
            x_flat = L + s - hole/2 - edge                       # last column of the full-width plate
            xt = x_flat + pp["plate_taper_cols"]*step
            def has(gg, x):      # hole present AND its square (sharp corners: conservative) a full grid_edge from the outline
                if not any(abs(hx - x) < 1e-6 and abs(abs(hy) - yt) < 1e-6 for hx, hy in gg["hole_xy"]): return False
                sq = rot(box(x - hole/2, yt - hole/2, x + hole/2, yt + hole/2), arms[0])
                return gg["body"].exterior.distance(sq) >= edge
            lo, hi = xt, pp["plate_taper_end"] or rho_end
            if has(_flat_core(wh, {**pp, "plate_taper_end": hi}, side, arms, rho_end, L + s, W, 0.0, s), xt):
                for _ in range(18):
                    mid = (lo + hi)/2
                    if has(_flat_core(wh, {**pp, "plate_taper_end": mid}, side, arms, rho_end, L + s, W, 0.0, s), xt): hi = mid
                    else: lo = mid
                te = math.ceil(hi*10)/10
                g = _flat_core(wh, {**pp, "plate_taper_end": te}, side, arms, rho_end, L + s, W, 0.0, s)
                g["taper_end"] = te
        g["grid_shift"] = s
        return g
    best = None
    for phase in (0.0, 0.5):
        cols = [y_row + k*pitch_y(pp) + hole/2 + edge for k in range(12)]
        W = max(v for v in cols if v <= pp["plate_half_w"] + step/2)
        L = min(((i + phase)*step + hole/2 + edge for i in range(60) if (i + phase)*step > 0),
                key=lambda v: abs(v - pp["plate_len"]))
        g1 = _flat_core(wh, pp, side, arms, rho_end, L, W, phase)
        end = g1["hole_rhos"][-1] + hole/2 + g1["equal_gap"][0]
        if end > rho_end + 0.5:          # would overshoot the tip target: keep the asked length
            end = rho_end
        g2 = _flat_core(wh, pp, side, arms, end, L, W, phase)
        key = (round(rho_end - end, 3), -len(g2["cuts_bulge"]))
        if best is None or key < best[0]:
            best = (key, g2)
    return best[1]

def _flat_star(wh, pp, side, arms, rho_end):
    """3 or more blades with the same pattern as the 2-blade part: every blade is the 2-blade design's
    blade (plate, fitted taper, rows on the strip edges pushed out to the tip). Blades are joined at the
    hub; each hole belongs to the blade whose axis it is nearest, and where two blades' grids meet a
    hole is dropped if it would leave less than grid_edge of material to a hole of the other blade."""
    n = len(arms)
    g2 = flat_geometry(wh, pp, side, [0.0, 180.0], rho_end)       # the reference blade (local frame)
    hole = pp["tie_w"] + pp["tie_clear"]; edge = pp["grid_edge"]; cr = pp["cut_corner_r"]
    E, wt, w0 = g2["rho_end"], g2["w_tip"], g2["w0"]
    L, W = g2["plate_LW"]; c = g2["plate_c"]
    def hw_arm(rho): return (w0 - (w0 - wt)*max(0.0, min(1.0, rho/E)))/2
    h1 = hw_arm(L + c)
    petal = unary_union([Polygon([(0, hw_arm(0)), (E, wt/2), (E, -wt/2), (0, -hw_arm(0))]),
                         Polygon([(0, -W), (L, -W), (L + c, -h1), (L + c, h1), (L, W), (0, W)])])
    # hub: straight edges joining neighbouring plate corners, so no slots are left between the plates
    hub = Polygon([pt for a in arms for pt in (rot(Point(L, -W), a).coords[0], rot(Point(L, W), a).coords[0])]).convex_hull
    star = unary_union([rot(petal, a) for a in arms] + [hub])
    for sl in tip_slot_polys(pp, arms, E): star = star.difference(sl)
    star = star.simplify(1e-6)
    outline_pts = ccw(clean_ring(list(star.exterior.coords)[:-1]))
    outline_bulge, outline_sampled = fillet_ring(outline_pts, pp["corner_r"])
    r_bore = g2["r_bore"]
    body = Polygon(outline_sampled).difference(disk(r_bore))
    safe_outer = prep(Polygon(outline_sampled).buffer(-(edge - 0.05)))
    # half-angles to the neighbouring blades (ccw and cw)
    srt = sorted(a % 360 for a in arms)
    half = {}
    for i, a in enumerate(srt):
        half[a] = (((srt[(i + 1) % n] - a) % 360)/2, ((a - srt[i - 1]) % 360)/2)
    cand = []
    for a in srt:
        hp, hm = half[a]
        for x, y in g2["hole_xy"]:
            if x <= 1e-6: continue
            off = math.degrees(math.atan2(y, x))
            frac = off/hp if off >= 0 else -off/hm
            if frac >= 1 - 1e-9: continue                          # nearer another blade's axis
            bp, sp = fillet_ring(ccw(rect_pts(*rot(Point(x, y), a).coords[0], a, hole, hole)), cr)
            q = Polygon(sp)
            if not safe_outer.contains(q) or q.distance(Point(0, 0)) - r_bore < pp["bore_edge"] - 0.01: continue
            cand.append(dict(a=a, x=x, y=y, frac=round(frac, 6), bp=bp, q=q))
    drop = set()
    for i in range(len(cand)):
        for j in range(i + 1, len(cand)):
            A, B = cand[i], cand[j]
            if A["a"] == B["a"] or A["q"].distance(B["q"]) >= edge - 1e-6: continue
            if A["frac"] >= B["frac"]: drop.add(i)
            if B["frac"] >= A["frac"]: drop.add(j)
    keep = [h for k, h in enumerate(cand) if k not in drop]
    cuts_bulge = [h["bp"] for h in keep]; cut_polys = [h["q"] for h in keep]
    shape = body.difference(unary_union(cut_polys))
    leds, sensors = [], []
    for a in arms:
        leds.append(rot(LineString([(g2["rho_led0"], 0), (g2["rho_led1"], 0)]), a))
        if pp["sensor"] and side == pp["sensor_side"]:
            bl, bw = pp["sensor_board"]
            sensors.append(rot(box(pp["sensor_r"] - bl/2, -bw/2, pp["sensor_r"] + bl/2, bw/2), a))
    # hub section of each blade: across the blade at the contact ring, within the blade's own sector
    rc = (wh.p["pcd_left"] if side < 0 else wh.p["pcd_right"])/2
    nets = []
    for a in srt:
        hp, hm = half[a]
        line = LineString([(rc, -rc*math.tan(math.radians(min(hm, 89)))), (rc, rc*math.tan(math.radians(min(hp, 89))))])
        nets.append(shape.intersection(rot(line, a)).length)
    g = dict(g2)
    g.update(net_w_center=min(nets), n_rejected=len(drop), n_grid=sum(1 for h in keep if abs(abs(h["y"]) - g2["y_row"]) > 1e-6),
             shape=shape, body=body, leds=leds, sensors=sensors, outline_bulge=outline_bulge, cuts_bulge=cuts_bulge,
             hole_xy=None, star=True, holes_dropped_overlap=len(drop),
             holes_per_blade=[sum(1 for h in keep if h["a"] == a) for a in srt])
    return g

def _flat_core(wh, pp, side, arms, rho_end, L_snap=None, W_snap=None, phase_fix=None, shift=0.0):
    """The panel as cut (flat). rho = distance from the centre along the flat sheet."""
    r_bore = pp["bore_d"]/2
    w_tip = tip_width(pp)
    # w_center must keep hub_w of material between neighbouring arms round the bore
    n = len(arms)
    min_gap = min(((arms[(i + 1) % n] - arms[i]) % 360) for i in range(n)) if n > 1 else 360
    need = r_bore + pp["hub_w"]
    w0 = pp["w_center"]
    if n > 2:
        w0 = max(w0, 2*need*math.sin(math.radians(min_gap/2)) + 2)
    else:
        w0 = max(w0, 2*need + 2)
    def hw_arm(rho):
        return (w0 - (w0 - w_tip)*max(0.0, min(1.0, rho/rho_end)))/2
    quads = [rot(Polygon([(0, hw_arm(0)), (rho_end, w_tip/2), (rho_end, -w_tip/2), (0, -hw_arm(0))]), a) for a in arms]
    has_plate = pp["plate"] and (pp["plate_side"] == "both" or side == pp["plate_side"])
    L, W, c = pp["plate_len"], pp["plate_half_w"], pp["plate_taper"]
    if L_snap is not None: L = L_snap
    if W_snap is not None: W = W_snap
    if pp.get("plate_taper_end"): c = pp["plate_taper_end"] - L
    if has_plate:     # straight-edged plate along arm 0's axis (and the opposite blade for 2 strips)
        h1 = hw_arm(L + c)
        pts = [(-L, -W), (L, -W), (L + c, -h1), (L + c, h1), (L, W), (-L, W), (-L - c, h1), (-L - c, -h1)]
        quads.append(rot(Polygon(pts).convex_hull, arms[0]))
    def hw(rho):     # half-width that bends with the blade (plate included)
        h = hw_arm(rho)
        if has_plate:
            if rho <= L: h = max(h, W)
            elif rho <= L + c: h = max(h, W - (W - hw_arm(L + c))*(rho - L)/c)
        return h
    star = unary_union(quads)
    for sl in tip_slot_polys(pp, arms, rho_end): star = star.difference(sl)
    star = star.simplify(1e-6)                                         # straight-edged outline
    outline_pts = ccw(clean_ring(list(star.exterior.coords)[:-1]))
    outline_bulge, outline_sampled = fillet_ring(outline_pts, pp["corner_r"])
    body = Polygon(outline_sampled).difference(disk(r_bore))
    cr = pp["cut_corner_r"]
    hole = pp["tie_w"] + pp["tie_clear"]                          # square hole: a tie fits either way
    pitch = pp["led_pitch"]
    rho_led1 = rho_end - 2                                        # strip runs to the tip
    if pp.get("_slot"): rho_led1 = min(rho_led1, rho_end - pp["_slot"][1] - 1.0)   # ...or stops short of the nipple
    # Tie holes. Two collinear blades: ONE lattice for the whole part (pitch = holes_every LED pixels
    # in both directions, symmetric about the centre, columns either side of an LED-strip lane), so
    # holes on both blades and the plate all line up and ties across the strip land between LEDs.
    # A hole is kept only if it sits at least grid_edge inside every edge and the bore.
    # Other layouts: each blade gets its own two rows, placed for equal gaps at the bore and the tip.
    step = pp["holes_every"]*pitch
    y_row = row_offset(pp)
    edge = pp["grid_edge"]
    safe = prep(body.buffer(-(edge - 0.05)))  # body excludes the bore, so this keeps edge from it too (0.05 mm tolerance)
    safe_outer = prep(Polygon(outline_sampled).buffer(-(edge - 0.05)))   # outer edge only
    def hole_ok(x, y, a):
        q = hole_poly(x, y, a)[1]
        return safe_outer.contains(q) and q.distance(Point(0, 0)) - r_bore >= pp["bore_edge"] - 0.01
    def hole_poly(rho, y, a):
        bp, sp = fillet_ring(ccw(rect_pts(*rot(Point(rho, y), a).coords[0], a, hole, hole)), cr)
        return bp, Polygon(sp)
    leds, sensors, cuts_bulge, cut_polys = [], [], [], []
    n_grid = 0
    collinear = len(arms) == 2 and adiff(arms[0] + 180, arms[1]) < 1e-6
    if collinear:
        half_w = max(hw(0), w0/2) + 1
        best = None
        for phase in ((0.0, 0.5) if phase_fix is None else (phase_fix,)):
            imax = int(rho_end//step) + 2
            xs = []
            for i in range(-imax, imax + 1):
                x = (i + phase)*step
                if abs(x) < 1e-9:
                    if pp.get("center_col", True): xs.append(0.0)
                else:
                    xs.append(x + math.copysign(shift, x))
            ys, k = [], 0
            py = pitch_y(pp)
            while y_row + k*py - hole/2 < half_w:
                ys += [y_row + k*py, -(y_row + k*py)]; k += 1
            holes = [(x, y) for x in xs for y in ys if hole_ok(x, y, arms[0])]
            row_pos = sorted(x for x, y in holes if abs(y - y_row) < 1e-6 and x > 0)
            if not row_pos: continue
            gap_tip = rho_end - (row_pos[-1] + hole/2)
            gap_bore = min(hole_poly(x, y, arms[0])[1].distance(Point(0, 0)) for x, y in holes if abs(abs(y) - y_row) < 1e-6) - r_bore
            key = (abs(gap_tip - gap_bore), -len(holes))
            if best is None or key < best[0]:
                best = (key, holes, row_pos, (gap_bore, gap_tip), phase)
        _, holes, hole_rhos, equal_gap, lattice_phase = best
        for x, y in holes:
            bp, q = hole_poly(x, y, arms[0])
            cuts_bulge.append(bp); cut_polys.append(q)
            if abs(abs(y) - y_row) > 1e-6: n_grid += 1
    else:
        lattice_phase = None
        def gap_in(rho):  return hole_poly(rho, y_row, 0)[1].distance(Point(0, 0)) - r_bore
        def gap_out(rho): return rho_end - (rho + hole/2)
        def fits(rhos):
            for rho in rhos:
                qs = [hole_poly(rho, y, a)[1] for a in arms for y in (y_row, -y_row)]
                if not all(safe.contains(q) for q in qs): return False
            inner = [hole_poly(rhos[0], y, a)[1] for a in arms for y in (y_row, -y_row)]
            return all(inner[i].distance(inner[j]) >= edge for i in range(len(inner)) for j in range(i + 1, len(inner)))
        hole_rhos, equal_gap = None, None
        n = int((rho_end - r_bore)//step) + 1
        while n >= 2 and hole_rhos is None:
            span = (n - 1)*step
            lo, hi = r_bore, rho_end - span
            for _ in range(60):
                mid = (lo + hi)/2
                if gap_in(mid) < gap_out(mid + span): lo = mid
                else: hi = mid
            rhos = [lo + k*step for k in range(n)]
            if min(gap_in(rhos[0]), gap_out(rhos[-1])) >= edge and fits(rhos):
                hole_rhos, equal_gap = rhos, (gap_in(rhos[0]), gap_out(rhos[-1]))
            n -= 1
        for a in arms:
            for rho in hole_rhos:
                for y in (y_row, -y_row):
                    bp, q = hole_poly(rho, y, a)
                    cuts_bulge.append(bp); cut_polys.append(q)
    # LED strip: pixel boundaries on the hole centres, starting just outside the bore
    rho_led0 = hole_rhos[0] - pitch*math.floor((hole_rhos[0] - r_bore - pp["strip_start_gap"])/pitch)
    rho_tie = hole_rhos[-1]                                       # outermost pair: tip-to-tip ties
    for a in arms:
        leds.append(rot(LineString([(rho_led0, 0), (rho_led1, 0)]), a))
        if pp["sensor"] and side == pp["sensor_side"]:                         # board under the blade (inner face)
            bl, bw = pp["sensor_board"]
            sensors.append(rot(box(pp["sensor_r"] - bl/2, -bw/2, pp["sensor_r"] + bl/2, bw/2), a))
    cut_rects = cut_polys
    shape = body.difference(unary_union(cut_polys))
    n_rejected = len(cut_rects) - len(cut_polys)
    # net material across the blade axis at the centre (through the bore): carries the hub bending moment
    cross = rot(LineString([(0, -400), (0, 400)]), arms[0])
    net_w_center = shape.intersection(cross).length
    return dict(net_w_center=net_w_center, n_rejected=n_rejected, n_grid=n_grid, has_plate=has_plate, lattice_phase=lattice_phase,
                hole_xy=holes if collinear else None,
                plate_LW=(round(L, 2), round(W, 2)) if has_plate else None, plate_c=round(c, 2) if has_plate else None, shape=shape, body=body, leds=leds, sensors=sensors, hw=hw, w0=w0, w_tip=w_tip,
                outline_bulge=outline_bulge, cuts_bulge=cuts_bulge, hole_rhos=hole_rhos, y_row=y_row, equal_gap=equal_gap,
                r_bore=r_bore, rho_end=rho_end, rho_tie=rho_tie, rho_led0=rho_led0, rho_led1=rho_led1,
                n_leds=int((rho_led1 - rho_led0)//pp["led_pitch"]))

# ---------------------------------------------------------------- mechanics
def mechanics(wh, pp, side, g, z_m=0.0):
    """Each arm is a tapered cantilever from the contact ring (spoke heads) to the tip ties,
    integrated along its own length rho, with a little extra rotation from the hub region.
    Returns tip force, clamp, stress, and the bent shape: plan radius r(rho) and height z(rho)."""
    t, E = pp["thickness"], pp["E"]
    c2f = wh.p["c2f_left"] if side < 0 else wh.p["c2f_right"]
    pcd = wh.p["pcd_left"] if side < 0 else wh.p["pcd_right"]
    z_contact = c2f + wh.p["flange_t"]/2 + max(wh.p["head_h"], wh.p["spoke_d"])
    rc, rt = pcd/2, g["rho_tie"]
    z0, z_tip = z_contact + t/2, side*z_m + t/2   # tips' inner faces meet in the plane z = z_m
    Lm = rt - rc
    I = lambda rho: 2*g["hw"](rho)*t**3/12
    I_hub = 2*g["hw"](0)*t**3/12
    d = 0.25
    rhos = [rc + k*d for k in range(int(Lm/d) + 1)]
    slope, w, ws, sl = Lm*rc/(E*I_hub), 0.0, [], []
    for rho in rhos:                                   # unit tip load, small-slope beam
        ws.append(w); sl.append(slope)
        slope += (rt - rho)/(E*I(rho))*d
        w += slope*d
    F = (z0 - z_tip)/ws[-1]
    # bent shape: walk along the arm with the actual slope angle
    r_plan, z_mid, r, z = [], [], rc, z0
    for k, rho in enumerate(rhos):
        r_plan.append(r); z_mid.append(z)
        phi = math.atan(F*sl[k])
        r += math.cos(phi)*d; z -= math.sin(phi)*d
    # past the tie point (tip end) continue straight at the end slope
    sig = [(rho, 6*F*(rt - rho)/(2*g["hw"](rho)*t*t)) for rho in rhos[::8]]
    sig_hub = 6*F*Lm/(g["net_w_center"]*t*t)    # through the bore and the holes in line with it
    def plan_r(rho):
        if rho <= rc: return rho
        k = min(len(rhos) - 1, int((rho - rc)/d))
        extra = max(0.0, rho - rhos[-1])
        return r_plan[k] + extra*math.cos(math.atan(F*sl[-1]))
    def z_at_rho(rho):
        if rho <= rc: return z0
        k = min(len(rhos) - 1, int((rho - rc)/d))
        extra = max(0.0, rho - rhos[-1])
        return z_mid[k] - extra*math.sin(math.atan(F*sl[-1]))
    def z_at_r(r):                                     # height of the panel at plan radius r
        if r <= rc: return z0
        k = bisect.bisect_left(r_plan, r)
        if k >= len(r_plan): return z_mid[-1] - (r - r_plan[-1])*math.tan(math.atan(F*sl[-1]))
        return z_mid[k]
    return dict(sigma_hub=sig_hub, F_tip_N=F, compliance=ws[-1], z_tip=z_tip, clamp_N=F*pp["strips"], z_contact=z_contact, r_contact=rc, z0=z0,
                plan_r=plan_r, z_at_rho=z_at_rho, z_mid=z_at_r, tip_plan_r=plan_r(rt),
                shortening=rt - plan_r(rt), sigma_max=max(max(s for _, s in sig), sig_hub),
                sigma_at=[(round(r), round(s, 1)) for r, s in sig[::4]])

def to_plan(geom, m):
    """Map flat-sheet geometry to where it sits on the wheel (plan view), radius rho -> r(rho)."""
    def f(xs, ys, zs=None):
        X, Y = [], []
        for x, y in zip(xs, ys):
            rho = math.hypot(x, y)
            k = m["plan_r"](rho)/rho if rho > 1e-9 else 1.0
            X.append(x*k); Y.append(y*k)
        return X, Y
    return transform(f, segmentize(geom, 2.0))

def sandwich_report(wh, pp, side, m, plan_body, i, g):
    """The spoke clamped between the tips of one blade: where it meets this panel's inner face
    (model: tips meet in the centre plane) and how much room it has inside that."""
    t, d = pp["thickness"], wh.p["spoke_d"]
    s = wh.spokes[i]; body = prep(plan_body)
    pts = []
    for k in range(1, 1200):
        x, y, z = s.at(k/1200); r = math.hypot(x, y)
        if r < m["r_contact"] + 6 or not body.contains(Point(x, y)): continue
        pts.append((r, abs(z - side*m["z_mid"](r)) - t/2 - d/2))
    touch = [r for r, gp in pts if gp < 0]
    r_t = min(touch) if touch else None
    inside = [gp for r, gp in pts if r_t is None or r < r_t - 5]
    rt = m["plan_r"](g["rho_tie"])
    lo, hi = 0.0, 1.0
    for _ in range(50):
        mid = (lo + hi)/2
        if math.hypot(*s.at(mid)[:2]) < rt: lo = mid
        else: hi = mid
    z_tie = s.at(lo)[2]
    return dict(rim_hole=i, spoke_side="L" if s.side < 0 else "R", own_side=(s.side == side),
                spoke_offset_at_ties_mm=round(z_tie, 2),
                meets_panel_from_r=round(r_t, 1) if r_t else None,
                min_gap_inside_mm=round(min(inside), 2) if inside else None)

def clearances(wh, pp, side, g, m, plan_body, skip=()):
    t, d = pp["thickness"], wh.p["spoke_d"]
    body = prep(plan_body)
    zones = {"seat": (1e9, None), "arms": (1e9, None), "tips": (1e9, None)}
    collisions = 0
    r_seat = m["r_contact"] + 6
    r_tipzone = m["tip_plan_r"] - 40
    for s in wh.spokes:
        if s.i in skip: continue
        for k in range(1, 600):
            x, y, z = s.at(k/600)
            r = math.hypot(x, y)
            if r < g["r_bore"] or not body.contains(Point(x, y)):
                continue
            gap = abs(z - side*m["z_mid"](r)) - t/2 - d/2
            if gap < 0: collisions += 1
            zone = "seat" if r < r_seat else "tips" if r > r_tipzone else "arms"
            if gap < zones[zone][0]:
                zones[zone] = (gap, dict(spoke_hole=s.i, spoke_side="L" if s.side < 0 else "R", r=round(r, 1)))
    out = {f"{k}_min_gap_mm": round(v[0], 2) if v[1] else None for k, v in zones.items()}
    out["collision_points"] = collisions
    tipzone = plan_body.difference(disk(r_tipzone))
    out["tips_side_clear_mm"] = round(min(LineString([s.p0[:2], s.p1[:2]]).distance(tipzone) for s in wh.spokes if s.i not in skip) - d/2, 1)
    vals = [out[k] for k in ("arms_min_gap_mm", "tips_min_gap_mm", "tips_side_clear_mm") if out[k] is not None]
    out["min_gap_mm"] = min(vals)
    return out

def fork_clearance(wh, pp, side, g, m):
    """Outer side of the bent panel vs a straight fork blade from the dropout (OLD/2) to the crown.
    Two checks: the bare panel face (every outline point) and the LED lane, where the strip
    (strip_t) plus a tie band over it (tie_t) stand proud of the face. Tie heads are on the inner
    face (or beside the strip, lower than the strip + band), so they don't raise the outside."""
    old = wh.p["old"]/2
    def fork_z(r): return old - (old - pp["fork_crown_half"])*min(1.0, r/pp["fork_crown_r"])
    t = pp["thickness"]
    stack = pp["strip_t"] + pp["tie_t"]
    face = (1e9, None)
    for x, y in segmentize(g["body"], 3.0).exterior.coords:
        rho = math.hypot(x, y); r = m["plan_r"](rho)
        c = fork_z(r) - (m["z_at_rho"](rho) + t/2)
        if c < face[0]: face = (c, dict(r=round(r, 1), panel_outer_z=round(m["z_at_rho"](rho) + t/2, 1), fork_z=round(fork_z(r), 1)))
    lane = (1e9, None)
    k = 0
    while g["rho_led0"] + k*1.0 <= g["rho_led1"]:
        rho = g["rho_led0"] + k*1.0; k += 1
        r = m["plan_r"](rho); zo = m["z_at_rho"](rho) + t/2 + stack
        c = fork_z(r) - zo
        if c < lane[0]: lane = (c, dict(r=round(r, 1), strip_outer_z=round(zo, 1), fork_z=round(fork_z(r), 1)))
    gov = "LED strip + tie band" if lane[0] <= face[0] else "panel face"
    return dict(min_mm=round(min(face[0], lane[0]), 1), governed_by=gov,
                panel_face_mm=round(face[0], 1), led_strip_mm=round(lane[0], 1),
                stack_on_face_mm=round(stack, 2), where=lane[1] if lane[0] <= face[0] else face[1])

def tie_head_check(wh, pp, side, g, m, arms, skip=()):
    """Tie heads on the INNER face, across the LED lane at every tie position (not the tip-to-tip ties):
    room between the head and the spokes below it. Returns the tightest and the positions that don't fit."""
    hw_, hl_, hh = pp["tie_head"]
    t, d = pp["thickness"], wh.p["spoke_d"]
    out, worst = [], (1e9, None)
    for a in arms:
        for rho in g["hole_rhos"][:-1]:
            foot = to_plan(rot(box(rho - hw_/2, -hl_/2, rho + hw_/2, hl_/2), a), m)
            pf = prep(foot)
            best = 1e9
            for sp in wh.spokes:
                if sp.side != side or sp.i in skip: continue
                if not LineString([sp.p0[:2], sp.p1[:2]]).intersects(foot): continue
                for kk in range(1, 400):
                    x, y, z = sp.at(kk/400)
                    if not pf.contains(Point(x, y)): continue
                    r = math.hypot(x, y)
                    gap = abs(z - side*m["z_mid"](r)) - t/2 - d/2 - hh
                    best = min(best, gap)
            if best < 1e8:
                r_plan = round(m["plan_r"](rho), 1)
                if best < worst[0]: worst = (best, dict(blade_deg=round(a, 2), r=r_plan))
                if best < 0: out.append(dict(blade_deg=round(a, 2), r=r_plan, gap_mm=round(best, 2)))
    return dict(head_mm=[hw_, hl_, hh], tightest_mm=round(worst[0], 2) if worst[1] else None, where=worst[1],
                move_outside=out, n_move_outside=len(out))

def room_tables(wh, pp, side, m):
    t, d = pp["thickness"], wh.p["spoke_d"]
    rows = {}
    for r in (40, 60, 80, 100, 130, 160, 200, 240, 270):
        zs = []
        for s in wh.side_spokes(side):
            r0, r1 = math.hypot(*s.p0[:2]), math.hypot(*s.p1[:2])
            if r0 < r < r1:
                lo, hi = 0.0, 1.0
                for _ in range(40):
                    mid = (lo + hi)/2
                    if math.hypot(*s.at(mid)[:2]) < r: lo = mid
                    else: hi = mid
                zs.append(abs(s.at(lo)[2]) + d/2)
        if zs:
            rows[r] = dict(panel_to_spokes=round(m["z_mid"](r) - t/2 - max(zs), 1),
                           outer_face_z=round(m["z_mid"](r) + t/2, 1))
    return rows

# ---------------------------------------------------------------- export
def polys(shape):
    for g in getattr(shape, "geoms", [shape]):
        if not g.is_empty:
            yield g

def best_cut_rot(g):
    """Rotation (deg) that gives the part its smallest bounding box on the sheet."""
    pts = [(p[0], p[1]) for p in g["outline_bulge"]]
    best = None
    for k in range(0, 720):
        a = math.radians(k*0.25); c, s_ = math.cos(a), math.sin(a)
        xs = [x*c - y*s_ for x, y in pts]; ys = [x*s_ + y*c for x, y in pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        key = (round(w*h, 1), -h)
        if best is None or key < best[0]: best = (key, k*0.25, w, h)
    rot_ = best[1]
    return (rot_ + 90) % 360 if best[2] > best[3] else rot_, sorted((best[2], best[3]))

def write_cut_dxf(g, path):
    """SendCutSend: 1:1, inches, single layer "0", closed outlines only: straight lines and true
    circular arcs (LWPOLYLINE bulges) plus one CIRCLE for the bore. Nothing else in the file."""
    doc = ezdxf.new("R2010"); doc.units = ezdxf.units.IN
    msp = doc.modelspace()
    k = 1/25.4
    th = math.radians(g.get("cut_rot", 0.0)); cs, sn = math.cos(th), math.sin(th)
    def R(p): return (p[0]*cs - p[1]*sn, p[0]*sn + p[1]*cs, p[2])
    g = dict(g, outline_bulge=[R(p) for p in g["outline_bulge"]], cuts_bulge=[[R(p) for p in cb] for cb in g["cuts_bulge"]])
    xs = [p[0] for p in g["outline_bulge"]]; ys = [p[1] for p in g["outline_bulge"]]
    ox, oy = -min(xs) + 2, -min(ys) + 2           # 2 mm margin, all coordinates positive
    def T(p): return ((p[0] + ox)*k, (p[1] + oy)*k, p[2])
    msp.add_lwpolyline([T(p) for p in g["outline_bulge"]], format="xyb", close=True, dxfattribs={"layer": "0"})
    for cb in g["cuts_bulge"]:
        msp.add_lwpolyline([T(p) for p in cb], format="xyb", close=True, dxfattribs={"layer": "0"})
    msp.add_circle(((0 + ox)*k, (0 + oy)*k), g["r_bore"]*k, dxfattribs={"layer": "0"})
    doc.saveas(path)

def write_reference_dxf(parts, path):
    doc = ezdxf.new("R2010", setup=True); doc.units = ezdxf.units.MM
    for n, c in (("OUTLINE", 7), ("LED_STRIP", 30), ("SENSOR_UNDER", 6), ("NOTES", 3)):
        doc.layers.add(n, color=c)
    msp = doc.modelspace()
    for dx, label, g in parts:
        for poly in polys(affinity.translate(g["shape"], dx, 0)):
            for ring in [poly.exterior] + list(poly.interiors):
                msp.add_lwpolyline(list(ring.coords), close=True, dxfattribs={"layer": "OUTLINE"})
        for l in g["leds"]:
            msp.add_lwpolyline(list(affinity.translate(l, dx, 0).coords), dxfattribs={"layer": "LED_STRIP"})
        for s in g["sensors"]:
            msp.add_lwpolyline(list(affinity.translate(s, dx, 0).exterior.coords), close=True, dxfattribs={"layer": "SENSOR_UNDER"})
        msp.add_text(label, dxfattribs={"layer": "NOTES", "height": 8}).set_placement((dx - 60, -g["rho_end"] - 30))
    doc.saveas(path)

# ---------------------------------------------------------------- run
def build(wheel_over=None, panel_over=None, out="out"):
    wp = {**WHEEL, **(wheel_over or {})}
    po = panel_over or {}
    mat = po.get("material", PANEL["material"])
    pp = {**PANEL, **MATERIALS[mat], **po}
    size = wp.pop("size")
    wh = Wheel(**{**WHEEL_PRESETS[size], **wp})
    w_tip_ = tip_width(pp)
    rim_note = ""
    if pp.get("tip_end_r"):     # measured tip position: make sure the modelled rim sits outside it
        need = math.hypot(pp["tip_end_r"], w_tip_/2) + pp["tip_clear"]
        if wh.p["rim_wall_r"] < need:
            wh = Wheel(**{**WHEEL_PRESETS[size], **wp, "rim_wall_r": need, "erd": 2*(need + 4)})
            rim_note = f"rim wall assumed at r = {need:.1f} mm (just outside the measured tip): measure M2/M23 to confirm"
        r_end_ = pp["tip_end_r"]
    else:
        r_end_ = math.sqrt((wh.p["rim_wall_r"] - pp["tip_clear"])**2 - (w_tip_/2)**2)
    spacing_note = ""
    arms = None
    sandwich_spoke = sandwich_deg = None
    if pp["even_spacing"]:
        arms = even_tip_angles(wh, pp["strips"], w_tip_, r_end_)
        if min(gap_clearance(wh, a, w_tip_, r_end_) for a in arms) < pp["min_spoke_clear"] + 3:
            arms = None
            if pp.get("sandwich_ok"):
                # even spacing with one tip centred on a rim hole: that spoke is clamped between the panels
                best = None
                for i in range(wh.p["spokes"]):
                    a0_ = i*wh.hole_pitch
                    others = [(a0_ + j*360/pp["strips"]) % 360 for j in range(1, pp["strips"])]
                    cmin = min(gap_clearance(wh, a, w_tip_, r_end_) for a in others)
                    vd = min(adiff(a, wh.valve_deg()) for a in [a0_] + others)
                    key = (cmin >= pp["min_spoke_clear"] + 3 and vd >= 10, round(cmin, 2), vd)
                    if best is None or key > best[0]: best = (key, i, a0_)
                if best[0][0]:
                    sandwich_spoke, sandwich_deg = best[1], best[2]
                    arms = sorted((sandwich_deg + j*360/pp["strips"]) % 360 for j in range(pp["strips"]))
                    spacing_note = (f"{pp['strips']} evenly spaced tips can't all sit between spokes on a {wh.p['spokes']}-spoke wheel: "
                                    f"the blade at {sandwich_deg:.2f} deg is centred on rim hole {sandwich_spoke} and its tips clamp "
                                    f"that spoke and nipple between the two panels")
            if arms is None:
                spacing_note = (f"{pp['strips']} evenly spaced tips can't all fit between spokes on a {wh.p['spokes']}-spoke wheel: "
                                "tips placed in spoke gaps as close to even as possible; give the firmware each strip's angle")
    if arms is None:
        arms = tip_angles(wh, pp["strips"], w_tip_, r_end_)
    name = f"{size}_{wh.p['spokes']}h{wh.p['crosses']}x_{pp['strips']}strips_{mat}"
    od = os.path.join(out, name); os.makedirs(od, exist_ok=True)
    # target: bent tip-end corners stay tip_clear inside the rim wall
    r_end_target = r_end_
    pp = dict(pp); pp["_slot"] = None; slot_info = None
    if pp["tip_slot"] == "all" or (pp["tip_slot"] == "auto" and sandwich_spoke is not None):
        sw = pp["tip_slot_w"] or pp["nipple_d"] + 1.0
        need = r_end_ - (wh.nipple_tip_r() - pp["tip_slot_clear"])        # bent tip end to the slot bottom
        depth = max(need, 2*pp["cut_corner_r"] + 0.5)                      # (its corner radii shrink to fit if shallow)
        pp["_slot"] = (round(sw, 2), round(depth, 2))
        slot_info = dict(width_mm=round(sw, 2), depth_mm=round(depth, 2), nipple_inner_end_r=round(wh.nipple_tip_r(), 1),
                               slot_bottom_r_on_wheel=round(r_end_ - depth, 1),
                               note="nipple position from the ASSUMED rim wall and nipple length (M20/M23): confirm")
    res = dict(name=name, material=pp["label"] + " (" + pp["role"] + ")", rim_note=rim_note, wheel_TYPICAL=wh.p, wheel_check=wh.check(), panel=pp,
               arm_angles_deg=[round(a, 3) for a in arms],
               arm_spacing_deg=[round((arms[(i + 1) % len(arms)] - arms[i]) % 360, 3) for i in range(len(arms))],
               tips_between_holes=[("on hole", round(a/wh.hole_pitch)) if abs(a/wh.hole_pitch - round(a/wh.hole_pitch)) < 1e-6
                                   else (int(a // wh.hole_pitch), int(a // wh.hole_pitch) + 1) for a in arms],
               valve_deg=wh.valve_deg(), spacing_note=spacing_note, sides={},
               sandwich=None if sandwich_spoke is None else dict(blade_deg=sandwich_deg, rim_hole=sandwich_spoke))
    res["tip_slot"] = slot_info
    # pass 1: each panel alone (tips to the centre plane) -> compliances; the tie force is the same on both
    # tips, so they meet where the stiffer panel bends less: plane z_m
    def solve(side, z_m):
        rho_end = r_end_target
        for _ in range(5):           # lengthen the flat blade until the bent tip end lands on (not past) target
            g = flat_geometry(wh, pp, side, arms, rho_end)
            m = mechanics(wh, pp, side, g, z_m)
            rho_end += r_end_target - m["plan_r"](rho_end)
        g = flat_geometry(wh, pp, side, arms, rho_end)
        m = mechanics(wh, pp, side, g, z_m)
        return g, m, g["rho_end"]
    t_ = pp["thickness"]
    first = {sd: solve(sd, 0.0) for sd in (-1, 1)}
    CL, CR = first[-1][1]["compliance"], first[1][1]["compliance"]
    z0L, z0R = first[-1][1]["z0"], first[1][1]["z0"]
    z_m = ((z0R - t_/2)/CR - (z0L - t_/2)/CL)/(1/CL + 1/CR)
    res["tips_meet_at_z_mm"] = round(z_m, 2)
    G = {}
    G_cut = {}
    for side, label in ((-1, "LEFT"), (1, "RIGHT")):
        g, m, rho_end = solve(side, z_m)
        plan_body = to_plan(g["body"], m)
        c = clearances(wh, pp, side, g, m, plan_body, skip=() if sandwich_spoke is None else (sandwich_spoke,))
        if sandwich_spoke is not None:
            c["sandwiched_spoke"] = sandwich_report(wh, pp, side, m, plan_body, sandwich_spoke, g)
        rooms = room_tables(wh, pp, side, m)
        G_cut[label] = g
        fc = fork_clearance(wh, pp, side, g, m)
        th = tie_head_check(wh, pp, side, g, m, arms, skip=() if sandwich_spoke is None else (sandwich_spoke,))
        g["cut_rot"], wh_sz = best_cut_rot(g)
        res["sides"][label] = dict(
            leds_per_strip=g["n_leds"], holes_per_row=len(g["hole_rhos"]), hole_pitch_mm=round(pp["holes_every"]*pp["led_pitch"], 2),
            hole_row_offset_mm=round(g["y_row"], 2), cutouts_dropped=g["n_rejected"],
            grid_shift_out_mm=g.get("grid_shift"), gap_first_hole_to_bore_mm=round(g["equal_gap"][0], 2), gap_last_hole_to_end_mm=round(g["equal_gap"][1], 2),
            led_start_r=round(m["plan_r"](g["rho_led0"]), 1), led_end_r=round(m["plan_r"](g["rho_led1"]), 1),
            bore_d=round(2*g["r_bore"], 2), w_center=round(g["w0"], 1), w_tip=g["w_tip"],
            flat_arm_end_rho=round(rho_end, 1), bent_arm_end_r=round(m["plan_r"](rho_end), 1),
            bend_shortening_mm=round(rho_end - m["plan_r"](rho_end), 2),
            part_size_in=[round(v/25.4, 2) for v in wh_sz],
            holes_per_blade=g.get("holes_per_blade"), holes_dropped_where_blades_meet=g.get("holes_dropped_overlap"),
            area_cm2=round(g["shape"].area/100, 1),
            mass_g=round(g["shape"].area*pp["thickness"]*pp["density"]/1000, 1),
            tip_force_N=round(m["F_tip_N"], 2), clamp_force_on_hub_N=round(m["clamp_N"], 1),
            sigma_max_MPa=round(m["sigma_max"], 1), sigma_ok=m["sigma_max"] <= pp["sigma_allow"],
            stress_along_arm=m["sigma_at"], sigma_hub_section_MPa=round(m["sigma_hub"], 1), net_width_at_hub_mm=round(g["net_w_center"], 1), contact=dict(r=m["r_contact"], z_inner_face=round(m["z_contact"], 2)),
            spoke_clearance=c, clearance_ok=c["min_gap_mm"] >= pp["min_spoke_clear"] and c["collision_points"] == 0,
            room=rooms, dropout_clear_at_hub=round(wh.p["old"]/2 - (m["z_contact"] + pp["thickness"]), 1),
            fork_clearance=fc, fork_ok=fc["min_mm"] >= pp["min_fork_clear"], tie_heads_inside=th,
            plate=g["has_plate"], plate_grid_holes=g["n_grid"], lattice_phase=g["lattice_phase"],
            plate_len_halfwidth_mm=g["plate_LW"], plate_taper_mm=g["plate_c"], plate_taper_end_mm=g.get("taper_end"), tip_end_r_bent=round(m["plan_r"](g["rho_end"]), 1),
            min_hole_edge_mm=pp["grid_edge"],
            holes_total=len(g["cuts_bulge"]))
        G[side] = (g, m, label, plan_body)
    vx = sum(math.cos(math.radians(a)) for a in arms); vy = sum(math.sin(math.radians(a)) for a in arms)
    g_l = G[-1][0]
    arm_area = (g_l["body"].area - math.pi*0)/len(arms)
    arm_mass = arm_area*pp["thickness"]*pp["density"]/1000
    res["imbalance_gmm_per_panel"] = round(math.hypot(vx, vy)*arm_mass*0.4*g_l["rho_end"], 0)
    def sig(g): return (tuple(round(v, 3) for p in g["outline_bulge"] for v in p),
                        tuple(sorted(tuple(round(v, 3) for p in cb for v in p) for cb in g["cuts_bulge"])))
    if sig(G_cut["LEFT"]) == sig(G_cut["RIGHT"]):
        write_cut_dxf(G_cut["LEFT"], os.path.join(od, f"{name}_panel_QTY2_cut_in.dxf"))
        res["cut_files"] = [f"{name}_panel_QTY2_cut_in.dxf (order 2: left and right are the same part)"]
    else:
        for lab in ("LEFT", "RIGHT"):
            write_cut_dxf(G_cut[lab], os.path.join(od, f"{name}_{lab}_cut_in.dxf"))
        res["cut_files"] = [f"{name}_LEFT_cut_in.dxf", f"{name}_RIGHT_cut_in.dxf"]
    pair_mass = sum(res["sides"][k]["mass_g"] for k in ("LEFT", "RIGHT"))/1000
    clamp = min(res["sides"][k]["clamp_force_on_hub_N"] for k in ("LEFT", "RIGHT"))
    res["lateral_g_before_a_panel_lifts"] = round(clamp/(pair_mass*9.81), 1)
    s = res["sides"]["RIGHT"]
    res["sim_settings"] = dict(stripCount=pp["strips"], ledDensity=round(1000/pp["led_pitch"]),
                               stripStartMm=round(s["led_start_r"]), autoLength=False,
                               stripLengthMm=round(s["led_end_r"] - s["led_start_r"]),
                               note="sim assumes evenly spaced strips" if len(set(res["arm_spacing_deg"])) > 1 else "")
    write_reference_dxf([(-G[-1][0]["rho_end"] - 30, "LEFT  (reference only, do not cut)", G[-1][0]),
                         (G[1][0]["rho_end"] + 30, "RIGHT (reference only, do not cut)", G[1][0])],
                        os.path.join(od, f"{name}_reference_mm.dxf"))
    json.dump(res, open(os.path.join(od, f"{name}_report.json"), "w"), indent=1, default=str)
    preview(wh, pp, arms, G, res, os.path.join(od, f"{name}_preview.png"))
    return res

DIR_COL = {1: "#8a949c", -1: "#c08a2c"}

def mm_in(v, d=1):
    return f"{v:.{d}f} mm ({v/25.4:.3f}\")"

def dim(ax, p1, p2, off, text, color="#1f4e79", fs=7.5, text_side=1):
    """Dimension line between p1 and p2, offset perpendicular by off (mm), with extension lines."""
    (x1, y1), (x2, y2) = p1, p2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy/L, dx/L
    a = (x1 + nx*off, y1 + ny*off); b = (x2 + nx*off, y2 + ny*off)
    for p, q in ((p1, a), (p2, b)):
        ax.plot([p[0], q[0] + nx*2*math.copysign(1, off)], [p[1], q[1] + ny*2*math.copysign(1, off)], color=color, lw=0.5)
    ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="<->", color=color, lw=0.7, shrinkA=0, shrinkB=0))
    ang = math.degrees(math.atan2(dy, dx))
    if ang > 90 or ang < -90: ang += 180
    mx, my = (a[0] + b[0])/2 + nx*3*text_side*math.copysign(1, off), (a[1] + b[1])/2 + ny*3*text_side*math.copysign(1, off)
    ax.text(mx, my, text, rotation=ang, ha="center", va="center", fontsize=fs, color=color,
            bbox=dict(fc="white", ec="none", pad=0.4, alpha=0.85))

def draw_flat_dims(ax, g, pp, label, a0, sd):
    """The flat part as cut, blades horizontal, with the dimensions needed to check or rebuild it."""
    shp = affinity.rotate(g["shape"], -a0, origin=(0, 0))
    for poly in polys(shp):
        ax.fill(*poly.exterior.xy, color="#e4e8ec", ec="#1f2a36", lw=0.7)
        for i in poly.interiors:
            ax.fill(*zip(*i.coords), color="white", ec="#1f2a36", lw=0.45)
    E = g["rho_end"]; hole = pp["tie_w"] + pp["tie_clear"]; step = pp["holes_every"]*pp["led_pitch"]
    yr = g["y_row"]; wt = g["w_tip"]; rb = g["r_bore"]
    # LED strip lane
    for sgn in (1, -1):
        ax.plot([-E, E], [sgn*pp["strip_w"]/2]*2, color="#ff9f1c", lw=0.6, ls=(0, (4, 3)))
    ax.text(E*0.55, 0, "LED strip lane " + mm_in(pp["strip_w"]), fontsize=7, color="#c77800", ha="center", va="center",
            bbox=dict(fc="white", ec="none", pad=0.3, alpha=0.8))
    half = max(g["hw"](0), (g["plate_LW"][1] if g["plate_LW"] else 0))
    # overall length
    dim(ax, (-E, -half), (E, -half), -14, "overall " + mm_in(2*E))
    # tip end width (right end) and tip gap
    dim(ax, (E, -wt/2), (E, wt/2), -12, "tip " + mm_in(wt))
    xs = sorted(g["hole_rhos"])
    dim(ax, (xs[-1] + hole/2, yr + hole/2 + 1), (E, yr + hole/2 + 1), 9, "gap " + mm_in(sd["gap_last_hole_to_end_mm"]), fs=7)
    # hole size, pitch, row spacing (near the right tip)
    xk = xs[-3]
    dim(ax, (xs[-4], yr), (xk, yr), 12 + hole/2, "pitch " + mm_in(step, 2), fs=7)
    dim(ax, (xs[-6], -yr), (xs[-6], yr), -10, "rows " + mm_in(2*yr), fs=7)
    ax.annotate(f"□ {hole:.1f} mm ({hole/25.4:.3f}\") holes, R{pp['cut_corner_r']} corners", xy=(xs[-2], -yr - hole/2),
                xytext=(xs[-2] - 40, -half - 4), fontsize=7, color="#1f4e79",
                arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    if pp.get("_slot"):
        sw_, sd_ = pp["_slot"]
        ax.annotate(f"nipple slot {sw_:.1f} wide × {sd_:.1f} deep, every tip", xy=(E - sd_/2, 0), xytext=(E - 95, wt/2 + 22),
                    fontsize=7, color="#1f4e79", arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    # bore
    ax.annotate(f"Ø {2*rb:.2f} mm ({2*rb/25.4:.3f}\") bore", xy=(rb*0.7, -rb*0.7), xytext=(30, -half - 4), fontsize=7.5,
                color="#1f4e79", arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    ax.annotate(f"row gap to bore {sd['gap_first_hole_to_bore_mm']} mm · any hole ≥ {pp['bore_edge']} mm from bore", xy=(-rb*0.8, -rb*0.6),
                xytext=(-E*0.62, -half - 4), fontsize=7, color="#1f4e79", arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    # width at the centre / plate
    if g["plate_LW"]:
        Lp, Wp = g["plate_LW"]
        dim(ax, (-Lp, -Wp), (-Lp, Wp), 16, "plate " + mm_in(2*Wp))
        dim(ax, (-Lp, Wp), (Lp, Wp), 9, "plate flat " + mm_in(2*Lp))
        dim(ax, (Lp, Wp), (Lp + g["plate_c"], Wp), 9, "taper " + mm_in(g["plate_c"]), fs=7)
        py = pitch_y(pp)
        cy = [yr + k*py for k in range(1, 6) if yr + k*py + hole/2 + pp["grid_edge"] <= Wp + 1e-6]
        if cy:
            dim(ax, (xs[2], yr), (xs[2], cy[0]), -10, mm_in(py, 2), fs=6.5)
            dim(ax, (xs[1], cy[-1] + hole/2), (xs[1], Wp), -8, "edge " + mm_in(pp["grid_edge"]), fs=6.5)
    else:
        dim(ax, (0, -g["hw"](0)), (0, g["hw"](0)), -(E*0.35), "centre width " + mm_in(2*g["hw"](0)))
    ax.set_aspect("equal"); ax.axis("off")
    pad = 22
    ax.set_xlim(-E - 30, E + 40); ax.set_ylim(-half - 30, half + pad + 6)
    ax.set_title(f"{label} panel  ·  flat, as cut  ·  {sd['part_size_in'][0]} × {sd['part_size_in'][1]} in  ·  "
                 f"{pp['label']} {pp['thickness']:.2f} mm  ·  {sd['holes_total']} holes  ·  outline corners R{pp['corner_r']}",
                 fontsize=10, loc="left")

def draw_flat_star(ax, g, pp, label, arms, sd):
    """3+ blade part as cut, blade 0 pointing right, with the dimensions needed to check or rebuild it."""
    a0 = arms[0]
    shp = affinity.rotate(g["shape"], -a0, origin=(0, 0))
    for poly in polys(shp):
        ax.fill(*poly.exterior.xy, color="#e4e8ec", ec="#1f2a36", lw=0.7)
        for i in poly.interiors:
            ax.fill(*zip(*i.coords), color="white", ec="#1f2a36", lw=0.45)
    E = g["rho_end"]; hole = pp["tie_w"] + pp["tie_clear"]; step = pp["holes_every"]*pp["led_pitch"]
    yr = g["y_row"]; wt = g["w_tip"]; rb = g["r_bore"]
    rel = sorted(((a - a0) % 360) for a in arms)
    for r_ in rel:                                   # LED lanes
        for sgn in (1, -1):
            ln = affinity.rotate(LineString([(rb + 2, sgn*pp["strip_w"]/2), (E, sgn*pp["strip_w"]/2)]), r_, origin=(0, 0))
            ax.plot(*ln.xy, color="#ff9f1c", lw=0.6, ls=(0, (4, 3)))
    ax.text(E*0.62, 0, "LED strip lane " + mm_in(pp["strip_w"]), fontsize=7, color="#c77800", ha="center", va="center",
            bbox=dict(fc="white", ec="none", pad=0.3, alpha=0.8))
    # angles between blades
    for i, r_ in enumerate(rel):
        nxt = rel[(i + 1) % len(rel)] + (360 if i == len(rel) - 1 else 0)
        mid = math.radians((r_ + nxt)/2)
        arc = [(95*math.cos(math.radians(t)), 95*math.sin(math.radians(t))) for t in [r_ + 14 + k*(nxt - r_ - 28)/40 for k in range(41)]]
        ax.plot(*zip(*arc), color="#7b2cbf", lw=0.7)
        ax.text(112*math.cos(mid), 112*math.sin(mid), f"{nxt - r_:.2f}°", color="#7b2cbf", fontsize=8.5, ha="center", va="center",
                bbox=dict(fc="white", ec="none", pad=0.3, alpha=0.85))
    Lp, Wp = g["plate_LW"]
    # blade 0 dimensions
    dim(ax, (0, -Wp), (E, -Wp), -30, "centre to tip " + mm_in(E))
    dim(ax, (E, -wt/2), (E, wt/2), -12, "tip " + mm_in(wt))
    xs = sorted(g["hole_rhos"])
    dim(ax, (xs[-1] + hole/2, yr + hole/2 + 1), (E, yr + hole/2 + 1), 9, "gap " + mm_in(sd["gap_last_hole_to_end_mm"]), fs=7)
    dim(ax, (xs[-4], yr), (xs[-3], yr), 12 + hole/2, "pitch " + mm_in(step, 2), fs=7)
    dim(ax, (xs[-6], -yr), (xs[-6], yr), -10, "rows " + mm_in(2*yr), fs=7)
    ax.annotate(f"□ {hole:.1f} mm ({hole/25.4:.3f}\") holes, R{pp['cut_corner_r']} corners", xy=(xs[-2], -yr - hole/2),
                xytext=(xs[-2] - 70, -Wp - 12), fontsize=7, color="#1f4e79", arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    if pp.get("_slot"):
        sw_, sd_ = pp["_slot"]
        ax.annotate(f"nipple slot {sw_:.1f} wide × {sd_:.1f} deep, every tip", xy=(E - sd_/2, 0), xytext=(E - 95, wt/2 + 22),
                    fontsize=7, color="#1f4e79", arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    dim(ax, (Lp, -Wp), (Lp, Wp), -8, "plate " + mm_in(2*Wp), fs=7.5)
    dim(ax, (0, -Wp), (Lp, -Wp), -12, "plate " + mm_in(Lp) + " from centre", fs=7)
    dim(ax, (Lp, -Wp), (Lp + g["plate_c"], -Wp), -12, "taper " + mm_in(g["plate_c"]), fs=7)
    py = pitch_y(pp)
    cy = [yr + k*py for k in range(1, 6) if yr + k*py + hole/2 + pp["grid_edge"] <= Wp + 1e-6]
    if cy:
        dim(ax, (xs[2], yr), (xs[2], cy[0]), -10, mm_in(py, 2), fs=6.5)
    ax.annotate(f"Ø {2*rb:.2f} mm ({2*rb/25.4:.3f}\") bore", xy=(-rb*0.7, -rb*0.7), xytext=(-E*0.75, -E*0.15), fontsize=7.5,
                color="#1f4e79", arrowprops=dict(arrowstyle="-", color="#1f4e79", lw=0.5))
    ax.set_aspect("equal"); ax.axis("off")
    b = shp.bounds
    ax.set_xlim(b[0] - 30, b[2] + 45); ax.set_ylim(b[1] - 20, b[3] + 20)
    ax.set_title(f"{label} panel  ·  flat, as cut  ·  {sd['part_size_in'][0]} × {sd['part_size_in'][1]} in  ·  "
                 f"{pp['label']} {pp['thickness']:.2f} mm  ·  {sd['holes_total']} holes ({'/'.join(map(str, sd['holes_per_blade']))} per blade)  ·  "
                 f"outline corners R{pp['corner_r']}  ·  every blade has the same plate, taper and rows",
                 fontsize=10, loc="left")

def preview(wh, pp, arms, G, res, path):
    if G[-1][0].get("star"):
        fig = plt.figure(figsize=(22, 27))
        gs = fig.add_gridspec(3, 4, height_ratios=[5, 7, 7], width_ratios=[1, 1, 1, 1.05])
    else:
        fig = plt.figure(figsize=(22, 17))
        gs = fig.add_gridspec(3, 4, height_ratios=[5, 3.3, 3.3], width_ratios=[1, 1, 1, 1.05])
    for k, side in enumerate((-1, 1)):
        g, m, label, plan_body = G[side]
        plan_shape = to_plan(g["shape"], m)
        ax = fig.add_subplot(gs[0, k])
        for s in wh.spokes:
            own = s.side == side
            if res.get("sandwich") and s.i == res["sandwich"]["rim_hole"]:
                ax.plot([s.p0[0], s.p1[0]], [s.p0[1], s.p1[1]], color="#e63946", lw=1.6, zorder=7)
                ax.plot(*pol(wh.p["erd"]/2, s.rim_deg), "o", ms=5, color="#e63946", zorder=8)
                continue
            ax.plot([s.p0[0], s.p1[0]], [s.p0[1], s.p1[1]], color=DIR_COL[s.direction] if own else "#ddd",
                    lw=0.9 if own else 0.6, zorder=1 if own else 0)
            ax.plot(*pol(wh.p["erd"]/2, s.rim_deg), "o", ms=2.5, color="#444" if own else "#aaa", zorder=2)
        for poly in polys(plan_shape):
            ax.fill(*poly.exterior.xy, color="#2b2f36", alpha=0.85, zorder=3)
            for i in poly.interiors:
                ax.fill(*zip(*i.coords), color="white", zorder=4)
        for l in g["leds"]:
            ax.plot(*to_plan(l, m).xy, color="#ff9f1c", lw=2.2, zorder=5)
        for sn in g["sensors"]:
            ax.fill(*to_plan(sn, m).exterior.xy, color="#b07cd8", alpha=.55, zorder=6)
        ax.add_patch(plt.Circle((0, 0), wh.p["rim_wall_r"], fill=False, ls="--", ec="#999"))
        vd = wh.valve_deg()
        ax.plot(*zip(pol(wh.p["rim_wall_r"] + 6, vd), pol(wh.p["rim_wall_r"] - 35, vd)), color="#7b2cbf", lw=4)
        ax.text(*pol(wh.p["rim_wall_r"] + 16, vd), "valve", fontsize=8, color="#7b2cbf", ha="center")
        ax.text(*pol(wh.p["rim_wall_r"] + 16, arms[0]), "arm 0", fontsize=8, ha="center")
        sd = res["sides"][label]
        ax.set_aspect("equal"); lim = wh.p["rim_wall_r"] + 30
        ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.axis("off")
        ax.set_title(f"{label} panel on the wheel, bent (seen from the right) · {sd['leds_per_strip']} LEDs/blade\n"
                     f"{sd['area_cm2']} cm² · {sd['mass_g']} g" + (" · purple = magnetometers (inner face)" if g["sensors"] else ""), fontsize=9.5)
    ax = fig.add_subplot(gs[0, 2])
    for s in wh.spokes:
        ts = [k/60 for k in range(61)]
        ax.plot([s.at(t)[2] for t in ts], [math.hypot(*s.at(t)[:2]) for t in ts], color=DIR_COL[s.direction], lw=0.7, alpha=.6)
    t = pp["thickness"]
    for side in (-1, 1):
        g, m, label, _ = G[side]
        rhos = [g["r_bore"] + k*(g["rho_end"] - g["r_bore"])/300 for k in range(301)]
        rr = [m["plan_r"](p) for p in rhos]; zz = [m["z_at_rho"](p) for p in rhos]
        ax.fill_betweenx(rr, [side*(z - t/2) for z in zz], [side*(z + t/2) for z in zz], color="#2b2f36",
                         label="panels, bent by the tip ties" if side > 0 else None)
    for side in (-1, 1):
        c2f = wh.p["c2f_left"] if side < 0 else wh.p["c2f_right"]
        ax.add_patch(plt.Rectangle((side*c2f - wh.p["flange_t"]/2, 0), wh.p["flange_t"], wh.flange_outer_r(side), fc="#ccc", ec="#888"))
    old = wh.p["old"]/2
    ax.add_patch(plt.Rectangle((-old, -8), 2*old, 16, fc="#eee", ec="#888"))
    for sgn in (-1, 1):
        ax.plot([sgn*old, sgn*old*0.9, sgn*24], [0, 150, 330], color="#2c3e50", lw=4, alpha=.25)
    ax.plot([0, 0], [wh.nipple_tip_r(), wh.p["rim_wall_r"]], color="#444", lw=4)
    ax.plot([-10, 10], [wh.p["rim_wall_r"]]*2, color="#444", lw=2, label="rim wall / nipples")
    ax.plot([-6, 6], [G[1][1]["plan_r"](G[1][0]["rho_tie"])]*2, color="#e63946", lw=2, label="tip-to-tip zip tie")
    ax.set_xlim(-55, 55); ax.set_ylim(-12, wh.p["rim_wall_r"] + 14); ax.grid(alpha=.3); ax.legend(fontsize=7, loc="upper left")
    ax.set_xlabel("lateral z (mm)   left ← → right"); ax.set_ylabel("radius (mm)")
    ax.set_title("side section: all 32 spokes (grey heads-in, amber heads-out)\npanels bent from flat by the ties · lateral scale exaggerated", fontsize=9.5)
    if G[-1][0].get("star"):
        same = len(res["cut_files"]) == 1
        for k, side in enumerate((-1,) if same else (-1, 1)):
            g, m, label, _ = G[side]
            ax = fig.add_subplot(gs[1:, :] if same else gs[1:, 2*k:2*k + 2])
            draw_flat_star(ax, g, pp, "LEFT = RIGHT" if same else label, arms, res["sides"][label])
    else:
        for k, side in enumerate((-1, 1)):
            g, m, label, _ = G[side]
            ax = fig.add_subplot(gs[1 + k, :])
            draw_flat_dims(ax, g, pp, label, arms[0], res["sides"][label])
    ax = fig.add_subplot(gs[0, 3]); ax.axis("off")
    L, R = res["sides"]["LEFT"], res["sides"]["RIGHT"]
    SW = next((sd["spoke_clearance"]["sandwiched_spoke"] for sd in (L, R) if sd["spoke_clearance"].get("sandwiched_spoke", {}).get("own_side")), None)
    lines = [
        f"{res['name']}",
        f"{res['material']}, {pp['thickness']:.3f} mm",
        f"arm angles {res['arm_angles_deg']}",
        f"spacing {res['arm_spacing_deg']}",
        f"tips between rim holes {res['tips_between_holes']}",
        f"arm width {R['w_center']} mm at centre → {R['w_tip']} mm at tip",
        f"flat arm {R['flat_arm_end_rho']} mm → {R['bent_arm_end_r']} mm when bent (−{R['bend_shortening_mm']})",
        "",
        f"tip force per arm   L {L['tip_force_N']} N   R {R['tip_force_N']} N",
        f"clamp on hub        L {L['clamp_force_on_hub_N']} N   R {R['clamp_force_on_hub_N']} N",
        f"max bending stress  L {L['sigma_max_MPa']}  R {R['sigma_max_MPa']} MPa  (target ≤ {pp['sigma_allow']})",
        f"at the hub section  {L['sigma_hub_section_MPa']} MPa over {L['net_width_at_hub_mm']} mm net width (bore + holes removed)",
        f"gap to spokes: arms L {L['spoke_clearance']['arms_min_gap_mm']} R {R['spoke_clearance']['arms_min_gap_mm']} mm, "
        f"tips {R['spoke_clearance']['tips_side_clear_mm']} mm sideways",
        f"collisions L {L['spoke_clearance']['collision_points']} R {R['spoke_clearance']['collision_points']}",
        f"sideways shake before a panel lifts: {res['lateral_g_before_a_panel_lifts']} g",
        f"fork clearance (typical fork), LED strip + tie band  L {L['fork_clearance']['led_strip_mm']}  R {R['fork_clearance']['led_strip_mm']} mm"
        f" at r {L['fork_clearance']['where']['r'] if L['fork_clearance']['governed_by'].startswith('LED') else '-'}",
        f"  bare panel face  L {L['fork_clearance']['panel_face_mm']}  R {R['fork_clearance']['panel_face_mm']} mm  (target ≥ {pp['min_fork_clear']})",
        f"tie heads on the inner face: tightest {L['tie_heads_inside']['tightest_mm']} mm to a spoke; "
        f"{L['tie_heads_inside']['n_move_outside']} positions need the head outside",
        f"tips meet at z = {res['tips_meet_at_z_mm']} mm" + (" (identical panels: centred)" if abs(res['tips_meet_at_z_mm']) < 0.05 else " (unequal panel stiffness)"),
        f"holes: L {L['holes_total']} ({L['plate_grid_holes']} on the plate)  R {R['holes_total']}",
        "",
        "space between panel and its spokes (mm):",
        "  " + "  ".join(f"{r}:{v['panel_to_spokes']}" for r, v in R["room"].items()),
        "",
        "bore and tip radius measured; other wheel dimensions TYPICAL",
    ] + ([f"nipple slot in every tip: {res['tip_slot']['width_mm']} wide x {res['tip_slot']['depth_mm']} mm deep "
          f"(bottom at r {res['tip_slot']['slot_bottom_r_on_wheel']}, nipple from r {res['tip_slot']['nipple_inner_end_r']})"]
         if res.get("tip_slot") else []) + [
    ] + ([f"sandwiched spoke (red): rim hole {res['sandwich']['rim_hole']} under the blade at {res['sandwich']['blade_deg']:.2f} deg",
          f"  at the ties the spoke is {abs(SW['spoke_offset_at_ties_mm']):.1f} mm toward its ({SW['spoke_side']}) flange: that tip pair sits off-centre by that much",
          f"  and rests on the spoke from r = {SW['meets_panel_from_r']} mm out (model)",
          (f"  tips held {wh.p['spoke_d']:.1f} mm apart by the spoke; the nipple sits in the tip slots" if res.get("tip_slot")
           else f"  tips held {wh.p['spoke_d']:.1f} mm apart by the spoke, {pp['nipple_d']:.1f} mm at the nipple")]
         if res.get("sandwich") else []) + [
    ] + ([""] + [res["spacing_note"][i:i + 70] for i in range(0, len(res["spacing_note"]), 70)] if res.get("spacing_note") else []) + [
    ]
    ax.text(0, 1, "\n".join(lines), va="top", family="monospace", fontsize=8.0)
    fig.suptitle(f"{res['name']}: " + " / ".join(res["cut_files"]) + " · tips tied tip-to-tip between spokes", fontsize=12, y=0.995)
    fig.tight_layout(rect=[0, 0, 1, 0.975]); fig.savefig(path, dpi=100); plt.close(fig)

def pp_mat_allow(r): return r["panel"]["sigma_allow"]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--strips", type=int, default=PANEL["strips"], choices=(2, 3, 4))
    ap.add_argument("--size", default=WHEEL["size"], choices=list(WHEEL_PRESETS))
    ap.add_argument("--all", action="store_true", help="build 2, 3 and 4 strips")
    ap.add_argument("--set", nargs="*", default=[], help="override any WHEEL/PANEL key, e.g. thickness=3.0 erd=602")
    ap.add_argument("--material", default=PANEL["material"], choices=list(MATERIALS))
    ap.add_argument("--out", default="out")
    a = ap.parse_args()
    wo, po = {"size": a.size}, {"material": a.material}
    for kv in a.set:
        k, v = kv.split("=")
        if k in PANEL: po[k] = type(PANEL[k])(float(v)) if not isinstance(PANEL[k], (tuple, bool, str)) else (eval(v) if not isinstance(PANEL[k], str) else v)
        elif any(k in mm for mm in MATERIALS.values()): po[k] = float(v)
        else: wo[k] = float(v)
    for n in ((2, 3, 4) if a.all else (a.strips,)):
        r = build(wo, {**po, "strips": n}, a.out)
        L, R = r["sides"]["LEFT"], r["sides"]["RIGHT"]
        print(f"{r['name']}: arms {r['arm_angles_deg']} | w {R['w_center']}->{R['w_tip']} | LEDs {R['leds_per_strip']} | "
              f"tip F {R['tip_force_N']} N, clamp {R['clamp_force_on_hub_N']} N | sigma {R['sigma_max_MPa']} MPa | "
              f"gap arms {L['spoke_clearance']['arms_min_gap_mm']}/{R['spoke_clearance']['arms_min_gap_mm']}, tips {R['spoke_clearance']['tips_side_clear_mm']} mm, "
              f"hits {L['spoke_clearance']['collision_points']}/{R['spoke_clearance']['collision_points']} | "
              f"{R['part_size_in']} in, {R['mass_g']} g | shorten {R['bend_shortening_mm']} mm | lift-off {r['lateral_g_before_a_panel_lifts']} g")
        print(f"  LEFT {L['mass_g']} g, {L['holes_total']} holes ({L['plate_grid_holes']} plate), tip F {L['tip_force_N']} N, sigma {L['sigma_max_MPa']} MPa | "
              f"tips meet z={r['tips_meet_at_z_mm']} | fork L {L['fork_clearance']['min_mm']} R {R['fork_clearance']['min_mm']} mm | {r['rim_note']}")
        for lab in ("LEFT", "RIGHT"):
            if not r["sides"][lab]["fork_ok"]:
                print(f"  WARNING {lab}: fork clearance {r['sides'][lab]['fork_clearance']} (typical fork; measure M11/M12)")
            if not r["sides"][lab]["sigma_ok"]:
                print(f"  WARNING {lab}: bending stress {r['sides'][lab]['sigma_max_MPa']} MPa over the {pp_mat_allow(r)} MPa target")
        for lab in ("LEFT", "RIGHT"):
            sc = r["sides"][lab]["spoke_clearance"]
            if not r["sides"][lab]["clearance_ok"]:
                print(f"  WARNING {lab}: spoke clearance {sc['min_gap_mm']} mm < {PANEL['min_spoke_clear']} mm "
                      f"(arms {sc['arms_min_gap_mm']}, tips sideways {sc['tips_side_clear_mm']}): don't cut this layout")
