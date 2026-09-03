# -*- coding: utf-8 -*-
"""烬洲大地图重排脚本（V2 —— 适配豆包定稿底图 docs/assets-src/kuiyuanlu-map-clean.png）
在 V1 地理骨架基础上，把坐标对准定稿底图上的实际地貌：
1. 重排 20 主节点坐标（ID/境界/市场配置/连路不动）
2. 卫星点随父节点平移（大偏移者手工安放）
3. 宗门地标重新落位
4. 少量节点地貌描述随位置微调
"""
import json

PATH = "src/shared/data/map.json"

# ── 1. 主节点新坐标（对准底图实际地貌）──────────────────────────
NODE_XY = {
    "TN_YUE_01": (77, 55),   # 京畿·烛京（环形大城）
    "TN_YUE_02": (81, 61),   # 灰巷灯影地（城南街巷）
    "TN_BAICAO_01": (69, 49),  # 灯草集（城西市集镇）
    "TN_YW_01": (74, 31),    # 天枢峰（中部丘陵高地）
    "TN_XI_01": (89, 37),    # 烟波泽（东部水网泽国）
    "TN_ZMG_01": (86, 13),   # 天裂口（东北巨渊裂谷末端）
    "TN_BORDER_01": (59, 57),  # 万骨驿（古道南端驿镇）
    "ML_PLAINS_01": (52, 41),  # 长平旧道（碑林石柱与牌坊）
    "DJ_CENTRAL_01": (48, 32),  # 班底庄（古道北端聚落）
    "DJ_KW_01": (47, 20),    # 倒悬观星台（渊下倒悬塔）
    "DJ_RIFT_01": (33, 10),  # 无昼渊（巨渊最深黑段）
    "DJ_VOID_01": (17, 14),  # 忘川渡（西北山腹城门）
    "LX_OUTER_01": (25, 25),  # 鬼市（幽都山麓市集）
    "LX_INNER_01": (55, 72),  # 灯塔港（塔顶有光的港城）
    "LX_INNER_02": (31, 84),  # 退潮屿（南部岛群）
    "LX_VOID_01": (10, 47),  # 万灯楼（西海雾中高楼）
    "DJ_SKY_01": (21, 62),   # 天翁井（环形巨井孤岛）
    "DJ_TRIB_01": (27, 79),  # 长夜古道（没入海中的石柱道）
    "DJ_SOUTH_01": (78, 86),  # 三十七家村（东南雾林庙群）
    "DJ_NORTH_01": (89, 93),  # 乳母腹地（雾林深处大庙）
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
    "SAT_LX_01": (29, 28),   # 鬼市外滩涂（山麓坡地）
    "SAT_LX_02": (45, 80),   # 沉船遗迹（灯塔港西南外海）
    "SAT_DJ_03": (13, 12),   # 沉灯神殿（山腹深处）
    "SAT_DJ_11": (21, 17),   # 忘川贝场（山门东侧坡地）
    "SAT_LX_05": (13, 50),   # 万灯楼灯阶长廊（楼侧海面）
    "SAT_LX_06": (8, 44),    # 记忆书廊（楼侧海面）
    "SAT_DJ_13": (50, 23),   # 星髓暗河（倒悬崖下方）
    "SAT_DJ_04": (23, 81),   # 灯烬回廊（石柱道中段）
    "SAT_DJ_12": (31, 81),   # 残灯碑林（石柱道尽头）
}

# ── 4. 宗门地标新坐标 ───────────────────────────────────────────
SECT_XY = {
    "SECT_LINGXIAO": (77, 28),  # 太乙清都观（天枢峰高地）
    "SECT_TIANYAN": (51, 16),   # 观星台（巨渊裂崖边缘）
    "SECT_WUXIANG": (74, 90),   # 白莲乳母教（雾林莲灯庙）
    "SECT_YOUDU": (13, 17),     # 幽都·地藏殿（暗山腹地）
    "SECT_JIUJIE": (75, 52),    # 掌灯司（烛京城内）
    "SECT_BAIXIBAN": (45, 34),  # 百戏班（班底庄西侧）
}

# ── 5. 地貌描述精修 ─────────────────────────────────────────────
DESC = {
    "TN_BORDER_01": "古道南端的出海口驿镇，昔日战场的腌物残渣时有出土；驿后古灯道井直通海蚀洞窟，封灵的上品材料多出于此。",
    "ML_PLAINS_01": "古道战场的遗迹，碑林沿路绵延；北望班底庄，南抵万骨驿出海的港埠，守碑翁日夜巡走，不许人碰碑。",
    "LX_INNER_01": "灯外海边缘最后一座港城，南岸礁石上的灯塔彻夜不熄；严禁私斗，出港便是渊的领地。",
    "LX_INNER_02": "西海边缘的渔岛，退潮后礁洞显露；渔人说潮水偶尔会送来不属于海的东西。",
    "LX_OUTER_01": "幽都山麓的外围市集，坡地棚屋连绵，秤翁以「信」称量记忆与诡珍；深处不许点灯。",
    "LX_VOID_01": "每逢海上大雾便浮出灯影的旧纪元高楼，孤悬西海雾中；楼中万灯长明，却照不见来路。",
    "DJ_SKY_01": "西海孤岛上的巨井，井绳永远是湿的，而今天并没有下雨；井底通向「天翁」的传闻无人证实。",
    "DJ_TRIB_01": "外海石柱道的尽头，通往旧纪元的尽头，走完全程者可窥渡渊真相；至今无人带回完整的答案。",
    "DJ_VOID_01": "西北暗山腹中亡者之城的门户渡口，忘川水穿城而过；亡者排队入城，生人需执魂契。",
    "DJ_CENTRAL_01": "雍州古道北端的班底所在，戏台连绵、商旅辐辏，掌灯司雍州边司亦设于此。",
    "DJ_RIFT_01": "横贯北缘巨渊中最深的一段，终年不见天光，灯照不到渊底；下探的人说渊里有人应答你的名字。",
    "DJ_NORTH_01": "南方雾瘴最深处的乳母庙旧地，庙后腹地与雾连成一片，疫气经年不散。",
    "DJ_SOUTH_01": "南方雾瘴弥漫的蛮荒之地，山间灯影地密布；白莲乳母教的莲灯在雾中终年不熄。",
    "TN_ZMG_01": "泽州东北高原上，巨渊东端天幕被撕开的旧裂口，灯照不进，风从里面吹出来，带着旧纪元的味道。",
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
