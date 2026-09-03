# -*- coding: utf-8 -*-
"""烬洲大地图重排脚本
依据 docs/窥渊录-烬洲地理志.md：
1. 重排 20 主节点坐标（ID/境界/市场配置不动）
2. 修复 4 处单向路 bug，并按新地理调整 5 处连路（全部双向）
3. 卫星点随父节点平移（大偏移者手工就近安放）
4. 宗门地标重新落位
5. 精修部分节点地貌描述
"""
import json

PATH = "src/shared/data/map.json"

# ── 1. 主节点新坐标 ─────────────────────────────────────────────
NODE_XY = {
    "TN_YUE_01": (84, 64),   # 京畿·烛京
    "TN_YUE_02": (79, 71),   # 灰巷灯影地
    "TN_BAICAO_01": (73, 59),  # 灯草集
    "TN_YW_01": (66, 44),    # 天枢峰
    "TN_XI_01": (78, 52),    # 烟波泽
    "TN_ZMG_01": (87, 46),   # 天裂口
    "TN_BORDER_01": (86, 76),  # 万骨驿（古道南端出海口）
    "ML_PLAINS_01": (68, 36),  # 长平旧道
    "DJ_CENTRAL_01": (56, 30),  # 班底庄
    "DJ_KW_01": (48, 10),    # 倒悬观星台
    "DJ_RIFT_01": (36, 16),  # 无昼渊
    "DJ_VOID_01": (14, 48),  # 忘川渡
    "LX_OUTER_01": (26, 58),  # 鬼市
    "LX_INNER_01": (63, 84),  # 灯塔港
    "LX_INNER_02": (30, 73),  # 退潮屿
    "LX_VOID_01": (33, 69),  # 万灯楼
    "DJ_SKY_01": (12, 80),   # 天翁井
    "DJ_TRIB_01": (7, 91),   # 长夜古道
    "DJ_SOUTH_01": (52, 80),  # 三十七家村
    "DJ_NORTH_01": (42, 88),  # 乳母腹地
}

# ── 2. 连路定稿（全双向）────────────────────────────────────────
EDGES = {
    "TN_YUE_01": ["TN_YUE_02", "TN_YW_01", "TN_XI_01", "TN_BAICAO_01", "TN_BORDER_01"],
    "TN_YUE_02": ["TN_YUE_01"],
    "TN_YW_01": ["TN_YUE_01", "TN_BAICAO_01"],
    "TN_XI_01": ["TN_YUE_01", "TN_BAICAO_01", "TN_ZMG_01"],
    "TN_BAICAO_01": ["TN_YUE_01", "TN_YW_01", "TN_XI_01"],
    "TN_ZMG_01": ["TN_XI_01"],
    "TN_BORDER_01": ["TN_YUE_01", "LX_INNER_01", "ML_PLAINS_01"],
    "ML_PLAINS_01": ["DJ_CENTRAL_01", "TN_BORDER_01"],
    "LX_INNER_01": ["TN_BORDER_01", "LX_INNER_02", "LX_OUTER_01", "LX_VOID_01", "DJ_SOUTH_01"],
    "LX_INNER_02": ["LX_INNER_01"],
    "LX_OUTER_01": ["LX_INNER_01", "LX_VOID_01", "DJ_VOID_01"],
    "LX_VOID_01": ["LX_INNER_01", "LX_OUTER_01"],
    "DJ_CENTRAL_01": ["ML_PLAINS_01", "DJ_KW_01"],
    "DJ_KW_01": ["DJ_CENTRAL_01", "DJ_RIFT_01"],
    "DJ_RIFT_01": ["DJ_KW_01", "DJ_VOID_01"],
    "DJ_VOID_01": ["DJ_RIFT_01", "DJ_SKY_01", "LX_OUTER_01"],
    "DJ_SKY_01": ["DJ_VOID_01", "DJ_TRIB_01"],
    "DJ_TRIB_01": ["DJ_SKY_01"],
    "DJ_SOUTH_01": ["DJ_NORTH_01", "LX_INNER_01"],
    "DJ_NORTH_01": ["DJ_SOUTH_01"],
}

# ── 3. 卫星点：跟随父节点平移；大偏移者手工安放 ─────────────────
SAT_OVERRIDE = {
    "SAT_LX_01": (32, 55),   # 鬼市外滩涂（原偏移过大）
    "SAT_LX_02": (67, 92),   # 沉船遗迹（南海）
    "SAT_DJ_03": (19, 50),   # 沉灯神殿
    "SAT_DJ_11": (15, 53),   # 忘川贝场
    "SAT_LX_05": (30, 66),   # 万灯楼灯阶长廊（海上）
    "SAT_LX_06": (31, 71),   # 记忆书廊（海上）
    "SAT_DJ_13": (51, 10),   # 星髓暗河
}

# ── 4. 宗门地标新坐标 ───────────────────────────────────────────
SECT_XY = {
    "SECT_LINGXIAO": (62, 41),
    "SECT_TIANYAN": (53, 6),
    "SECT_WUXIANG": (58, 85),
    "SECT_YOUDU": (18, 44),
    "SECT_JIUJIE": (85, 61),
    "SECT_BAIXIBAN": (64, 27),
}

# ── 5. 地貌描述精修 ─────────────────────────────────────────────
DESC = {
    "TN_BORDER_01": "古道南端的出海口驿镇，昔日战场的腌物残渣时有出土；驿后古灯道井直通海蚀洞窟，封灵的上品材料多出于此。",
    "ML_PLAINS_01": "古道战场的遗迹，碑林沿路绵延；北望班底庄，南抵万骨驿出海的港埠，守碑翁日夜巡走，不许人碰碑。",
    "LX_INNER_01": "灯外海边缘最后一座港城，南岸礁石上的灯塔彻夜不熄；严禁私斗，出港便是渊的领地。",
    "LX_INNER_02": "西海边缘的渔岛，退潮后礁洞显露；渔人说潮水偶尔会送来不属于海的东西。",
    "LX_OUTER_01": "幽都山麓的外围市集，滩涂上棚屋连绵，秤翁以「信」称量记忆与诡珍；深处不许点灯。",
    "LX_VOID_01": "每逢海上大雾便浮出灯影的旧纪元高楼，孤悬西海雾中；楼中万灯长明，却照不见来路。",
    "DJ_SKY_01": "西海孤岛上的巨井，井绳永远是湿的，而今天并没有下雨；井底通向「天翁」的传闻无人证实。",
    "DJ_TRIB_01": "西南海角尽头的古道，通往旧纪元的尽头，走完全程者可窥渡渊真相；至今无人带回完整的答案。",
    "DJ_VOID_01": "西北山腹中亡者之城的门户渡口，忘川水穿城而过；亡者排队入城，生人需执魂契。",
    "DJ_CENTRAL_01": "雍州古道北端的班底所在，戏台连绵、商旅辐辏，掌灯司雍州边司亦设于此。",
    "DJ_RIFT_01": "北方雪原西缘的巨渊，终年不见天光，灯照不到渊底；下探的人说渊里有人应答你的名字。",
    "DJ_NORTH_01": "南方雾瘴最深处的乳母庙旧地，庙后腹地与雾连成一片，疫气经年不散。",
    "DJ_SOUTH_01": "南方雾瘴弥漫的蛮荒之地，山间灯影地密布；白莲乳母教的莲灯在雾中终年不熄。",
    "TN_ZMG_01": "泽州以东的高原上，天幕被撕开的一道旧裂口，灯照不进，风从里面吹出来，带着旧纪元的味道。",
}


def main():
    with open(PATH, encoding="utf-8") as fp:
        data = json.load(fp)

    old_xy = {n["id"]: (n["x"], n["y"]) for n in data["map_nodes"]}

    for n in data["map_nodes"]:
        nid = n["id"]
        if nid in NODE_XY:
            n["x"], n["y"] = NODE_XY[nid]
        if nid in EDGES:
            n["connections"] = list(EDGES[nid])
        if nid in DESC:
            n["description"] = DESC[nid]

    for s in data["satellite_nodes"]:
        sid = s["id"]
        if sid in SAT_OVERRIDE:
            s["x"], s["y"] = SAT_OVERRIDE[sid]
            continue
        pid = s["parent_id"]
        if pid in old_xy and pid in NODE_XY:
            dx = s["x"] - old_xy[pid][0]
            dy = s["y"] - old_xy[pid][1]
            if abs(dx) > 8 or abs(dy) > 8:
                dx = max(-8, min(8, dx))
                dy = max(-8, min(8, dy))
            s["x"] = NODE_XY[pid][0] + dx
            s["y"] = NODE_XY[pid][1] + dy

    for m in data["sect_landmarks"]:
        if m["id"] in SECT_XY:
            m["x"], m["y"] = SECT_XY[m["id"]]

    # 校验：连路对称性 + 引用存在性 + 坐标范围
    ids = {n["id"] for n in data["map_nodes"]}
    errors = []
    for n in data["map_nodes"]:
        for c in n["connections"]:
            if c not in ids:
                errors.append(f"悬空引用 {n['id']} -> {c}")
            tgt = next(m for m in data["map_nodes"] if m["id"] == c)
            if n["id"] not in tgt["connections"]:
                errors.append(f"单向路 {n['id']} -> {c}")
        for key in ("x", "y"):
            v = n[key]
            if not (0 <= v <= 100):
                errors.append(f"坐标越界 {n['id']}.{key}={v}")
    for s in data["satellite_nodes"]:
        for key in ("x", "y"):
            if not (0 <= s[key] <= 100):
                errors.append(f"坐标越界 {s['id']}.{key}={s[key]}")
        if s["parent_id"] not in ids:
            errors.append(f"卫星点悬空父节点 {s['id']} -> {s['parent_id']}")
    if errors:
        print("校验失败:")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)

    with open(PATH, "w", encoding="utf-8", newline="\n") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print("map.json 重排完成，校验通过")


if __name__ == "__main__":
    main()
