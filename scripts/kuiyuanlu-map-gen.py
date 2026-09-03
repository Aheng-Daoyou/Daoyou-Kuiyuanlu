# -*- coding: utf-8 -*-
"""窥渊录·烬洲大地图底图生成器
按 docs/窥渊录-烬洲地理志.md 第六节的地貌规范，程序化生成水墨风 SVG 底图。
输出: docs/assets-src/kuiyuanlu-map.svg
栅格化: Edge headless 截图 -> webp
"""
import math
import random

W, H = 3056, 2143
rng = random.Random(20260903)

INK = "#2c1810"
SEA = "#e0d5b8"
SEA_DEEP = "#d3c5a2"
LAND = "#f6f0df"
LAND_HI = "#faf5e7"
MOUNT_FILL = "#eee4cb"
MOUNT_FILL_DARK = "#e2d5b4"
RIVER = "#8a9aa6"
MIST = "#ffffff"

parts = []


def P(xp, yp):
    return (xp / 100.0 * W, yp / 100.0 * H)


def f(v):
    return f"{v:.1f}"


def add(s):
    parts.append(s)


# ── 底色：宣纸 + 海陆 ─────────────────────────────────────────────
add(f'<rect width="{W}" height="{H}" fill="{SEA}"/>')


def point_in_poly(x, y, poly):
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


# 宣纸斑驳
for _ in range(40):
    x, y = rng.uniform(0, W), rng.uniform(0, H)
    r = rng.uniform(30, 110)
    o = rng.uniform(0.012, 0.03)
    add(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#c9b995" opacity="{o:.3f}"/>')

# 海域：以海岸线多边形划分，海为底色刷一层
COAST = [
    (34, 0), (46, 2), (58, 4), (72, 3), (86, 2), (100, 0), (100, 70),
    (92, 71), (88, 73.5), (80, 77), (72, 80), (64, 82.5), (58, 85),
    (52, 88), (46, 91), (40, 92.5), (34, 90.5), (31, 84), (33, 76),
    (36, 70), (34, 64), (28, 60), (22, 57), (14, 54), (8, 51), (5, 45),
    (9, 39), (17, 36), (25, 33), (30, 26), (32, 16), (34, 0),
]
coast_pts = [P(x, y) for x, y in COAST]


def smooth_closed_path(pts):
    """闭合并平滑的多段贝塞尔路径。"""
    n = len(pts)
    mids = [
        ((pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2)
        for i in range(n)
    ]
    dd = f"M {f(mids[-1][0])} {f(mids[-1][1])}"
    for i in range(n):
        dd += f" Q {f(pts[i][0])} {f(pts[i][1])} {f(mids[i][0])} {f(mids[i][1])}"
    return dd + " Z"


coast_path = smooth_closed_path(coast_pts)
add(f'<path d="{coast_path}" fill="{LAND_HI}"/>')  # 陆地略亮
add(f'<path d="{coast_path}" fill="none" stroke="{INK}" stroke-width="3.4" opacity="0.6"/>')
# 海面微深斑点
for _ in range(60):
    # 只撒在多边形外（简单判据：点在陆地多边形左侧/下侧粗判）
    x, y = rng.uniform(0, W), rng.uniform(0, H)
    inside = point_in_poly(x / W * 100, y / H * 100, COAST)
    if not inside:
        add(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rng.uniform(60, 160))}" fill="{SEA_DEEP}" opacity="{rng.uniform(0.05,0.12):.3f}"/>')

# 海浪短线
for _ in range(240):
    x, y = rng.uniform(0, W), rng.uniform(0, H)
    if point_in_poly(x / W * 100, y / H * 100, COAST):
        continue
    wlen = rng.uniform(28, 70)
    add(f'<path d="M {f(x)} {f(y)} q {f(wlen/2)} {f(-rng.uniform(4,9))} {f(wlen)} 0" stroke="{INK}" stroke-width="1.2" fill="none" opacity="{rng.uniform(0.10,0.22):.3f}"/>')


# ── 海岸晕线（旧地图式斜排短线）────────────────────────────────
def coast_hatch():
    steps = 400
    for i in range(steps):
        t = i / steps
        idx = t * (len(coast_pts) - 1)
        i0 = int(idx)
        frac = idx - i0
        if i0 >= len(coast_pts) - 1:
            continue
        x0, y0 = coast_pts[i0]
        x1, y1 = coast_pts[i0 + 1]
        x = x0 + (x1 - x0) * frac
        y = y0 + (y1 - y0) * frac
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx, dy) or 1
        # 法向量指向海面（多边形外側=左侧）
        nx, ny = dy / ln, -dx / ln
        # 判断法线方向是否朝海：取中点偏移测试
        tx, ty = x + nx * 10, y + ny * 10
        if point_in_poly(tx / W * 100, ty / H * 100, COAST):
            nx, ny = -nx, -ny
        if rng.random() < 0.5:
            ln2 = rng.uniform(8, 26)
            add(f'<line x1="{f(x+nx*4)}" y1="{f(y+ny*4)}" x2="{f(x+nx*(4+ln2))}" y2="{f(y+ny*(4+ln2))}" stroke="{INK}" stroke-width="1.1" opacity="{rng.uniform(0.10,0.22):.3f}"/>')


coast_hatch()

# ── 山体符号 ────────────────────────────────────────────────────
def mountain(x, y, s=1.0, dark=False):
    """中式地图山形符号，(x,y)为基线中心，s 为尺度。"""
    w, h = 60 * s, 46 * s
    fill = MOUNT_FILL_DARK if dark else MOUNT_FILL
    add(
        f'<path d="M {f(x-w)} {f(y)} Q {f(x-w*0.35)} {f(y-h*0.8)} {f(x)} {f(y-h)} '
        f'Q {f(x+w*0.35)} {f(y-h*0.8)} {f(x+w)} {f(y)} Z" '
        f'fill="{fill}" stroke="{INK}" stroke-width="{1.6*s:.2f}" opacity="0.85"/>'
    )
    # 右侧晕染皴
    add(
        f'<path d="M {f(x+w*0.15)} {f(y-h*0.78)} Q {f(x+w*0.45)} {f(y-h*0.5)} {f(x+w*0.72)} {f(y-h*0.08)}" '
        f'stroke="{INK}" stroke-width="{1.1*s:.2f}" fill="none" opacity="0.35"/>'
    )
    if dark:
        add(
            f'<path d="M {f(x-w*0.5)} {f(y-h*0.3)} Q {f(x-w*0.2)} {f(y-h*0.6)} {f(x)} {f(y-h*0.72)}" '
            f'stroke="{INK}" stroke-width="{1.0*s:.2f}" fill="none" opacity="0.3"/>'
        )


def hill(x, y, s=1.0):
    w, h = 52 * s, 26 * s
    add(
        f'<path d="M {f(x-w)} {f(y)} Q {f(x)} {f(y-h*2)} {f(x+w)} {f(y)} Z" '
        f'fill="{MOUNT_FILL}" stroke="{INK}" stroke-width="{1.3*s:.2f}" opacity="0.7"/>'
    )


def range_line(pts, s=1.0, dark=False, n_per=3):
    """沿折线布一串山。"""
    for i in range(len(pts) - 1):
        x0, y0 = P(*pts[i])
        x1, y1 = P(*pts[i + 1])
        seg = math.hypot(x1 - x0, y1 - y0)
        n = max(2, int(seg / (90 * s)))
        for k in range(n):
            t = k / max(1, n - 1)
            x = x0 + (x1 - x0) * t + rng.uniform(-30, 30)
            y = y0 + (y1 - y0) * t + rng.uniform(-16, 16)
            ss = s * rng.uniform(0.75, 1.2)
            mountain(x, y, ss, dark)


# 北荒雪原山脉（稀疏高冷）
range_line([(26, 12), (40, 9), (54, 11), (64, 7)], s=1.15)
# 中部丘陵（古道两侧）
range_line([(48, 36), (60, 40), (72, 42)], s=0.95)
range_line([(50, 24), (60, 22), (70, 25)], s=0.85)
# 西部幽暗山地（浓密深色）
range_line([(8, 42), (16, 46), (24, 52), (28, 58)], s=1.1, dark=True)
range_line([(12, 36), (20, 40), (27, 44)], s=0.9, dark=True)
# 东部高地
range_line([(78, 40), (86, 42), (94, 40)], s=1.05)
range_line([(80, 50), (88, 52), (95, 50)], s=0.9)
# 泽州边缘丘陵
range_line([(58, 46), (64, 48), (70, 47)], s=0.8)
# 南方雾林丘（圆润矮丘）
for i in range(16):
    x = P(38 + i * 1.6, 0)[0]
    y = P(0, 76 + (i % 4) * 4)[1]
    hill(x + rng.uniform(-40, 40), y + rng.uniform(-30, 30), rng.uniform(0.8, 1.3))
# 京畿平原偶有小丘
hill(*P(76, 55), 0.8)
hill(*P(90, 58), 0.7)

# ── 水系 ────────────────────────────────────────────────────────
# 烟波泽大湖
lx, ly = P(78, 52)
add(
    f'<ellipse cx="{f(lx)}" cy="{f(ly)}" rx="{f(190)}" ry="{f(120)}" fill="#dfe4d8" stroke="{RIVER}" stroke-width="2" opacity="0.9"/>'
)
add(f'<ellipse cx="{f(lx+30)}" cy="{f(ly+10)}" rx="{f(120)}" ry="{f(70)}" fill="#d4dcd2" opacity="0.7"/>')
# 泽州河网：数条入湖河流
rivers = [
    [(66, 38), (70, 44), (75, 49)],
    [(86, 40), (83, 46), (80, 50)],
    [(70, 60), (74, 56), (77, 54)],
    [(90, 56), (85, 55), (81, 53)],
    [(78, 52), (82, 60), (84, 68), (86, 75)],  # 出海干流
]
for rv in rivers:
    pts = [P(*p) for p in rv]
    dd = "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in pts)
    add(f'<path d="{dd}" stroke="{RIVER}" stroke-width="4" fill="none" opacity="0.65" stroke-linecap="round"/>')
    add(f'<path d="{dd}" stroke="{RIVER}" stroke-width="1.6" fill="none" opacity="0.8" stroke-linecap="round"/>')
# 忘川水（山根暗流，短而黑）
wc = [P(16, 44), P(19, 49), P(22, 53)]
dd = "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in wc)
add(f'<path d="{dd}" stroke="{INK}" stroke-width="3" fill="none" opacity="0.4" stroke-linecap="round"/>')

# ── 渊 与 禁地标示 ───────────────────────────────────────────────
# 无昼渊：雪原西缘的黑潭
ax, ay = P(36, 16)
for r, o in [(150, 0.10), (110, 0.16), (70, 0.26), (38, 0.4)]:
    add(f'<ellipse cx="{f(ax)}" cy="{f(ay)}" rx="{f(r)}" ry="{f(r*0.62)}" fill="{INK}" opacity="{o}"/>')
add(f'<ellipse cx="{f(ax)}" cy="{f(ay)}" rx="{f(165)}" ry="{f(100)}" fill="none" stroke="{INK}" stroke-width="1.4" opacity="0.3"/>')
# 天裂口：高地上的斜劈裂缝
crack = [(84, 43), (86, 45.5), (85, 48), (88, 50.5)]
cpts = [P(*p) for p in crack]
dd = f"M {f(cpts[0][0])} {f(cpts[0][1])} " + " ".join(
    f"L {f(x + rng.uniform(-18, 18))} {f(y + rng.uniform(-18, 18))}" for x, y in cpts[1:]
)
add(f'<path d="{dd}" stroke="{INK}" stroke-width="5" fill="none" opacity="0.75" stroke-linejoin="round"/>')
add(f'<path d="{dd}" stroke="{INK}" stroke-width="14" fill="none" opacity="0.12" stroke-linejoin="round"/>')
for _ in range(6):
    x, y = rng.uniform(0, 1), rng.uniform(0, 1)
    i = int(x * (len(cpts) - 1))
    px, py = cpts[i]
    add(
        f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(px + rng.uniform(-90, 90))}" y2="{f(py + rng.uniform(-60, 60))}" stroke="{INK}" stroke-width="1.5" opacity="0.3"/>'
    )
# 渊脉（西部暗色晕带，贴内陆一侧）
for i in range(12):
    x = P(rng.uniform(10, 25), 0)[0]
    y = P(0, rng.uniform(18, 56))[1]
    add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rng.uniform(90,170))}" ry="{f(rng.uniform(50,90))}" fill="{INK}" opacity="{rng.uniform(0.03,0.055):.3f}" transform="rotate({rng.uniform(-30,30):.0f} {f(x)} {f(y)})"/>')

# ── 雾瘴（南疆 + 海雾）─────────────────────────────────────────
for _ in range(14):
    x = P(rng.uniform(36, 62), 0)[0]
    y = P(0, rng.uniform(74, 94))[1]
    add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rng.uniform(160,320))}" ry="{f(rng.uniform(24,44))}" fill="{MIST}" opacity="{rng.uniform(0.28,0.45):.3f}"/>')
for _ in range(10):
    x = P(rng.uniform(4, 45), 0)[0]
    y = P(0, rng.uniform(60, 96))[1]
    add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rng.uniform(140,280))}" ry="{f(rng.uniform(18,36))}" fill="{MIST}" opacity="{rng.uniform(0.25,0.4):.3f}"/>')

# ── 古道（雍州脊线）────────────────────────────────────────────
road = [(56, 30), (62, 33), (68, 36), (76, 54), (82, 66), (86, 76)]
rpts = [P(*p) for p in road]
dd = "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in rpts)
add(f'<path d="{dd}" stroke="{INK}" stroke-width="5" fill="none" opacity="0.4" stroke-dasharray="18 12"/>')
add(f'<path d="{dd}" stroke="{INK}" stroke-width="1.6" fill="none" opacity="0.55"/>')
# 古道支线：班底庄 -> 观星台
rd2 = [P(56, 30), P(53, 20), P(48, 11)]
dd = "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in rd2)
add(f'<path d="{dd}" stroke="{INK}" stroke-width="3.5" fill="none" opacity="0.3" stroke-dasharray="14 10"/>')

# ── 建筑与地标 ──────────────────────────────────────────────────
def city(x, y, s=1.0, label_hall=True):
    """带城墙的城池符号。"""
    w, h = 110 * s, 80 * s
    add(
        f'<rect x="{f(x-w)}" y="{f(y-h)}" width="{f(2*w)}" height="{f(2*h)}" rx="8" '
        f'fill="{LAND_HI}" stroke="{INK}" stroke-width="{2.2*s:.2f}" opacity="0.9"/>'
    )
    # 垛口
    n = 6
    for i in range(n):
        bx = x - w + (2 * w) * (i + 0.5) / n
        add(f'<rect x="{f(bx-9*s)}" y="{f(y-h-8*s)}" width="{f(18*s)}" height="{f(9*s)}" fill="{INK}" opacity="0.55"/>')
        add(f'<rect x="{f(bx-9*s)}" y="{f(y+h-1*s)}" width="{f(18*s)}" height="{f(9*s)}" fill="{INK}" opacity="0.55"/>')
    if label_hall:
        add(f'<rect x="{f(x-30*s)}" y="{f(y-22*s)}" width="{f(60*s)}" height="{f(30*s)}" fill="{INK}" opacity="0.65"/>')
        add(f'<path d="M {f(x-36*s)} {f(y-22*s)} L {f(x)} {f(y-36*s)} L {f(x+36*s)} {f(y-22*s)} Z" fill="{INK}" opacity="0.75"/>')


def pagoda(x, y, s=1.0):
    """多层楼阁剪影（万灯楼/塔）。"""
    tiers = 4
    tw = 66 * s
    for i in range(tiers):
        ty = y - i * 34 * s
        w = tw * (1 - i * 0.18)
        add(f'<rect x="{f(x-w)}" y="{f(ty-16*s)}" width="{f(2*w)}" height="{f(16*s)}" fill="{INK}" opacity="0.7"/>')
        add(
            f'<path d="M {f(x-w-10*s)} {f(ty-16*s)} L {f(x)} {f(ty-30*s)} L {f(x+w+10*s)} {f(ty-16*s)} Z" fill="{INK}" opacity="0.8"/>'
        )


def lighthouse(x, y, s=1.0):
    add(f'<path d="M {f(x-16*s)} {f(y)} L {f(x-9*s)} {f(y-70*s)} L {f(x+9*s)} {f(y-70*s)} L {f(x+16*s)} {f(y)} Z" fill="{INK}" opacity="0.8"/>')
    add(f'<rect x="{f(x-13*s)}" y="{f(y-84*s)}" width="{f(26*s)}" height="{f(16*s)}" fill="{INK}" opacity="0.9"/>')
    # 灯光射线（淡）
    for ang in (-150, -30, -90):
        a = math.radians(ang)
        add(
            f'<line x1="{f(x)}" y1="{f(y-76*s)}" x2="{f(x + math.cos(a)*150*s)}" y2="{f(y-76*s + math.sin(a)*150*s)}" stroke="{INK}" stroke-width="2" opacity="0.18"/>'
        )


def well(x, y, s=1.0):
    add(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(30*s)}" fill="none" stroke="{INK}" stroke-width="{3.2*s:.2f}" opacity="0.85"/>')
    add(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(16*s)}" fill="{INK}" opacity="0.8"/>')
    add(f'<line x1="{f(x-26*s)}" y1="{f(y)}" x2="{f(x-26*s)}" y2="{f(y-46*s)}" stroke="{INK}" stroke-width="{2.6*s:.2f}" opacity="0.85"/>')
    add(f'<line x1="{f(x+26*s)}" y1="{f(y)}" x2="{f(x+26*s)}" y2="{f(y-46*s)}" stroke="{INK}" stroke-width="{2.6*s:.2f}" opacity="0.85"/>')
    add(f'<line x1="{f(x-30*s)}" y1="{f(y-46*s)}" x2="{f(x+30*s)}" y2="{f(y-46*s)}" stroke="{INK}" stroke-width="{2.6*s:.2f}" opacity="0.85"/>')


def steles(x, y, s=1.0, n=7):
    for i in range(n):
        bx = x + (i - n / 2) * 34 * s + rng.uniform(-6, 6)
        by = y + rng.uniform(-22, 22)
        bh = (34 + rng.uniform(0, 14)) * s
        add(f'<rect x="{f(bx-7*s)}" y="{f(by-bh)}" width="{f(14*s)}" height="{f(bh)}" fill="{INK}" opacity="0.6"/>')
        add(f'<circle cx="{f(bx)}" cy="{f(by-bh-6*s)}" r="{f(7*s)}" fill="{INK}" opacity="0.6"/>')


def village(x, y, s=1.0, n=5):
    for i in range(n):
        hx = x + (i - n / 2) * 44 * s + rng.uniform(-8, 8)
        hy = y + rng.uniform(-18, 18)
        hw = 30 * s
        add(f'<path d="M {f(hx-hw)} {f(hy)} L {f(hx)} {f(hy-22*s)} L {f(hx+hw)} {f(hy)} Z" fill="{INK}" opacity="0.55"/>')
        add(f'<rect x="{f(hx-hw*0.6)}" y="{f(hy)}" width="{f(hw*1.2)}" height="{f(16*s)}" fill="{INK}" opacity="0.45"/>')


def temple(x, y, s=1.0):
    add(f'<rect x="{f(x-46*s)}" y="{f(y-14*s)}" width="{f(92*s)}" height="{f(30*s)}" fill="{INK}" opacity="0.6"/>')
    add(f'<path d="M {f(x-58*s)} {f(y-14*s)} Q {f(x)} {f(y-46*s)} {f(x+58*s)} {f(y-14*s)} Z" fill="{INK}" opacity="0.75"/>')
    add(f'<line x1="{f(x)}" y1="{f(y-46*s)}" x2="{f(x)}" y2="{f(y-58*s)}" stroke="{INK}" stroke-width="{3*s:.2f}" opacity="0.75"/>')


def gate(x, y, s=1.0):
    """牌坊/门户。"""
    add(f'<line x1="{f(x-30*s)}" y1="{f(y)}" x2="{f(x-30*s)}" y2="{f(y-44*s)}" stroke="{INK}" stroke-width="{3*s:.2f}" opacity="0.7"/>')
    add(f'<line x1="{f(x+30*s)}" y1="{f(y)}" x2="{f(x+30*s)}" y2="{f(y-44*s)}" stroke="{INK}" stroke-width="{3*s:.2f}" opacity="0.7"/>')
    add(f'<path d="M {f(x-42*s)} {f(y-44*s)} Q {f(x)} {f(y-58*s)} {f(x+42*s)} {f(y-44*s)}" stroke="{INK}" stroke-width="{4*s:.2f}" fill="none" opacity="0.8"/>')


def pier(x, y, s=1.0):
    add(f'<rect x="{f(x-8*s)}" y="{f(y-10*s)}" width="{f(16*s)}" height="{f(26*s)}" fill="{INK}" opacity="0.5"/>')
    add(f'<rect x="{f(x-44*s)}" y="{f(y+12*s)}" width="{f(88*s)}" height="{f(8*s)}" fill="{INK}" opacity="0.5"/>')
    for i in (-30, 0, 30):
        add(f'<line x1="{f(x+i*s)}" y1="{f(y+20*s)}" x2="{f(x+i*s)}" y2="{f(y+34*s)}" stroke="{INK}" stroke-width="2" opacity="0.5"/>')


# 逐城布置（坐标=地理志）
cx, cy = P(84, 64)
city(cx, cy, 1.35)  # 烛京——最大的城
cx, cy = P(56, 30)
city(cx, cy, 1.0)   # 班底庄
cx, cy = P(33, 69)
pagoda(cx, cy, 1.15)  # 万灯楼
cx, cy = P(63, 84)
lighthouse(cx, cy, 1.2)  # 灯塔港
pier(cx + 70, cy + 30, 1.1)
cx, cy = P(12, 80)
well(cx, cy, 1.1)   # 天翁井
cx, cy = P(68, 36)
steles(cx, cy, 1.1)  # 长平旧道碑林
cx, cy = P(52, 80)
village(cx, cy, 1.1, 6)  # 三十七家村
cx, cy = P(42, 88)
temple(cx, cy, 1.1)  # 乳母庙
cx, cy = P(48, 10)
pagoda(cx, cy + 40, 0.9)  # 观星台（崖壁楼观）
cx, cy = P(14, 48)
gate(cx, cy, 1.1)   # 忘川渡门户
pier(cx + 40, cy + 26, 0.9)
cx, cy = P(26, 58)
village(cx, cy, 1.0, 4)  # 鬼市棚市
cx, cy = P(73, 59)
village(cx, cy, 0.9, 4)  # 灯草集
cx, cy = P(86, 76)
village(cx, cy, 0.9, 3)  # 万骨驿
cx, cy = P(79, 71)
village(cx, cy, 0.7, 3)  # 灰巷
cx, cy = P(66, 44)
temple(cx, cy, 0.85)  # 天枢峰道观

# 观星台：倒悬崖壁符号
cx, cy = P(48, 10)
add(
    f'<path d="M {f(cx-120)} {f(cy-70)} Q {f(cx-20)} {f(cy-90)} {f(cx+60)} {f(cy-30)} '
    f'L {f(cx+20)} {f(cy+10)} L {f(cx-80)} {f(cy-10)} Z" fill="{MOUNT_FILL_DARK}" stroke="{INK}" stroke-width="2" opacity="0.8"/>'
)

# 岛屿（退潮屿/礁）
for (ix, iy, ir) in [(30, 73, 70), (31.5, 74.5, 40), (7, 91, 60), (12, 80.5, 40)]:
    x, y = P(ix, iy)
    add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(ir)}" ry="{f(ir*0.6)}" fill="{LAND_HI}" stroke="{INK}" stroke-width="1.6" opacity="0.85"/>')
    for _ in range(int(ir / 22)):
        ang = rng.uniform(0, 2 * math.pi)
        rr = ir * rng.uniform(0.5, 1.0)
        add(f'<circle cx="{f(x + math.cos(ang)*rr)}" cy="{f(y + math.sin(ang)*rr*0.6)}" r="2.5" fill="{INK}" opacity="0.35"/>')
village(*P(30, 72.6), 0.7, 2)  # 退潮屿渔村
steles(*P(7, 90.6), 0.8, 4)    # 长夜古道残碑

# ── 罗盘（右上，无文字）────────────────────────────────────────
comp_x, comp_y = P(93, 9)
R = 110
add(f'<circle cx="{f(comp_x)}" cy="{f(comp_y)}" r="{R}" fill="{LAND_HI}" stroke="{INK}" stroke-width="2.4" opacity="0.8"/>')
add(f'<circle cx="{f(comp_x)}" cy="{f(comp_y)}" r="{R*0.72}" fill="none" stroke="{INK}" stroke-width="1" opacity="0.5"/>')
add(f'<path d="M {f(comp_x)} {f(comp_y-R*0.9)} L {f(comp_x+22)} {f(comp_y+20)} L {f(comp_x)} {f(comp_y+4)} L {f(comp_x-22)} {f(comp_y+20)} Z" fill="{INK}" opacity="0.8"/>')
for i in range(8):
    a = math.radians(i * 45)
    add(
        f'<line x1="{f(comp_x + math.cos(a)*R)}" y1="{f(comp_y + math.sin(a)*R)}" x2="{f(comp_x + math.cos(a)*R*0.86)}" y2="{f(comp_y + math.sin(a)*R*0.86)}" stroke="{INK}" stroke-width="1.4" opacity="0.5"/>'
    )

# ── 边框 ───────────────────────────────────────────────────────
add(f'<rect x="14" y="14" width="{W-28}" height="{H-28}" fill="none" stroke="{INK}" stroke-width="3" opacity="0.5"/>')
add(f'<rect x="26" y="26" width="{W-52}" height="{H-52}" fill="none" stroke="{INK}" stroke-width="1" opacity="0.35"/>')

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
    f'viewBox="0 0 {W} {H}">' + "".join(parts) + "</svg>"
)

out = "docs/assets-src/kuiyuanlu-map.svg"
import os

os.makedirs("docs/assets-src", exist_ok=True)
with open(out, "w", encoding="utf-8") as fp:
    fp.write(svg)
print("written", out, len(svg), "bytes")
