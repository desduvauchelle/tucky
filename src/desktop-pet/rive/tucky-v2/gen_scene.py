#!/usr/bin/env python3
"""Generates scene.rml for Tucky v2 (the Rive desktop pet).

scene.rml is the artifact `rive` builds; this script is the readable source of it.
Artwork is in the ORIGINAL TuckyArtwork coordinate space (viewBox 180 100 900 1080), written in SVG
painter's order (later = in front). Run: python3 gen_scene.py  (writes scene.rml next to it).

Ownership rule that keeps layers from fighting: every animated node is written by exactly one
state-machine layer / joystick, and nodes are nested (Poke > Hop > Breath > Head* ...) so motions add up.
"""
import math, re, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scene.rml")
FPS = 60
ART_W, ART_H = 1000, 1230
WORLD_X, WORLD_Y = -130, 10  # original (180,100) -> artboard (50,110): room for hops, squash, dots

_id = [100]
def nid():
    _id[0] += 1
    return f"0:{_id[0]}"

BY_NAME = {}  # name -> element (for animation targets)

# ------------------------------------------------------------------ colours
FUR_STOPS = [("FFDB963E", 0), ("FFB86B23", 0.65), ("FF8B4918", 1)]
GRADS = {
    "fur": FUR_STOPS,
    "cream": [("FFFFF0D5", 0), ("FFF1CA96", 1)],
    "bag": [("FF85863A", 0), ("FF50531E", 1)],
    "stripe": [("FF543010", 0), ("FF8B4B18", 1)],
}
INK = "FF382610"

# ------------------------------------------------------------------ SVG path -> vertices
def parse_path(d):
    toks = re.findall(r"[MLHVQCZmlhvqcz]|-?\d*\.?\d+(?:e-?\d+)?", d)
    i = 0
    subs = []
    cur = None
    pos = (0.0, 0.0)
    cmd = None
    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v
    def finish(closed):
        nonlocal cur
        if cur is None:
            return
        pts = cur
        if closed and len(pts) > 1 and abs(pts[0]["p"][0] - pts[-1]["p"][0]) < 1e-6 and abs(pts[0]["p"][1] - pts[-1]["p"][1]) < 1e-6:
            pts[0]["in"] = pts[-1]["in"]
            pts.pop()
        subs.append({"closed": closed, "pts": pts})
        cur = None
    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t; i += 1
            if cmd in "Zz":
                finish(True)
                if subs:
                    pos = subs[-1]["pts"][0]["p"]
                continue
        if cmd == "M":
            finish(False)
            pos = (num(), num())
            cur = [{"p": pos, "in": (0, 0), "out": (0, 0)}]
            cmd = "L"
        elif cmd == "L":
            pos = (num(), num()); cur.append({"p": pos, "in": (0, 0), "out": (0, 0)})
        elif cmd == "H":
            pos = (num(), pos[1]); cur.append({"p": pos, "in": (0, 0), "out": (0, 0)})
        elif cmd == "V":
            pos = (pos[0], num()); cur.append({"p": pos, "in": (0, 0), "out": (0, 0)})
        elif cmd == "Q":
            c = (num(), num()); p = (num(), num())
            p0 = pos
            c1 = (p0[0] + 2 / 3 * (c[0] - p0[0]), p0[1] + 2 / 3 * (c[1] - p0[1]))
            c2 = (p[0] + 2 / 3 * (c[0] - p[0]), p[1] + 2 / 3 * (c[1] - p[1]))
            cur[-1]["out"] = (c1[0] - p0[0], c1[1] - p0[1])
            cur.append({"p": p, "in": (c2[0] - p[0], c2[1] - p[1]), "out": (0, 0)})
            pos = p
        elif cmd == "C":
            c1 = (num(), num()); c2 = (num(), num()); p = (num(), num())
            cur[-1]["out"] = (c1[0] - pos[0], c1[1] - pos[1])
            cur.append({"p": p, "in": (c2[0] - p[0], c2[1] - p[1]), "out": (0, 0)})
            pos = p
        else:
            raise ValueError(f"unsupported path command {cmd} in {d[:40]}")
    finish(False)
    return subs

def ellipse_d(cx, cy, rx, ry):
    k = 0.5522847498
    return (f"M{cx} {cy-ry}C{cx+k*rx} {cy-ry} {cx+rx} {cy-k*ry} {cx+rx} {cy}"
            f"C{cx+rx} {cy+k*ry} {cx+k*rx} {cy+ry} {cx} {cy+ry}"
            f"C{cx-k*rx} {cy+ry} {cx-rx} {cy+k*ry} {cx-rx} {cy}"
            f"C{cx-rx} {cy-k*ry} {cx-k*rx} {cy-ry} {cx} {cy-ry}Z")

def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

# ------------------------------------------------------------------ scene graph
class N:
    """A Node (group). pivot is in absolute original coordinates."""
    def __init__(self, name, pivot=(0, 0), kids=None, **props):
        self.name, self.pivot, self.kids, self.props = name, pivot, kids or [], props
        self.id = nid()
        self.clip = None  # name of a clip Shape
        BY_NAME[name] = self

class S:
    """A Shape built from SVG path strings (absolute coords) or parametric ellipse."""
    def __init__(self, name, paths=(), fill=None, stroke=None, sw=17, ell=None, rect=None, dash=None, trim=None,
                 alpha=None, cap="round", **props):
        self.name, self.paths, self.fill, self.stroke, self.sw = name, list(paths), fill, stroke, sw
        self.ell, self.rect, self.dash, self.trim, self.alpha, self.cap, self.props = ell, rect, dash, trim, alpha, cap, props
        self.id = nid()
        self.trim_id = nid() if trim is not None else None
        BY_NAME[name] = self
        if trim is not None:
            BY_NAME[name + ".trim"] = type("T", (), {"id": self.trim_id})()

def color_xml(c, bbox, ind):
    if c in GRADS:
        stops = GRADS[c]
        (x0, y0, x1, y1) = bbox
        w, h = x1 - x0, y1 - y0
        if c == "fur" or c == "bag" or c == "stripe":
            sx, sy, ex, ey = x0 + 0.15 * w, y0 + 0.05 * h, x0 + 0.95 * w, y1
        else:
            sx, sy, ex, ey = x0 + 0.5 * w, y0, x0 + 0.5 * w, y1
        s = f'{ind}<LinearGradient startX="{f(sx)}" startY="{f(sy)}" endX="{f(ex)}" endY="{f(ey)}" name="Gradient">\n'
        for col, pos in stops:
            s += f'{ind}    <GradientStop colorValue="{col}" position="{pos}"/>\n'
        return s + f"{ind}</LinearGradient>\n"
    return f'{ind}<SolidColor colorValue="{c}" name="Color"/>\n'

def emit_vertex(a, ox, oy, ind):
    x, y = a["p"][0] - ox, a["p"][1] - oy
    ix, iy = a["in"]; ox_, oy_ = a["out"]
    if abs(ix) + abs(iy) + abs(ox_) + abs(oy_) < 1e-9:
        return f'{ind}<StraightVertex x="{f(x)}" y="{f(y)}"/>\n'
    return (f'{ind}<CubicDetachedVertex x="{f(x)}" y="{f(y)}" inRotation="{f(math.atan2(iy, ix))}" '
            f'inDistance="{f(math.hypot(ix, iy))}" outRotation="{f(math.atan2(oy_, ox_))}" outDistance="{f(math.hypot(ox_, oy_))}"/>\n')

def emit_shape(s, org, ind):
    ox, oy = org
    out = ""
    attrs = ""
    for k, v in s.props.items():
        attrs += f' {k}="{f(v) if isinstance(v, (int, float)) else v}"'
    if s.ell:
        cx, cy, rx, ry = s.ell
        out += f'{ind}<Shape x="{f(cx-ox)}" y="{f(cy-oy)}"{attrs} name="{s.name}" id="{s.id}">\n'
        out += f'{ind}    <Ellipse width="{f(rx*2)}" height="{f(ry*2)}" name="Path"/>\n'
        bbox = (-rx, -ry, rx, ry)
    elif s.rect:
        cx, cy, w, h, r = s.rect
        out += f'{ind}<Shape x="{f(cx-ox)}" y="{f(cy-oy)}"{attrs} name="{s.name}" id="{s.id}">\n'
        out += f'{ind}    <Rectangle width="{f(w)}" height="{f(h)}" cornerRadiusTL="{f(r)}" name="Path"/>\n'
        bbox = (-w / 2, -h / 2, w / 2, h / 2)
    else:
        out += f'{ind}<Shape{attrs} name="{s.name}" id="{s.id}">\n'
        xs, ys = [], []
        for d in s.paths:
            for sub in parse_path(d):
                closed = "true" if sub["closed"] else "false"
                out += f'{ind}    <PointsPath isClosed="{closed}" name="Path">\n'
                for a in sub["pts"]:
                    out += emit_vertex(a, ox, oy, ind + "        ")
                    xs.append(a["p"][0] - ox); ys.append(a["p"][1] - oy)
                out += f"{ind}    </PointsPath>\n"
        bbox = (min(xs), min(ys), max(xs), max(ys))
    if s.fill:
        out += f'{ind}    <Fill name="Fill">\n' + color_xml(s.fill, bbox, ind + "        ") + f"{ind}    </Fill>\n"
    if s.stroke:
        out += f'{ind}    <Stroke thickness="{f(s.sw)}" cap="{s.cap}" join="round" name="Stroke">\n'
        out += color_xml(s.stroke, bbox, ind + "        ")
        if s.dash:
            out += f'{ind}        <DashPath name="Dashes">\n'
            for L in s.dash:
                out += f'{ind}            <Dash length="{L}" name="Dash"/>\n'
            out += f"{ind}        </DashPath>\n"
        if s.trim is not None:
            out += f'{ind}        <TrimPath start="0" end="{s.trim}" id="{s.trim_id}" name="Trim"/>\n'
        out += f"{ind}    </Stroke>\n"
    out += f"{ind}</Shape>\n"
    return out

DEFAULTS = {}  # filled below, (node, prop) -> value; used both for authoring and mood anim fill

def emit(n, parent_org, ind):
    if isinstance(n, S):
        return emit_shape(n, parent_org, ind)
    px, py = n.pivot
    base = {"x": px - parent_org[0], "y": py - parent_org[1]}
    for (nm, prop), v in DEFAULTS.items():
        if nm == n.name:
            base[prop] = base.get(prop, 0) + v if prop in ("x", "y") else v
    attrs = " ".join(f'{k}="{f(v)}"' for k, v in base.items())
    out = f'{ind}<Node {attrs} name="{n.name}" id="{n.id}">\n'
    if n.clip:
        out += f'{ind}    <ClippingShape sourceId="{BY_NAME[n.clip].id}" name="Clip"/>\n'
    for k in reversed(n.kids):  # SVG painter's order -> Rive front-to-back
        out += emit(k, n.pivot, ind + "    ")
    out += f"{ind}</Node>\n"
    return out

# ------------------------------------------------------------------ artwork
P = lambda **k: S(**k)

def eye_parts():
    return None

CX = (470, 788)

# --- body
body = N("BodyArt", (625, 1120), [
    S("Body", ["M410 714Q330 822 356 977Q325 1084 418 1117Q627 1163 847 1116Q947 1077 889 965Q940 831 838 714Z"], "fur", INK),
    S("Belly", ["M465 737Q410 886 443 1038Q457 1107 637 1119Q802 1116 826 1030L795 744Z"], "cream"),
    S("FootL", ["M403 1070Q350 1083 373 1125Q427 1160 510 1128Q464 1074 403 1070Z"], "fur", INK),
    S("FootR", ["M843 1070Q896 1083 879 1125Q823 1160 751 1128Q792 1074 843 1070Z"], "fur", INK),
    S("Toes", ["M406 1097Q388 1110 401 1127M447 1101Q430 1116 438 1132M842 1097Q861 1110 848 1127M804 1101Q821 1116 813 1132"], None, INK, sw=9),
])

# --- ears (outer fur + cream inner)
def ear(side, pivot, outer, inner):
    return N(f"EarLevel{side}", pivot, [N(f"EarFlick{side}", pivot, [N(f"EarMood{side}", pivot, [
        S(f"Ear{side}", [outer], "fur", INK),
        S(f"EarInner{side}", [inner], "cream", INK, sw=10),
    ])])])

earL = ear("L", (425, 291), "M354 320Q294 244 345 168Q406 91 480 200L463 316Z", "M376 285Q345 229 379 195Q411 174 441 247Z")
earR = ear("R", (845, 291), "M792 202Q860 90 923 167Q975 239 918 326L804 307Z", "M830 247Q854 178 888 195Q922 226 899 287Z")

head_art = [
    earL, earR,
    S("Head", ["M316 451Q344 229 523 180Q635 143 746 183Q915 222 939 452Q1044 485 1030 590Q1020 719 884 736Q804 766 753 746Q627 815 491 746Q409 755 346 733Q221 701 227 586Q225 496 316 451Z"], "fur", INK, sw=23),
    S("Stripes", ["M524 184L587 173Q586 326 604 420Q550 339 524 184Z", "M677 175L741 190Q715 342 655 420Q679 286 677 175Z"], "stripe"),
    S("Muzzle", ["M401 538Q350 480 389 385Q431 295 493 341Q559 390 574 552Q625 601 678 550Q695 389 761 343Q824 296 864 384Q905 477 865 539Q941 477 984 536Q1048 640 912 703Q834 740 773 723Q633 796 487 722Q399 745 310 683Q222 624 258 549Q296 479 401 538Z"], "cream"),
    N("BrowL", (453, 350), [S("BrowLArt", ["M400 361Q455 299 507 355"], None, INK, sw=17)]),
    N("BrowR", (800, 350), [S("BrowRArt", ["M747 355Q804 300 852 360"], None, INK, sw=17)]),
]
# eye bases
for cx in CX:
    head_art.append(S(f"EyeOutline{cx}", ell=(cx, 498, 72, 104), fill=INK))
    head_art.append(S(f"EyeWhite{cx}", ell=(cx, 509, 69, 94), fill="FFFFFDFA"))
# clip shapes (no paint): union of both eye ellipses
head_art.append(S("ClipPupils", [ellipse_d(cx, 509, 69, 94) for cx in CX]))
head_art.append(S("ClipLids", [ellipse_d(cx, 498, 73, 105) for cx in CX]))

pupil_kids = []
for cx in CX:
    pupil_kids.append(S(f"Pupil{cx}", ell=(cx + 9, 532, 53, 80), fill="FF35210C"))
    pupil_kids.append(S(f"Glint{cx}", ell=(cx - 1, 493, 17, 21), fill="FFFFFFFF"))
pupils = N("PupilClip", (0, 0), [N("PupilMood", (626, 509), [N("PupilLook", (626, 509), pupil_kids)])])
pupils.clip = "ClipPupils"
head_art.append(pupils)

lid_kids = []
for cx in CX:
    lid_kids.append(S(f"Lid{cx}", [f"M{cx-80} 185H{cx+80}V398Q{cx} 416 {cx-80} 398Z"], "FFF5D4A5"))
    lid_kids.append(S(f"LidEdge{cx}", [f"M{cx-80} 398Q{cx} 416 {cx+80} 398"], None, INK, sw=9))
    lid_kids.append(S(f"Lash{cx}", [f"M{cx-47} 343Q{cx} 373 {cx+47} 343"], None, INK, sw=9))
lids = N("LidClip", (0, 0), [N("LidMood", (626, 400), [N("LidBlink", (626, 400), lid_kids)])])
lids.clip = "ClipLids"
head_art.append(lids)

head_art.append(N("Nose", (626, 599), [
    S("NoseArt", ["M578 580Q594 555 626 563Q661 557 674 580Q680 611 626 633Q574 615 578 580Z"], INK, INK, sw=6),
    S("NoseShine", ell=(615, 580, 25, 9), fill="FF705031"),
]))

def mouth_smile(suffix):
    return [
        S("MouthSmileArt" + suffix, ["M548 646Q577 668 626 657Q676 668 704 646Q690 710 628 711Q567 707 548 646Z"], "FF563016", INK, sw=9),
        S("MouthTongue" + suffix, ["M599 699Q625 680 654 701"], None, "FFDC9778", sw=12),
    ]
head_art += [
    N("MouthRest", (626, 660), [
        S("MouthStem", ["M626 630V660"], None, INK, sw=12),
        S("MouthRestArt", ["M548 646Q551 685 590 683Q613 682 626 663Q643 687 667 683Q699 680 704 646"], None, INK, sw=12)]),
    N("MouthSmile", (626, 670), mouth_smile("")),
    N("PokeSmile", (626, 670), mouth_smile("P")),
    N("MouthThought", (626, 670), [S("MouthThoughtArt", ["M606 674Q627 680 649 669"], None, INK, sw=11)]),
    N("MouthConcern", (626, 670), [S("MouthConcernArt", ["M586 688Q626 660 666 688"], None, INK, sw=11)]),
]
head_art.append(N("Phones", (625, 330), [
    S("PhBand", ["M345 330C315 60 940 60 910 330"], None, "FF302A20", sw=55),
    S("PhBandIn", ["M345 310C335 100 920 100 910 310"], None, "FF718055", sw=24),
    S("PhCupL", rect=(343, 361, 100, 158, 42), fill="FF302A20"),
    S("PhCupLIn", rect=(336.5, 361, 55, 126, 25), fill="FF718055"),
    S("PhCupR", rect=(910, 361, 100, 158, 42), fill="FF302A20"),
    S("PhCupRIn", rect=(916.5, 361, 55, 126, 25), fill="FF718055"),
]))

head = N("HeadLevel", (625, 740), [N("HeadLook", (625, 740), [N("HeadMood", (625, 740), head_art)])])

# --- front of body
fur_paw_L = ["M360 750Q286 791 298 863Q312 922 370 921Q430 922 466 822Q505 838 518 815Q548 816 552 782Q574 757 548 731Q487 674 418 728Z"]
pawL = N("PawL", (380, 755), [
    S("PawLArt", fur_paw_L, "fur", INK, sw=17),
    S("PawLToes", ["M505 750Q540 770 530 791M482 780Q514 794 502 816M433 821Q458 836 478 817"], None, INK, sw=8),
])
pawR = N("PawR", (860, 770), [
    S("PawRArt", ["M863 759Q916 810 939 869Q967 963 886 975Q836 987 797 960Q764 945 777 922Q747 905 767 884Q760 854 803 847Q837 837 854 854"], "fur", INK, sw=17),
    S("PawRToes", ["M774 899L804 887M782 926L813 911M799 951L826 935"], None, INK, sw=8),
])
note = N("Note", (560, 860), [
    S("NoteArt", ["M498 789L581 758L650 924L557 944Z"], "FFFFF0D2", INK, sw=10),
    S("NoteClip", ell=(540, 776, 47, 23), fill="FFFFF6E5", rotation=-0.384),
    S("NoteLines", ["M514 779Q553 752 563 773Q565 786 535 792M556 831L592 817M568 853L602 840"], None, "FFC7A573", sw=7),
])
pouch = N("Pouch", (620, 1080), [
    S("PouchFront", ["M466 878Q614 951 773 878L772 983Q771 1078 670 1087L551 1080Q468 1075 466 986Z"], "bag", INK, sw=15),
    S("PouchStitch", ["M487 914L489 991Q490 1056 558 1060L664 1068Q747 1060 750 993V916"], None, "8C44481C", sw=6, dash=(15, 13), cap="butt"),
    S("Button", ell=(585, 999, 23, 23), fill="FF43471D", stroke=INK, sw=9),
    S("ButtonShine", ell=(580, 993, 9, 9), fill="FF959044"),
])

writing = N("Writing", (625, 850), [
    S("WForearmL", ["M384 751C340 755 315 806 331 848C347 887 386 895 426 876L512 835C536 817 526 786 500 779C458 771 425 743 384 751Z"], "fur", INK, sw=17),
    S("WCreaseL", ["M340 838Q358 879 405 866"], None, "FFA45C20", sw=12),
    N("Paper", (614, 850), [
        S("PaperArt", ["M521 738H705V954H521Z"], "FFFFF0D2", INK, sw=10),
        S("PaperLines", ["M550 783H646M550 810H633M550 837H658"], None, "FFBDA079", sw=7),
        S("Ink", ["M552 867L571 858L584 868L598 857L615 865L633 856"], None, "FF55623D", sw=7, trim=0),
    ]),
    S("WHandL", ["M494 792C469 796 458 822 467 845C476 866 504 871 526 855L544 839Q560 824 548 813Q538 804 521 813Q542 798 531 788Q516 779 494 792Z"], "fur", INK, sw=10),
    S("WHandLLines", ["M489 827Q505 825 521 817M491 845L514 837"], None, INK, sw=6),
    N("WritingPaw", (855, 760), [
        S("WForearmR", ["M858 752C899 757 925 802 913 844C902 884 869 901 834 886L741 840C716 825 714 797 737 783C775 770 819 743 858 752Z"], "fur", INK, sw=17),
        S("WCreaseR", ["M900 838Q883 877 850 875"], None, "FFA45C20", sw=12),
        S("WThumb", ["M751 776C729 760 698 768 689 791C680 814 692 841 716 846C744 853 771 832 774 810Q777 790 751 776Z"], "fur", INK, sw=10),
        N("Pen", (691, 799), [
            S("PenBody", ["M680 700H704V831L692 862L680 831Z"], "FF6E8050", INK, sw=7),
            S("PenTip", ["M680 831L692 862L704 831Z"], "FFE4C69C", INK, sw=6),
            S("PenPoint", ["M689 851L692 862L696 851"], INK, INK, sw=4),
            S("PenShine", ["M685 713H699"], None, "FFD5DDB7", sw=6),
        ]),
        S("WFinger", ["M716 785Q733 777 744 790Q754 804 738 817L720 824Q705 825 702 814Q698 803 716 799"], "fur", INK, sw=8),
        S("WFingerLine", ["M739 827L727 833"], None, INK, sw=6),
    ]),
])
BY_NAME["Pen"].props["rotation0"] = 0.5934  # applied via DEFAULTS below

thinking = N("Thinking", (626, 830), [
    S("TForearmL", ["M392 751C350 747 322 789 327 832C330 872 360 895 395 883C441 867 477 821 516 784C538 763 531 735 507 727C470 716 433 746 392 751Z"], "fur", INK, sw=17),
    S("TCreaseL", ["M341 833Q351 872 388 871"], None, "FFA45C20", sw=11),
    S("TForearmR", ["M856 752C899 755 922 795 915 834C908 874 877 893 842 880L713 827C688 816 683 790 700 772C721 752 746 767 771 773C805 780 824 749 856 752Z"], "fur", INK, sw=17),
    S("TPawR", ["M703 759C678 746 650 755 639 776C628 797 638 820 661 828C685 837 717 829 733 811Q750 792 733 776Q722 765 703 759Z"], "fur", INK, sw=11),
    S("TPawRLines", ["M650 788Q671 800 695 796M660 812Q680 817 701 810"], None, INK, sw=7),
    S("TFist", ["M478 745C478 715 499 696 526 704Q542 681 560 698L574 677Q586 662 599 673Q611 684 599 700L575 733Q581 757 561 775C542 793 513 787 494 776Q479 765 478 745Z"], "fur", INK, sw=12),
    S("TFistLines", ["M500 724Q517 716 528 731M500 746Q518 739 532 752M542 720L552 730"], None, INK, sw=7),
])

def tear_half(side):
    if side == "L":
        return N("TearL", (381, 750), [
            S("TLArm", ["M387 750C344 751 318 792 327 834C336 875 369 894 409 879L498 841C529 823 524 791 497 779C457 766 426 746 387 750Z"], "fur", INK, sw=17),
            S("TLPaper", ["M492 731H626L618 758L635 785L618 812L635 839L618 866L626 908H492Z"], "FFFFF0D2", INK, sw=10),
            S("TLLines", ["M515 767H586M515 789H576M515 844H582"], None, "FFBDA079", sw=7),
            S("TLHand", ["M483 786C457 788 445 814 456 838C466 861 493 866 514 851Q532 841 525 829Q520 819 503 824Q530 816 524 801Q516 783 483 786Z"], "fur", INK, sw=10),
            S("TLHandLines", ["M473 821L493 813M477 843L498 836"], None, INK, sw=6),
        ])
    return N("TearR", (864, 750), [
        S("TRArm", ["M858 750C901 751 927 792 918 834C909 875 876 894 836 879L747 841C716 823 721 791 748 779C788 766 819 746 858 750Z"], "fur", INK, sw=17),
        S("TRPaper", ["M626 731H760V908H626L618 866L635 839L618 812L635 785L618 758Z"], "FFFFF0D2", INK, sw=10),
        S("TRLines", ["M665 767H734M677 789H734M672 844H734"], None, "FFBDA079", sw=7),
        S("TRHand", ["M769 786C795 788 807 814 796 838C786 861 759 866 738 851Q720 841 727 829Q732 819 749 824Q722 816 728 801Q736 783 769 786Z"], "fur", INK, sw=10),
        S("TRHandLines", ["M779 821L759 813M775 843L754 836"], None, INK, sw=6),
    ])
tearing = N("Tearing", (625, 830), [tear_half("L"), tear_half("R")])

breath = N("Breath", (625, 1120), [body, head, note, S("StrapR", ["M782 753L842 751L767 920L710 896Z"], "bag", INK, sw=14),
                                   S("StrapL", ["M460 784L498 804L548 926L489 939Z"], "bag", INK, sw=14),
                                   S("PouchHole", ell=(615, 871, 149, 51), fill="FF393C19", stroke="FF5B5C24", sw=20),
                                   ])
# order inside Breath (back->front): body, head, straps, pouch hole, NOTE, pouch front, paws, writing...
breath.kids = [body, head,
               S("StrapR", ["M782 753L842 751L767 920L710 896Z"], "bag", INK, sw=14),
               S("StrapL", ["M460 784L498 804L548 926L489 939Z"], "bag", INK, sw=14),
               S("PouchHole2", ell=(615, 871, 149, 51), fill="FF393C19", stroke="FF5B5C24", sw=20),
               note, pouch, pawL, pawR, writing, thinking, tearing]

dots = N("Dots", (650, 114), [N(f"Dot{i}", (575 + i * 50, 114), [S(f"DotArt{i}", ell=(575 + i * 50, 114, 11, 11), fill="FF718055")]) for i in range(3)])
badgeP = N("BadgePause", (958, 1000), [
    S("BPCircle", ell=(958, 1000, 60, 60), fill="FFFFF0D5", stroke="FF718055", sw=10),
    S("BPBars", ["M940 974V1026M976 974V1026"], None, "FF4C5640", sw=14),
])
badgeA = N("BadgeAlert", (958, 1000), [
    S("BACircle", ell=(958, 1000, 60, 60), fill="FFFFF0D5", stroke="FFAE7133", sw=10),
    S("BABang", ["M958 967V1003M958 1026V1028"], None, "FF805321", sw=13),
])

hop = N("Hop", (625, 1120), [breath])
pokeN = N("Poke", (625, 1120), [hop])
world = N("World", (0, 0), [pokeN, dots, badgeP, badgeA])

def _locals(n, pp):
    if isinstance(n, S):
        return
    n.local = (n.pivot[0] - pp[0], n.pivot[1] - pp[1])
    for k in n.kids:
        _locals(k, n.pivot)
_locals(world, (0, 0))

# ------------------------------------------------------------------ defaults (authored pose == all mood/idle/poke/look defaults)
def setd(name, **kw):
    for k, v in kw.items():
        DEFAULTS[(name, k)] = v

# mood-owned
MOOD_PROPS = {}
def mood(name, **kw):
    for k, v in kw.items():
        MOOD_PROPS[(name, k)] = v
        DEFAULTS[(name, k)] = v
mood("Hop", y=0, scaleX=1, scaleY=1, rotation=0)
mood("HeadMood", y=0, rotation=0, scaleX=1, scaleY=1)
for s in "LR":
    mood(f"EarMood{s}", rotation=0)
mood("BrowL", y=0, rotation=0)
mood("BrowR", y=0, rotation=0)
mood("PupilMood", x=0, y=0)
mood("LidMood", y=0)
mood("MouthRest", opacity=1)
mood("MouthSmile", opacity=0)
mood("MouthThought", opacity=0)
mood("MouthConcern", opacity=0)
mood("Phones", y=-80, opacity=0)
mood("PawL", rotation=0, opacity=1, y=0)
mood("PawR", rotation=0, opacity=1)
mood("Note", y=0, opacity=1, rotation=0)
mood("Pouch", scaleX=1, scaleY=1)
mood("Writing", opacity=0)
mood("WritingPaw", rotation=0)
mood("Ink", opacity=1)
mood("Ink.trim", end=0)
mood("Thinking", opacity=0, y=40)
mood("Tearing", opacity=0)
mood("TearL", rotation=0)
mood("TearR", rotation=0)
mood("Dots", opacity=0)
for i in range(3):
    mood(f"Dot{i}", y=0)
mood("BadgePause", opacity=0, scaleX=0.5, scaleY=0.5)
mood("BadgeAlert", opacity=0, scaleX=0.5, scaleY=0.5)
# idle-owned
for k in ("scaleX", "scaleY"):
    setd("Breath", **{k: 1})
setd("LidBlink", y=0)
setd("Nose", y=0, rotation=0)
setd("EarFlickL", rotation=0); setd("EarFlickR", rotation=0)
# look / level / poke owned
setd("PupilLook", x=0, y=0)
setd("HeadLook", x=0, y=0, rotation=0)
setd("HeadLevel", y=0, scaleY=1)
setd("EarLevelL", rotation=0); setd("EarLevelR", rotation=0)
setd("Poke", scaleX=1, scaleY=1, rotation=0)
setd("PokeSmile", opacity=0)
# pen is drawn tilted
setd("Pen", rotation=0.5934)
setd("Paper", rotation=-0.1222)
setd("TearL", rotation=0)
# note: Ink.trim is a TrimPath, authored on the shape; DEFAULTS entry only matters for animations
DEFAULTS.pop(("Ink.trim", "end"))

# ------------------------------------------------------------------ easing + animation helpers
EASE = {
    "io":    (0.42, 0, 0.58, 1),
    "out":   (0.0, 0.0, 0.2, 1),
    "in":    (0.5, 0, 1, 1),
    "back":  (0.34, 1.7, 0.64, 1),     # ease-out with overshoot
    "back2": (0.3, 2.4, 0.5, 1),       # bigger overshoot
    "inback": (0.5, -0.5, 0.8, 0.4),   # anticipation (pull back then go)
    "soft":  (0.25, 0.1, 0.25, 1),
}

def kf(frame, value, ease="io"):
    return (frame, value, ease)

def tid(name):
    return BY_NAME[name].id

ANIMS = []  # (name, id, xml)

def anim(name, duration, loop, tracks, fill_defaults=True):
    """tracks: {objname: {prop: [kf,...]}}; for mood anims all MOOD_PROPS not mentioned are keyed flat."""
    tracks = {o: dict(p) for o, p in tracks.items()}
    if fill_defaults:
        for (o, p), v in MOOD_PROPS.items():
            tracks.setdefault(o, {})
            if p not in tracks[o]:
                tracks[o][p] = [kf(0, v)]
    aid = nid()
    x = f'        <LinearAnimation loopValue="{loop}" fps="{FPS}" duration="{duration}" name="{name}" id="{aid}">\n'
    for o, props in tracks.items():
        target = BY_NAME[o.split(".")[0]] if "." not in o else BY_NAME[o]
        x += f'            <KeyedObject objectId="{target.id}">\n'
        for p, keys in props.items():
            keys = sorted(keys, key=lambda k: k[0])
            if keys[0][0] != 0:
                dv = MOOD_PROPS.get((o, p), DEFAULTS.get((o, p), 0))
                keys = [kf(0, dv)] + keys
            x += f'                <KeyedProperty property="{p}">\n'
            for (fr, val, ease) in keys:
                if p in ("x", "y") and hasattr(target, "local"):
                    val = val + target.local[0 if p == "x" else 1]
                if ease in ("hold", "linear"):
                    x += f'                    <KeyFrameDouble value="{f(val)}" frame="{fr}" interpolationType="{ease}"/>\n'
                else:
                    a, b, c, d = EASE[ease]
                    x += (f'                    <KeyFrameDouble value="{f(val)}" frame="{fr}" interpolationType="cubic">'
                          f'<CubicEaseInterpolator x1="{a}" y1="{b}" x2="{c}" y2="{d}"/></KeyFrameDouble>\n')
            x += "                </KeyedProperty>\n"
        x += "            </KeyedObject>\n"
    x += "        </LinearAnimation>\n"
    ANIMS.append((name, aid, x))
    return aid

def T(sec):
    return int(round(sec * FPS))

# ------------------------------------------------------------------ IDLE LIFE (always looping, 10 s)
idle_tracks = {
    "Breath": {
        "scaleY": [kf(0, 1), kf(75, 1.014), kf(150, 1), kf(225, 1.014), kf(300, 1), kf(375, 1.014), kf(450, 1), kf(525, 1.014), kf(600, 1)],
        "scaleX": [kf(0, 1), kf(75, 0.996), kf(150, 1), kf(225, 0.996), kf(300, 1), kf(375, 0.996), kf(450, 1), kf(525, 0.996), kf(600, 1)],
    },
    # blink at 3.1s, double blink at 6.8s/7.15s
    "LidBlink": {"y": [kf(0, 0, "hold"), kf(182, 0, "in"), kf(188, 214, "out"), kf(190, 214, "io"), kf(198, 0, "hold"),
                       kf(408, 0, "in"), kf(413, 214, "out"), kf(415, 214, "io"), kf(422, 0, "hold"),
                       kf(429, 0, "in"), kf(434, 214, "out"), kf(436, 214, "io"), kf(444, 0, "hold"), kf(600, 0)]},
    # sniff at 5 s: nose twitches
    "Nose": {
        "y": [kf(0, 0, "hold"), kf(296, 0, "out"), kf(300, -5, "io"), kf(304, 1.5, "io"), kf(308, -5, "io"), kf(312, 1, "io"), kf(316, -3, "io"), kf(322, 0, "hold"), kf(600, 0)],
        "rotation": [kf(0, 0, "hold"), kf(296, 0, "out"), kf(300, -0.05, "io"), kf(304, 0.05, "io"), kf(308, -0.05, "io"), kf(312, 0.04, "io"), kf(316, -0.03, "io"), kf(322, 0, "hold"), kf(600, 0)],
    },
    # ear flicks: left at 2 s, right at 8.2 s
    "EarFlickL": {"rotation": [kf(0, 0, "hold"), kf(120, 0, "out"), kf(128, -0.2, "back"), kf(142, 0.06, "io"), kf(154, -0.04, "io"), kf(166, 0, "hold"), kf(600, 0)]},
    "EarFlickR": {"rotation": [kf(0, 0, "hold"), kf(492, 0, "out"), kf(500, 0.2, "back"), kf(514, -0.06, "io"), kf(526, 0.04, "io"), kf(538, 0, "hold"), kf(600, 0)]},
}
A_IDLE_LIFE = anim("IdleLife", 600, "loop", idle_tracks, fill_defaults=False)

# ------------------------------------------------------------------ MOOD ANIMATIONS
moods = {}
def mood_anim(idx, name, dur, loop, tracks):
    moods[idx] = (name, anim(name, dur, loop, tracks), loop)

mood_anim(0, "Mood0_Idle", 1, "oneShot", {})

# 1 listening: headphones on, pen in paw, gentle bob (3 s loop)
mood_anim(1, "Mood1_Listening", 180, "loop", {
    "Phones": {"y": [kf(0, 0)], "opacity": [kf(0, 1)]},
    "Writing": {"opacity": [kf(0, 1)]},
    "PawL": {"opacity": [kf(0, 0)]}, "PawR": {"opacity": [kf(0, 0)]}, "Note": {"opacity": [kf(0, 0)]},
    "BrowL": {"y": [kf(0, -10)]}, "BrowR": {"y": [kf(0, -10)]},
    "PupilMood": {"y": [kf(0, 9)]},
    "EarMoodL": {"rotation": [kf(0, -0.07)]}, "EarMoodR": {"rotation": [kf(0, 0.07)]},
    "HeadMood": {
        "rotation": [kf(0, -0.016), kf(45, 0.016), kf(90, -0.016), kf(135, 0.016), kf(180, -0.016)],
        "y": [kf(0, 0), kf(22, 4), kf(45, 0), kf(67, 4), kf(90, 0), kf(112, 4), kf(135, 0), kf(157, 4), kf(180, 0)],
    },
    "Hop": {"scaleY": [kf(0, 1), kf(22, 1.004), kf(45, 1), kf(67, 1.004), kf(90, 1), kf(112, 1.004), kf(135, 1), kf(157, 1.004), kf(180, 1)]},
    "WritingPaw": {"rotation": [kf(0, 0), kf(10, -0.03), kf(20, 0.025), kf(30, -0.035), kf(40, 0.025), kf(50, -0.03), kf(60, 0.03), kf(70, -0.03),
                                kf(80, 0.03), kf(90, -0.025), kf(100, 0.025), kf(112, -0.02), kf(124, 0.015), kf(136, 0), kf(180, 0)]},
    "Ink.trim": {"end": [kf(6, 0, "linear"), kf(126, 1, "hold"), kf(172, 1, "hold"), kf(173, 0, "hold"), kf(180, 0)]},
    "Ink": {"opacity": [kf(0, 1, "hold"), kf(150, 1, "linear"), kf(172, 0, "hold"), kf(180, 1)]},
})

# 2 thinking: paw to chin, eyes up/side, thought dots (2.4 s loop)
dot_tracks = {}
for i in range(3):
    o = i * 12
    dot_tracks[f"Dot{i}"] = {"y": [kf(0, 0, "out"), kf(o + 6, 0, "out"), kf(o + 22, -14, "io"), kf(o + 44, 0, "out"), kf(o + 78, 0, "out"), kf(o + 94, -14, "io"), kf(o + 116, 0), kf(144, 0)]}
mood_anim(2, "Mood2_Thinking", 144, "loop", {
    "Thinking": {"opacity": [kf(0, 1)], "y": [kf(0, 0)]},
    "PawL": {"opacity": [kf(0, 0)]}, "PawR": {"opacity": [kf(0, 0)]}, "Note": {"opacity": [kf(0, 0)]},
    "MouthRest": {"opacity": [kf(0, 0)]}, "MouthThought": {"opacity": [kf(0, 1)]},
    "BrowL": {"y": [kf(0, -9)]}, "BrowR": {"y": [kf(0, -9)], "rotation": [kf(0, 0.06)]},
    "Dots": {"opacity": [kf(0, 1)]},
    "PupilMood": {"x": [kf(0, 17, "soft"), kf(40, 17, "soft"), kf(62, -14, "soft"), kf(100, -14, "soft"), kf(124, 17, "soft"), kf(144, 17)],
                  "y": [kf(0, -21, "soft"), kf(40, -21, "soft"), kf(62, -18, "soft"), kf(100, -18, "soft"), kf(124, -21, "soft"), kf(144, -21)]},
    "HeadMood": {"rotation": [kf(0, 0.045, "io"), kf(72, 0.065, "io"), kf(144, 0.045)], "y": [kf(0, 3, "io"), kf(72, 5, "io"), kf(144, 3)]},
    "EarMoodL": {"rotation": [kf(0, 0.05)]}, "EarMoodR": {"rotation": [kf(0, 0.08)]},
    "Hop": {"scaleY": [kf(0, 1)]},
    **dot_tracks,
})

# 3 paused: headphones on, eyes half closed, still
mood_anim(3, "Mood3_Paused", 60, "oneShot", {
    "Phones": {"y": [kf(0, 0)], "opacity": [kf(0, 1)]},
    "LidMood": {"y": [kf(0, 66)]},
    "PupilMood": {"y": [kf(0, 12)]},
    "HeadMood": {"y": [kf(0, 5)], "rotation": [kf(0, 0.02)]},
    "EarMoodL": {"rotation": [kf(0, 0.1)]}, "EarMoodR": {"rotation": [kf(0, -0.1)]},
    "BrowL": {"y": [kf(0, 5)]}, "BrowR": {"y": [kf(0, 5)]},
    "BadgePause": {"opacity": [kf(0, 0, "linear"), kf(4, 1, "hold")], "scaleX": [kf(0, 0.5, "back"), kf(22, 1)], "scaleY": [kf(0, 0.5, "back"), kf(22, 1)]},
    "Hop": {"scaleY": [kf(0, 1, "io"), kf(20, 0.99)], "scaleX": [kf(0, 1, "io"), kf(20, 1.004)]},
})

# 4 attention: raised brow, small paw wave, hold
mood_anim(4, "Mood4_Attention", 96, "oneShot", {
    "BrowL": {"y": [kf(0, 0, "back"), kf(14, -22)], "rotation": [kf(0, 0, "back"), kf(14, -0.08)]},
    "BrowR": {"y": [kf(0, 0, "back"), kf(14, -6)]},
    "MouthRest": {"opacity": [kf(0, 1, "linear"), kf(8, 0)]}, "MouthConcern": {"opacity": [kf(0, 0, "linear"), kf(8, 1)]},
    "PupilMood": {"y": [kf(0, 0, "out"), kf(12, -6)]},
    "PawL": {"rotation": [kf(0, 0, "inback"), kf(8, 0.06, "back2"), kf(20, -0.34, "io"), kf(32, -0.12, "io"), kf(44, -0.32, "io"), kf(56, -0.1, "io"), kf(68, -0.26, "io"), kf(84, 0, "back")],
             "y": [kf(0, 0, "out"), kf(20, -26, "io"), kf(70, -20, "io"), kf(86, 0)]},
    "EarMoodL": {"rotation": [kf(0, 0, "back"), kf(12, -0.16)]}, "EarMoodR": {"rotation": [kf(0, 0, "back"), kf(12, 0.16)]},
    "HeadMood": {"rotation": [kf(0, 0, "io"), kf(16, -0.04, "io"), kf(40, -0.03)], "y": [kf(0, 0, "back"), kf(14, -6)]},
    "Hop": {"scaleY": [kf(0, 1, "out"), kf(6, 0.975, "back"), kf(16, 1.03, "io"), kf(30, 0.99, "io"), kf(44, 1)],
            "scaleX": [kf(0, 1, "out"), kf(6, 1.025, "back"), kf(16, 0.985, "io"), kf(30, 1.008, "io"), kf(44, 1)]},
    "BadgeAlert": {"opacity": [kf(0, 0, "linear"), kf(4, 1, "hold")], "scaleX": [kf(0, 0.5, "back2"), kf(22, 1)], "scaleY": [kf(0, 0.5, "back2"), kf(22, 1)]},
})

# 5 saved: tucks paper into pouch (2.0 s)
mood_anim(5, "Mood5_Saved", 118, "oneShot", {
    "Hop": {"scaleY": [kf(0, 1, "out"), kf(8, 0.965, "back"), kf(24, 1.01, "io"), kf(62, 0.985, "back"), kf(76, 1.03, "io"), kf(94, 0.99, "io"), kf(108, 1)],
            "scaleX": [kf(0, 1, "out"), kf(8, 1.03, "back"), kf(24, 0.995, "io"), kf(62, 1.015, "back"), kf(76, 0.975, "io"), kf(94, 1.008, "io"), kf(108, 1)]},
    "Note": {"y": [kf(0, 0, "inback"), kf(22, -34, "io"), kf(64, 150, "hold"), kf(70, 150, "hold"), kf(71, 0)],
             "rotation": [kf(0, 0, "io"), kf(22, -0.04, "io"), kf(64, 0.03, "hold"), kf(71, 0)],
             "opacity": [kf(0, 1, "hold"), kf(66, 1, "hold"), kf(67, 0, "hold"), kf(98, 0, "linear"), kf(112, 1)]},
    "PawL": {"rotation": [kf(0, 0, "inback"), kf(22, -0.1, "io"), kf(60, 0.24, "back"), kf(84, 0, "back")],
             "y": [kf(0, 0, "io"), kf(22, -8, "io"), kf(60, 22, "back"), kf(84, 0)]},
    "Pouch": {"scaleX": [kf(0, 1, "hold"), kf(56, 1, "back2"), kf(66, 1.07, "back"), kf(96, 1)],
              "scaleY": [kf(0, 1, "hold"), kf(56, 1, "back2"), kf(66, 0.94, "back"), kf(96, 1)]},
    "HeadMood": {"rotation": [kf(0, 0, "io"), kf(22, -0.035, "io"), kf(64, 0.0, "back"), kf(84, 0.02, "io"), kf(110, 0)],
                 "y": [kf(0, 0, "io"), kf(22, 3, "io"), kf(62, 8, "back"), kf(86, -2, "io"), kf(110, 0)]},
    "PupilMood": {"y": [kf(0, 0, "io"), kf(18, 12, "io"), kf(66, 12, "io"), kf(84, 0)]},
    "BrowL": {"y": [kf(0, 0, "io"), kf(70, -8, "io"), kf(104, 0)]}, "BrowR": {"y": [kf(0, 0, "io"), kf(70, -8, "io"), kf(104, 0)]},
    "MouthRest": {"opacity": [kf(0, 1, "linear"), kf(64, 1, "linear"), kf(72, 0, "hold"), kf(104, 0, "linear"), kf(116, 1)]},
    "MouthSmile": {"opacity": [kf(0, 0, "linear"), kf(64, 0, "linear"), kf(72, 1, "hold"), kf(104, 1, "linear"), kf(116, 0)]},
    "EarMoodL": {"rotation": [kf(0, 0, "io"), kf(70, -0.1, "back"), kf(100, 0)]}, "EarMoodR": {"rotation": [kf(0, 0, "io"), kf(70, 0.1, "back"), kf(100, 0)]},
})

# 6 completed: happy hop, tears the task paper in two (2.0 s)
mood_anim(6, "Mood6_Completed", 120, "oneShot", {
    "Hop": {"y": [kf(0, 0, "out"), kf(12, 0, "out"), kf(30, -64, "in"), kf(46, 0, "out"), kf(78, 0, "out"), kf(90, -34, "in"), kf(102, 0, "out"), kf(106, 0)],
            "scaleY": [kf(0, 1, "out"), kf(10, 0.9, "back"), kf(20, 1.09, "io"), kf(34, 1.02, "io"), kf(46, 0.88, "back"), kf(58, 1.03, "io"), kf(72, 1, "out"), kf(80, 0.95, "back"), kf(92, 1.05, "io"), kf(102, 0.93, "back"), kf(116, 1)],
            "scaleX": [kf(0, 1, "out"), kf(10, 1.07, "back"), kf(20, 0.95, "io"), kf(34, 0.99, "io"), kf(46, 1.1, "back"), kf(58, 0.98, "io"), kf(72, 1, "out"), kf(80, 1.04, "back"), kf(92, 0.97, "io"), kf(102, 1.06, "back"), kf(116, 1)]},
    "PawL": {"opacity": [kf(0, 1, "hold"), kf(7, 0, "hold"), kf(106, 0, "hold"), kf(107, 1)]},
    "PawR": {"opacity": [kf(0, 1, "hold"), kf(7, 0, "hold"), kf(106, 0, "hold"), kf(107, 1)]},
    "Note": {"opacity": [kf(0, 1, "hold"), kf(7, 0, "hold"), kf(106, 0, "hold"), kf(107, 1)]},
    "Tearing": {"opacity": [kf(0, 0, "hold"), kf(7, 1, "hold"), kf(104, 1, "linear"), kf(112, 0)]},
    "TearL": {"rotation": [kf(0, 0, "hold"), kf(8, 0, "inback"), kf(44, 0, "back2"), kf(66, 0.3, "io"), kf(88, 0.24, "io"), kf(110, 0.24)]},
    "TearR": {"rotation": [kf(0, 0, "hold"), kf(8, 0, "inback"), kf(44, 0, "back2"), kf(66, -0.3, "io"), kf(88, -0.24, "io"), kf(110, -0.24)]},
    "BrowL": {"y": [kf(0, 0, "back"), kf(14, -12), kf(100, -12, "io"), kf(118, 0)]}, "BrowR": {"y": [kf(0, 0, "back"), kf(14, -12), kf(100, -12, "io"), kf(118, 0)]},
    "MouthRest": {"opacity": [kf(0, 1, "linear"), kf(8, 0, "hold"), kf(104, 0, "linear"), kf(118, 1)]},
    "MouthSmile": {"opacity": [kf(0, 0, "linear"), kf(8, 1, "hold"), kf(104, 1, "linear"), kf(118, 0)]},
    "HeadMood": {"rotation": [kf(0, 0, "io"), kf(30, -0.07, "io"), kf(46, 0.04, "io"), kf(68, -0.02, "io"), kf(92, 0.06, "io"), kf(108, 0)],
                 "y": [kf(0, 0, "io"), kf(10, 6, "io"), kf(34, -6, "io"), kf(48, 8, "io"), kf(70, 0)]},
    "PupilMood": {"y": [kf(0, 0, "io"), kf(14, 10, "io"), kf(90, 10, "io"), kf(108, 0)]},
    "EarMoodL": {"rotation": [kf(0, 0, "io"), kf(34, 0.2, "back"), kf(48, -0.14, "io"), kf(62, 0.06, "io"), kf(78, 0)]},
    "EarMoodR": {"rotation": [kf(0, 0, "io"), kf(34, -0.2, "back"), kf(48, 0.14, "io"), kf(62, -0.06, "io"), kf(78, 0)]},
})

# 7 cancelled: soft slow blink, settle (1.5 s)
mood_anim(7, "Mood7_Cancelled", 90, "oneShot", {
    "LidMood": {"y": [kf(0, 0, "io"), kf(26, 214, "io"), kf(44, 214, "io"), kf(72, 0)]},
    "HeadMood": {"y": [kf(0, 0, "io"), kf(28, 9, "io"), kf(50, 9, "back"), kf(78, 0)],
                 "rotation": [kf(0, 0, "io"), kf(28, 0.035, "io"), kf(50, 0.03, "back"), kf(78, 0)]},
    "Hop": {"scaleY": [kf(0, 1, "io"), kf(28, 0.972, "io"), kf(52, 0.975, "back"), kf(80, 1)],
            "scaleX": [kf(0, 1, "io"), kf(28, 1.012, "io"), kf(52, 1.01, "back"), kf(80, 1)]},
    "EarMoodL": {"rotation": [kf(0, 0, "io"), kf(30, 0.12, "io"), kf(54, 0.1, "back"), kf(82, 0)]},
    "EarMoodR": {"rotation": [kf(0, 0, "io"), kf(30, -0.12, "io"), kf(54, -0.1, "back"), kf(82, 0)]},
    "BrowL": {"y": [kf(0, 0, "io"), kf(28, 5, "io"), kf(56, 5, "back"), kf(80, 0)]}, "BrowR": {"y": [kf(0, 0, "io"), kf(28, 5, "io"), kf(56, 5, "back"), kf(80, 0)]},
})

# 8 failed: worried brows, small head shake (1.8 s)
mood_anim(8, "Mood8_Failed", 108, "oneShot", {
    "BrowL": {"y": [kf(0, 0, "back"), kf(12, -14, "io"), kf(90, -14, "io"), kf(108, 0)], "rotation": [kf(0, 0, "back"), kf(12, -0.3, "io"), kf(90, -0.3, "io"), kf(108, 0)]},
    "BrowR": {"y": [kf(0, 0, "back"), kf(12, -14, "io"), kf(90, -14, "io"), kf(108, 0)], "rotation": [kf(0, 0, "back"), kf(12, 0.3, "io"), kf(90, 0.3, "io"), kf(108, 0)]},
    "MouthRest": {"opacity": [kf(0, 1, "linear"), kf(8, 0, "hold"), kf(96, 0, "linear"), kf(108, 1)]},
    "MouthConcern": {"opacity": [kf(0, 0, "linear"), kf(8, 1, "hold"), kf(96, 1, "linear"), kf(108, 0)]},
    "HeadMood": {"rotation": [kf(0, 0, "out"), kf(8, 0, "io"), kf(16, -0.08, "io"), kf(28, 0.08, "io"), kf(40, -0.06, "io"), kf(50, 0.045, "io"), kf(60, -0.025, "io"), kf(70, 0.01, "io"), kf(82, 0)],
                 "y": [kf(0, 0, "io"), kf(14, 6, "io"), kf(90, 6, "io"), kf(108, 0)]},
    "PupilMood": {"x": [kf(0, 0, "out"), kf(8, 0, "io"), kf(16, 8, "io"), kf(28, -8, "io"), kf(40, 6, "io"), kf(50, -4, "io"), kf(62, 0)], "y": [kf(0, 0, "io"), kf(14, 6, "io"), kf(90, 6, "io"), kf(108, 0)]},
    "Hop": {"scaleY": [kf(0, 1, "out"), kf(6, 0.955, "back"), kf(20, 1.012, "io"), kf(40, 0.99, "io"), kf(60, 1)],
            "scaleX": [kf(0, 1, "out"), kf(6, 1.035, "back"), kf(20, 0.995, "io"), kf(40, 1.005, "io"), kf(60, 1)]},
    "EarMoodL": {"rotation": [kf(0, 0, "io"), kf(16, 0.16, "back"), kf(90, 0.16, "io"), kf(108, 0)]},
    "EarMoodR": {"rotation": [kf(0, 0, "io"), kf(16, -0.16, "back"), kf(90, -0.16, "io"), kf(108, 0)]},
    "BadgeAlert": {"opacity": [kf(0, 0, "linear"), kf(6, 1, "hold"), kf(98, 1, "linear"), kf(108, 0)], "scaleX": [kf(0, 0.5, "back2"), kf(24, 1)], "scaleY": [kf(0, 0.5, "back2"), kf(24, 1)]},
})

# ------------------------------------------------------------------ POKE (one-shot on the Poke node + smile overlay)
POKE_TRACKS = {
    "Poke": {
        "scaleX": [kf(0, 1, "out"), kf(5, 1.12, "back"), kf(15, 0.93, "io"), kf(26, 1.035, "io"), kf(38, 0.99, "io"), kf(50, 1)],
        "scaleY": [kf(0, 1, "out"), kf(5, 0.84, "back"), kf(15, 1.12, "io"), kf(26, 0.975, "io"), kf(38, 1.01, "io"), kf(50, 1)],
        "rotation": [kf(0, 0, "hold"), kf(6, 0, "io"), kf(14, 0.07, "io"), kf(24, -0.06, "io"), kf(34, 0.035, "io"), kf(44, -0.012, "io"), kf(54, 0)],
    },
    "PokeSmile": {"opacity": [kf(0, 0, "linear"), kf(5, 1, "hold"), kf(46, 1, "linear"), kf(58, 0)]},
}
A_POKE = anim("Poke", 58, "oneShot", POKE_TRACKS, fill_defaults=False)
A_POKE_REST = anim("PokeRest", 1, "oneShot", {"Poke": {"scaleX": [kf(0, 1)], "scaleY": [kf(0, 1)], "rotation": [kf(0, 0)]}, "PokeSmile": {"opacity": [kf(0, 0)]}}, fill_defaults=False)

# ------------------------------------------------------------------ LOOK + LEVEL (joystick-posed ranges)
def lin(a, b, c):
    return [kf(0, a, "linear"), kf(50, b, "linear"), kf(100, c)]
A_LOOKX = anim("LookX", 100, "oneShot", {
    "PupilLook": {"x": lin(-25, 0, 25)},
    "HeadLook": {"rotation": lin(-0.05, 0, 0.05), "x": lin(-10, 0, 10)},
}, fill_defaults=False)
A_LOOKY = anim("LookY", 100, "oneShot", {
    "PupilLook": {"y": lin(-20, 0, 20)},
    "HeadLook": {"y": lin(-6, 0, 6)},
}, fill_defaults=False)
# level 0 -> frame 50 (rest), level 1 -> frame 100 (loud); first half is unused
A_LEVEL = anim("Level", 100, "oneShot", {
    "HeadLevel": {"y": [kf(0, 0, "linear"), kf(50, 0, "linear"), kf(100, -14)], "scaleY": [kf(0, 1, "linear"), kf(50, 1, "linear"), kf(100, 1.02)]},
    "EarLevelL": {"rotation": [kf(0, 0, "linear"), kf(50, 0, "linear"), kf(100, -0.16)]},
    "EarLevelR": {"rotation": [kf(0, 0, "linear"), kf(50, 0, "linear"), kf(100, 0.16)]},
}, fill_defaults=False)

# ------------------------------------------------------------------ view model + state machine
VM = nid(); VM_INST = nid()
P_MOOD, P_LEVEL, P_LX, P_LY, P_POKE = nid(), nid(), nid(), nid(), nid()
SM_ID = nid()

def num_condition(prop, value):
    return (f'<TransitionViewModelCondition opValue="equal"><TransitionPropertyViewModelComparator>'
            f'<BindablePropertyNumber><DataBindContext sourcePathIds="{VM}-{prop}" propertyKey="636"/></BindablePropertyNumber>'
            f'</TransitionPropertyViewModelComparator><TransitionValueNumberComparator value="{value}"/></TransitionViewModelCondition>')
def trig_condition(prop):
    return (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator>'
            f'<BindablePropertyTrigger><DataBindContext sourcePathIds="{VM}-{prop}" propertyKey="686"/></BindablePropertyTrigger>'
            f'</TransitionPropertyViewModelComparator><TransitionValueTriggerComparator value="0"/></TransitionViewModelCondition>')

def sm_xml():
    s = f'        <StateMachine name="Main" id="{SM_ID}">\n'
    # layer 1: idle life
    st_idle = nid()
    s += f'''            <StateMachineLayer name="IdleLife">
                <AnyState x="0" y="-120"/>
                <ExitState x="400" y="-120"/>
                <EntryState x="0" y="0"><StateTransition stateToId="{st_idle}"/></EntryState>
                <AnimationState x="200" y="0" animationId="{A_IDLE_LIFE}" id="{st_idle}"/>
            </StateMachineLayer>\n'''
    # layer 2: mood — AnyState -> state when mood == k
    ids = {k: nid() for k in moods}
    s += '            <StateMachineLayer name="Mood">\n                <AnyState x="0" y="-140">\n'
    for k, (nm, aid, loop) in moods.items():
        s += (f'                    <StateTransition stateToId="{ids[k]}" duration="{260 if k in (0, 1, 2, 3) else 140}" '
              f'interpolationType="cubic">{num_condition(P_MOOD, k)}<CubicEaseInterpolator x1="0.3" y1="0" x2="0.2" y2="1"/></StateTransition>\n')
    s += '                </AnyState>\n                <ExitState x="900" y="-140"/>\n'
    s += f'                <EntryState x="0" y="0"><StateTransition stateToId="{ids[0]}"/></EntryState>\n'
    for k, (nm, aid, loop) in moods.items():
        s += f'                <AnimationState x="{200 + 180 * k}" y="{(k % 2) * 140}" animationId="{aid}" reset="true" id="{ids[k]}"/>\n'
    s += "            </StateMachineLayer>\n"
    # layer 3: poke
    sr, sp = nid(), nid()
    s += f'''            <StateMachineLayer name="Poke">
                <AnyState x="0" y="-140"/>
                <ExitState x="600" y="-140"/>
                <EntryState x="0" y="0"><StateTransition stateToId="{sr}"/></EntryState>
                <AnimationState x="200" y="0" animationId="{A_POKE_REST}" id="{sr}">
                    <StateTransition stateToId="{sp}" duration="40" interpolationType="cubic">{trig_condition(P_POKE)}<CubicEaseInterpolator x1="0.3" y1="0" x2="0.2" y2="1"/></StateTransition>
                </AnimationState>
                <AnimationState x="400" y="0" animationId="{A_POKE}" reset="true" id="{sp}">
                    <StateTransition stateToId="{sr}" duration="120" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" interpolationType="cubic"><CubicEaseInterpolator x1="0.3" y1="0" x2="0.2" y2="1"/></StateTransition>
                    <StateTransition stateToId="{sp}" duration="30">{trig_condition(P_POKE)}</StateTransition>
                </AnimationState>
            </StateMachineLayer>\n'''
    s += "        </StateMachine>\n"
    return s

def joystick(name, xid, yid, px, py):
    s = f'        <Joystick posX="0" posY="0" xId="{xid}"' if xid else '        <Joystick posX="0" posY="0"'
    if yid:
        s += f' yId="{yid}"'
    s += f' name="{name}" id="{nid()}">\n'
    if px:
        s += f'            <DataBindContext sourcePathIds="{VM}-{px}" propertyKey="299"/>\n'
    if py:
        s += f'            <DataBindContext sourcePathIds="{VM}-{py}" propertyKey="300"/>\n'
    s += "        </Joystick>\n"
    return s

# ------------------------------------------------------------------ write
def build():
    out = '<Rive version="1" kind="fragment">\n'
    art_id = "0:2"; style_id = "0:5"
    out += (f'    <Artboard defaultStateMachineId="{SM_ID}" styleId="{style_id}" viewModelId="{VM}" viewModelInstanceId="{VM_INST}" '
            f'width="{ART_W}" height="{ART_H}" name="Tucky" id="{art_id}">\n')
    out += f'        <LayoutComponentStyle name="Artboard Style" id="{style_id}"/>\n'
    # world node holds the original-coordinate offset
    w = emit(world, (0, 0), "        ")
    w = w.replace('<Node x="0" y="0" name="World"', f'<Node x="{WORLD_X}" y="{WORLD_Y}" name="World"', 1)
    out += w
    out += sm_xml()
    out += joystick("LookJoystick", A_LOOKX, A_LOOKY, P_LX, P_LY)
    out += joystick("LevelJoystick", A_LEVEL, None, P_LEVEL, None)
    for _, _, x in ANIMS:
        out += x
    out += "    </Artboard>\n"
    out += f'''    <ViewModel defaultInstanceId="{VM_INST}" name="Pet" id="{VM}">
        <ViewModelPropertyNumber name="mood" id="{P_MOOD}"/>
        <ViewModelPropertyNumber name="level" id="{P_LEVEL}"/>
        <ViewModelPropertyNumber name="lookX" id="{P_LX}"/>
        <ViewModelPropertyNumber name="lookY" id="{P_LY}"/>
        <ViewModelPropertyTrigger name="poke" id="{P_POKE}"/>
        <ViewModelInstance exports="true" name="Default" id="{VM_INST}">
            <ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{P_MOOD}"/>
            <ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{P_LEVEL}"/>
            <ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{P_LX}"/>
            <ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{P_LY}"/>
            <ViewModelInstanceTrigger propertyValue="0" viewModelPropertyId="{P_POKE}"/>
        </ViewModelInstance>
    </ViewModel>
</Rive>
'''
    return out

if __name__ == "__main__":
    # World's DEFAULTS must not leak x/y; emitted raw above
    xml = build()
    with open(OUT, "w") as fh:
        fh.write(xml)
    print("wrote", OUT, len(xml), "bytes")
