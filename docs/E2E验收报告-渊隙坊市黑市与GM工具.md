# 端到端验收报告 — 渊隙叙事 / 坊市·黑市 / GM 管理台全工具

- 验收日期：2026-09-03 ~ 09-04（跨两轮会话）
- 测试环境：本地 3100 干净实例（`PORT=3100 bun --env-file=.env.local src/index.ts`，无 watch），真实 PostgreSQL / Redis / NATS / 战斗 worker，真实 LLM 调用（glm-4.5-air 系）
- 测试账号（保留于 `scripts/.test-accounts.json`）：
  - A = 灯下客甲 / 林默（闻腥），邮箱 `qinguan-e2e-a@qq.test`，**在 `.env.local` 的 `ADMIN_USER_IDS` 白名单内**（本地专用，未提交）
  - B = 灯下客乙 / 言游（蚀体·初期），邮箱 `qinguan-e2e-b@qq.test`（境界为测试 fixture 直接上调，非突破流程产物）
  - C = 临时账号（仅账号封禁/解封用例，已通过 revoke-sessions 后无活动）
- 认证方式：`auth.api.signUpEmail` 内部注册 + DB `emailVerified` 置真（公开注册有 altcha，脚本直连内部通道）；真实会话经 `better-auth.session_token` cookie

---

## 一、本轮结论速览

| 验收面 | 结论 |
|---|---|
| 渊隙五轮叙事（真实 LLM） | ✅ 通过（含战斗选项进入 `WAITING_BATTLE`，按设计） |
| 坊市四层（common/treasure/heaven/black） | ✅ 通过（含跨境界拦截、同周期重复购买拦截、刷新跨周期可再购） |
| 黑市（对话式 AI NPC） | ✅ 通过（open → SSE interact → commit → 物品投递全链路） |
| GM 管理台 19 个 router | ✅ 全部触达；除 2 处依赖外部/有状态数据的成功路径外均完成写生命周期验证 |
| 新发现并已修复的缺陷 | 4 处（见第四节） |
| 遗留观察项（报告级，非本轮修复） | 5 处（见第五节） |

---

## 二、渊隙叙事五轮（真实 LLM）

- 五轮叙事由真实 LLM 驱动（`generateAiText` 走 glm 系模型），逐轮验证：开场（枯井 叙事弧）→ 选项 → 结果 → 下一轮开场锚点（`continuity.lastSceneEnding`）→ 第五轮完成。
- 高风险战斗选项路径进入 `WAITING_BATTLE`（meta 层 醃物），随后由战斗会话接管 —— 按设计非缺陷。
- 已在本轮之外（提交 2cb912b）修复：r2-r5 模板兜底根因（schema 默认值未应用 / race→clan 枚举错位），本轮复跑无模板兜底。
- **本轮新发现并修复**：活动副本存在时重复 `POST /api/dungeon/start` 抛裸 Error → 500（详见第四节-3）。

---

## 三、坊市 / 黑市 / 高等级坊市（任务 #52）

测试节点：烛京 `TN_YUE_01`；刷新节奏 common/treasure 15min、heaven/black 120min；货架计数 8（treasure）/4（heaven）。

| 用例 | 结果 |
|---|---|
| B（蚀体）购买 treasure 层「聚元火砂」×4146 灵石、heaven 层「养魂地蜜」×15015 灵石 | ✅ 200，扣款精确 |
| A（闻腥）同 listing 购买 | ✅ POST 403「境界不足，需达到守灯」/「…到达 蚀体」 |
| 同周期重复购买同 listing | ✅ 400「本批此物你已购入，不可重复购买」；Redis `market:v2:bought:{userId}:{nodeId}:{layer}:{cycle}` 生效，货架 qty→0 |
| 跨刷新周期后可再购（cycle 轮换后集合重置、数量恢复） | ✅ 通过 |
| 旧 `?layer=black` 通道 | ✅ 410 已废弃，引导至对话黑市 |
| 黑市 overview（NPC：smiling-keeper / silent-elder / urgent-cultivator + 当日 entryPolicy） | ✅ 200 |
| 黑市入场 + 开对话 session | ✅ `status:'ready'`；修复前曾因观察生成 topic 枚举漂移 503/重试不足（第四节-1/-2） |
| 黑市对话交互（interact，**纯 SSE**：`resolved` / `reply-chunk` / `reply-complete`） | ✅ 议价：lowball 80 万 → 抬价 120 万 → NPC 让步 settle 1,094,410 → phase=deal_ready |
| 黑市 commit（reveal 真名/品级、扣款、投递） | ✅ 揭示「混元道莲 · 神品 · 星」；B 灵石 2,009,371 → 914,961（差额 1,094,410 精确）；DB `wanjiedaoyou_materials` 确认混元道莲/灯枢汤/养魂地蜜/聚元火砂已入库 |

关键坑位备忘：`interact` 是 **SSE** 协议，`commit`/`open` 返回 **JSON**——测试驱动若按 JSON 解析 interact 会拿到 409/空字段。黑市内部计价文案为「灯油券」，底层货币实际是灵石（UI copy 与实现的口径差，见第五节-4）。

---

## 四、GM 管理台 19 router 逐项验证（任务 #53）

读取侧（21 端点批量遍历）：全部 200；唯一一次 400 是 tower-enemy-sets/realm 缺 `seasonKey`+合法境界参数（补齐参数后 200，属调用方参数错误非缺陷）。

写入/生命周期侧（本轮完整矩阵，**全部通过**）：

| Router | 覆盖动作 | 结果 |
|---|---|---|
| admin/session | GET 自证 | 200（A 邮箱正确） |
| accounts | 列表 + moderation：C ban(1_day)→unban→revoke-sessions | 全部 200；ban 后 sessionsRevoked:true |
| templates | email + game_mail 双通道 create→get→update→toggle(disabled) | 200 全过 |
| feedback | 玩家建单（POST /api/feedback）→ admin PATCH status=resolved | 200；且**玩家邮箱收到「反馈工单状态更新」站内信**（联动验证闭环） |
| announcement | PATCH 公告 → GET 回读 → 还原 | 200 |
| community-group | set 群号(12345678)→GET→清空还原 | 200 |
| gm/players | 模糊检索（ilike） | 200 |
| gm/grant | 多资源发放（reputation/cultivationExp/lifespan/comprehensionInsight/2×道具） | 200 原子到账；**正确护栏**：qi 满溢→400「灯油已达溢出上限」；无宗门负宗门贡献→400（均为预期拒绝非缺陷） |
| item-library | create→update→archive；materials/generate×2；**seeds/generate×2**；**artifact/preview**（score 90 + productModel）；**catalog/import**（420 预设已全在库，重复导入幂等 skipped=12）；**daily-generation-settings GET/PUT 往返** | 全部 200 |
| redeem-codes | 建码（含 4-4 大写格式校验 400 用例）→ toggle disabled | 200 |
| invitation-lamps | 建码（`E2E2-M2EJ`）→ **toggle active→disabled→active**（列表按 status 过滤验证）→ **settings required true→GET 验证→false→GET 验证** | 全部 200 |
| reputation-shop / sect-shop | create→update→archive；sect-shop 需用 **published** 状态道具（archived 上架被 400「请选择已发布的道具库道具」，正确护栏） | 200 |
| broadcast | email dryRun（56 收件人）、game-mail dryRun（1 收件人，按 cultivatorId）、**game-mail 实发**（B 收到「E2E实发…+灯油券×10」站内信） | 200 |
| sponsorship | config GET/PUT 往返；ping→502「爱发电连接测试失败」（未配置 provider，预期结构化失败）；**manual-grants 对 B 实发 faint_light 档 → 201**；orders 列表空态 200；orders/:id + retry/revoke/rotate-claim + snapshots/reveal 对不存在订单 → 结构化 404 | 通过 |
| online-users / llm-metrics | 读取 | 200 |
| online-battles | metrics 200；match 级三端点此前对不存在对局 **500** → 已修复为结构化 404 | 见第四节-3 |
| tower-enemy-sets | 生成当季（`seasonKey 2026-W36@Asia/Shanghai`）蚀体档 → ready/enemyCount:20 → realm 详情 | 200 |
| battle-simulator | duel（A vs B 真人数据）+ monte-carlo（fixed_vs_template、20 样本） | 200 完整 JSON |
| llm-metrics / session | 读取 | 200 |

**覆盖率说明（诚实标注）**：
- sponsorship 的订单动作**成功路径**（retry/revoke/rotate-claim/reveal 命中真实订单）未在本轮产生 —— 需要一条真实爱发电订单（含门禁链数据），当前库内订单为空；已验证路由+校验+结构化 404 错误映射，成功分支留待接入 provider fixture 后补测。
- 黑市/渊隙等玩家侧链路以 B/A 真实数据驱动，覆盖购买/对话/战斗进入；arena/auction/craft/questions 等其余玩法模块逐 API 轮询冒烟不在本轮范围（见第五节-5 后续项）。

---

## 五、遗留观察项（报告级）

1. **坊市 GET 货架境界门槛不对称（疑似产品口径）**：低境界 GET `market/{nodeId}?layer=treasure|heaven` 返回 200 且可见货架（含 `access.allowed=false/reason` 元数据），拦截只发生在 POST buy（403）。若产品意图是「看不到即不可买」则需在读取侧收紧；若有意兼容展示则维持现状——请产品拍板。
2. **online-battles match 级端点健壮性（已修复）**：`GET /:matchId`、`retry-resolution`、`technical-abort` 对不存在对局原本抛未捕获 `Unknown battle match` → 500；现已在 router 边界映射为 404「对局不存在或已过期」（`retry-resolution` 的 `changed?200:409` 语义只对真实对局生效）。
3. **渊隙重复开局 500（已修复）**：`startDungeonUnlocked` 对「已有进行中渊隙」与「非渊隙节点」抛裸 `Error` → Hono 兜底 500；现改抛 `DungeonFlowError(INVALID_STATE, …, 409)`，router 既有映射即刻生效（实测 409 + code `DUNGEON_INVALID_STATE`）。
4. **黑市 UI copy 与货币实现口径差**：界面写「灯油券」，底层扣的是灵石余额；若玩家按字面理解会困惑，建议文案对齐。
5. **后续项（未在本轮范围）**：全玩法模块逐 API 冒烟（arena / auction / craft / questions / 宗门设施等）；sponsorship 订单成功路径（需 provider fixture）；`docs/assets-src` 地图过程图与底图提示词 md 是否入库待用户拍板。

---

## 六、本轮源码变更（4 文件，全部 tsc 0 错误）

| 文件 | 变更 | 验证 |
|---|---|---|
| `src/server/utils/aiClient.ts` | `generateStructured` 重试门从 `attempt===0` 放宽到 `attempt<2`（与「3 次尝试」注释一致），使单次 TypeValidation 失败也能重试 | 黑市观察生成经修复后连续成功 |
| `src/server/prompts/black-market-observations.md` | 明确 inspection topic 枚举必须为英文原词（appearance 外观 / aura 气息灵光温度气味响动 / damage 磨损损伤 / origin 来历流转），禁止模型自造中文标签 | 同上 |
| `src/server/routes/api/admin/online-battles.router.ts` | match 级三端点对未知对局返回结构化 404 | 实测 500→404 |
| `src/server/lib/dungeon/service_v2.ts` | 重复开局 / 非渊隙节点改抛 `DungeonFlowError`(409) | 实测 500→409（code `DUNGEON_INVALID_STATE`） |

类型检查：`bunx tsc -b tsconfig.node.json` = **0 错误**（含 scripts 目录；临时脚本已清理）。

---

## 七、环境收尾状态

- 临时验收脚本与痕迹（`scripts/tmp-*.ts`、`scripts/.*-audit/.dungeon/.bm/.market/.lamps/.final-closeout` 等 json）已全部删除；保留 `scripts/.test-accounts.json`（A/B 双角色 fixture，供后续回归复用）。
- `.env.local` 含本地专用 `ADMIN_USER_IDS=aaaf2f8e…`（A 提权为 admin），**未提交、不提交**；测试角色 B 的境界（蚀体）为 fixture 直改，非正常流程产物。
- 3100 实例当前为含全部修复的最新代码；后台进程随本会话结束需用户 `PORT=3100 bun --env-file=.env.local src/index.ts` 自行重启。
- git 工作树：4 个源码修改文件（第六节）+ 历史遗留未跟踪 `docs/assets-src/*` 与底图提示词 md（是否入库待拍板）。
