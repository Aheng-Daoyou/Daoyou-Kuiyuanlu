/**
 * 商店默认货架（天骄宝阁 / 宗门宝库）幂等播种
 *
 * 触发条件：对应商店表当前「没有任何行」时才播种（含 archived —— 一旦出现过
 * 运营配置/清货动作即不再覆盖）。用 item_library 唯一索引 onConflictDoNothing
 * 保证多实例并发启动安全。
 *
 * 选件规则：目录槽位只声明「材料族 + 品质」，从道具库 published 中按 item_id
 * 稳定取该组合的第一件（同族同品预设变体之间等价，运营后续可在后台精调）。
 * 找不到可用道具的槽位跳过并汇总告警，不影响其余上架。
 */
import { getExecutor } from '@server/lib/drizzle/db';
import {
  itemLibrary,
  reputationShopItems,
  sectShopItems,
} from '@server/lib/drizzle/schema';
import { and, eq, sql } from 'drizzle-orm';

/** 系统播种者标记：seed 并非真人操作，createdBy/updatedBy 用全零 uuid（无外键）。 */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

type MaterialFamily =
  | 'herb'
  | 'ore'
  | 'monster'
  | 'tcdb'
  | 'aux'
  | 'gongfa_manual'
  | 'skill_manual';

const FAMILY_PREFIX: Record<MaterialFamily, string> = {
  herb: 'mat_herb_',
  ore: 'mat_ore_',
  monster: 'mat_monster_',
  tcdb: 'mat_tcdb_',
  aux: 'mat_aux_',
  gongfa_manual: 'mat_gongfa_manual_',
  skill_manual: 'mat_skill_manual_',
};

type Quality = '凡品' | '灵品' | '玄品' | '真品' | '地品' | '天品' | '仙品' | '神品';

interface DefaultSlot {
  family: MaterialFamily;
  quality: Quality;
  price: number;
  quantity: number;
  perUserLimit: number | null;
  sortOrder: number;
}

/**
 * 天骄宝阁默认货架：声望货币，走「榜上珍藏」定位 —— 中高阶功法/天材/珍材为主。
 * 价格以“声望”计（声望较灵石稀缺，按档位递增）。
 */
const REPUTATION_DEFAULT_SLOTS: DefaultSlot[] = [
  { family: 'skill_manual', quality: '真品', price: 900, quantity: 1, perUserLimit: 1, sortOrder: 10 },
  { family: 'gongfa_manual', quality: '真品', price: 800, quantity: 1, perUserLimit: 1, sortOrder: 20 },
  { family: 'tcdb', quality: '地品', price: 1200, quantity: 1, perUserLimit: 1, sortOrder: 30 },
  { family: 'tcdb', quality: '真品', price: 520, quantity: 1, perUserLimit: 2, sortOrder: 40 },
  { family: 'herb', quality: '地品', price: 360, quantity: 5, perUserLimit: 2, sortOrder: 50 },
  { family: 'monster', quality: '地品', price: 390, quantity: 3, perUserLimit: 2, sortOrder: 60 },
  { family: 'ore', quality: '地品', price: 330, quantity: 5, perUserLimit: 2, sortOrder: 70 },
  { family: 'gongfa_manual', quality: '玄品', price: 260, quantity: 1, perUserLimit: 2, sortOrder: 80 },
  { family: 'herb', quality: '真品', price: 150, quantity: 10, perUserLimit: 3, sortOrder: 90 },
  { family: 'aux', quality: '真品', price: 130, quantity: 10, perUserLimit: 3, sortOrder: 100 },
];

/**
 * 宗门宝库默认货架：宗门贡献货币，走「宗门配给」定位 —— 日常制香/封灵材料为主，
 * 兼顾少量功法与珍材。价格按贡献计（低门槛、可日常消耗）。
 */
const SECT_DEFAULT_SLOTS: DefaultSlot[] = [
  { family: 'herb', quality: '凡品', price: 10, quantity: 20, perUserLimit: 10, sortOrder: 10 },
  { family: 'ore', quality: '凡品', price: 10, quantity: 20, perUserLimit: 10, sortOrder: 20 },
  { family: 'aux', quality: '凡品', price: 12, quantity: 20, perUserLimit: 10, sortOrder: 30 },
  { family: 'monster', quality: '凡品', price: 15, quantity: 15, perUserLimit: 8, sortOrder: 40 },
  { family: 'herb', quality: '灵品', price: 30, quantity: 15, perUserLimit: 8, sortOrder: 50 },
  { family: 'ore', quality: '灵品', price: 30, quantity: 15, perUserLimit: 8, sortOrder: 60 },
  { family: 'aux', quality: '灵品', price: 35, quantity: 15, perUserLimit: 8, sortOrder: 70 },
  { family: 'monster', quality: '玄品', price: 100, quantity: 8, perUserLimit: 5, sortOrder: 80 },
  { family: 'herb', quality: '玄品', price: 90, quantity: 10, perUserLimit: 5, sortOrder: 90 },
  { family: 'gongfa_manual', quality: '玄品', price: 240, quantity: 1, perUserLimit: 1, sortOrder: 100 },
  { family: 'skill_manual', quality: '玄品', price: 300, quantity: 1, perUserLimit: 1, sortOrder: 110 },
  { family: 'tcdb', quality: '真品', price: 780, quantity: 1, perUserLimit: 1, sortOrder: 120 },
];

function familyOf(itemId: string): MaterialFamily | null {
  for (const [family, prefix] of Object.entries(FAMILY_PREFIX) as [
    MaterialFamily,
    string,
  ][]) {
    if (itemId.startsWith(prefix)) return family;
  }
  return null;
}

type ShopTable = typeof reputationShopItems | typeof sectShopItems;

async function hasAnyRow(table: ShopTable): Promise<boolean> {
  const q = getExecutor();
  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(table);
  return Number(row?.n ?? 0) > 0;
}

async function seedShop(args: {
  table: ShopTable;
  slots: DefaultSlot[];
  shopLabel: string;
  publishedByFamilyQuality: Map<MaterialFamily, Map<Quality, string[]>>;
}): Promise<void> {
  const q = getExecutor();
  if (await hasAnyRow(args.table)) {
    console.info(`[shop-defaults] ${args.shopLabel} 已有历史货架行，跳过默认播种`);
    return;
  }

  const missing: string[] = [];
  const values: Array<{
    itemLibraryItemId: string;
    price: number;
    quantity: number;
    perUserLimit: number | null;
    status: 'active';
    sortOrder: number;
    createdBy: string;
    updatedBy: string;
  }> = [];

  for (const slot of args.slots) {
    const candidates = args.publishedByFamilyQuality
      .get(slot.family)
      ?.get(slot.quality);
    const itemId = candidates?.[0];
    if (!itemId) {
      missing.push(`${slot.family}/${slot.quality}`);
      continue;
    }
    values.push({
      itemLibraryItemId: itemId,
      price: slot.price,
      quantity: slot.quantity,
      perUserLimit: slot.perUserLimit,
      status: 'active',
      sortOrder: slot.sortOrder,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
  }

  if (values.length > 0) {
    await q.insert(args.table).values(values).onConflictDoNothing();
  }
  console.info(
    `[shop-defaults] ${args.shopLabel} 默认货架播种完成：上架 ${values.length} 件` +
      (missing.length > 0 ? `；道具库缺料跳过：${missing.join('、')}` : ''),
  );
}

/**
 * 启动引导：为两商店播种默认货架（幂等，见文件头注释）。
 * 道具库缺 published 预设时仅告警——运营先在后台「道具库 → 材料目录」一键入库后
 * 再清空商店表重启即可补齐。
 */
export async function ensureDefaultShopCatalog(): Promise<void> {
  const q = getExecutor();
  const published = await q
    .select({
      itemId: itemLibrary.itemId,
      quality: itemLibrary.quality,
    })
    .from(itemLibrary)
    .where(and(eq(itemLibrary.status, 'published')));

  const byFamilyQuality = new Map<
    MaterialFamily,
    Map<Quality, string[]>
  >();
  for (const row of published) {
    const family = familyOf(row.itemId);
    if (!family) continue;
    let byQuality = byFamilyQuality.get(family);
    if (!byQuality) {
      byQuality = new Map<Quality, string[]>();
      byFamilyQuality.set(family, byQuality);
    }
    const quality = row.quality as Quality;
    const list = byQuality.get(quality) ?? [];
    list.push(row.itemId);
    byQuality.set(quality, list);
  }
  for (const byQuality of byFamilyQuality.values()) {
    for (const list of byQuality.values()) list.sort();
  }

  await seedShop({
    table: reputationShopItems,
    slots: REPUTATION_DEFAULT_SLOTS,
    shopLabel: '天骄宝阁(声望商店)',
    publishedByFamilyQuality: byFamilyQuality,
  });
  await seedShop({
    table: sectShopItems,
    slots: SECT_DEFAULT_SLOTS,
    shopLabel: '宗门宝库(宗门商店)',
    publishedByFamilyQuality: byFamilyQuality,
  });
}
