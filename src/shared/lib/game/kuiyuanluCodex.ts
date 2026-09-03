import { AUCTION_TAX_BRACKETS, AUCTION_QUALITY_UNIT_PRICE_CAPS } from '@shared/config/auctionConfig';
import {
  QUALITY_ORDER,
  REALM_STAGE_VALUES,
  REALM_VALUES,
  SKILL_GRADE_VALUES,
} from '@shared/types/constants';

/**
 * 烬洲志 —— 游戏内图鉴数据。
 * 数值一律引用引擎常量（境界/品相/功法品阶/税率），描述文案为本篇唯一维护点。
 */

export interface CodexRealmEntry {
  name: (typeof REALM_VALUES)[number];
  title: string;
  description: string;
}

/** 九境：闻腥 → 渡渊（数值轴见 REALM_ORDER，此处为图鉴描述） */
export const CODEX_REALMS: CodexRealmEntry[] = [
  {
    name: '闻腥',
    title: '初闻渊腥',
    description: '凡人初闻渊中腥气，灯照未稳。此境方知世上有渊，夜里灯火须彻夜不熄。',
  },
  {
    name: '守灯',
    title: '掌一盏本命灯',
    description: '点起本命灯火，从此寿数与灯焰相连。灯亮则人存，灯摇则心乱。',
  },
  {
    name: '窥渊',
    title: '初窥渊面',
    description: '第一次直视渊面而不失神。知道的还不多，梦尚安稳。',
  },
  {
    name: '蚀体',
    title: '渊气蚀身',
    description: '渊气入体，血肉开始替你记住渊里的东西。力量渐强，神智渐沉。',
  },
  {
    name: '忘川',
    title: '涉亡者之水',
    description: '可行走忘川水域，与亡者同城而不被拖走。代价是忘掉一些自己。',
  },
  {
    name: '执灯',
    title: '执灯行渊底',
    description: '可提灯下行至渊底浅处。灯照出的圈以外，不是黑，是别的东西。',
  },
  {
    name: '掌灯',
    title: '掌一方灯火',
    description: '一城一地之灯火系于你手。你护灯，也被人当灯护着。',
  },
  {
    name: '近神',
    title: '灯焰近渊心',
    description: '灯焰已能触到渊心回响。世人看你如看神，渊看你如看熟人。',
  },
  {
    name: '渡渊',
    title: '渡尽深渊',
    description: '传说之境：提灯渡渊而返。无人证实有人做到，渊中也从未有人回来辟谣。',
  },
];

export const CODEX_REALM_STAGES = REALM_STAGE_VALUES;

/** 突破规矩（与点灯问渊机制一致） */
export const CODEX_BREAKTHROUGH_RULES = [
  '突破需点灯问渊：以本命灯为引，向渊中求一段新的灯序。',
  '渊中有应答，也可能有回礼。问渊失败会损失神智——知道得太多，人就疯得越快。',
  '灯韵（修为）积累越足，问渊时的灯焰越稳。',
];

export interface CodexQualityEntry {
  name: keyof typeof QUALITY_ORDER;
  description: string;
}

/** 品相八阶（物品品质轴）。寄售价封顶见 CODEX_QUALITY_CAP_MAP（引用引擎配置） */
export const CODEX_QUALITIES: CodexQualityEntry[] = [
  { name: '凡品', description: '凡俗手笔，灯下市集的常见货色。' },
  { name: '灵品', description: '沾了些灵气的物件，寻常人家供得起。' },
  { name: '玄品', description: '正式入流的门槛。鬼市竞珍只收玄品及以上。' },
  { name: '真品', description: '真传手笔，坊市里的硬通货。' },
  { name: '地品', description: '一地之珍，宗门库房也未必常有。' },
  { name: '天品', description: '天工造物，得一件可传家。' },
  { name: '仙品', description: '近乎传说，见者记一辈子。' },
  { name: '神品', description: '只存在于卷宗措辞里的品阶。' },
];

/** 功法十二品阶（天/地/玄/黄 × 上中下品） */
export const CODEX_SKILL_GRADES: { name: (typeof SKILL_GRADE_VALUES)[number]; tier: string }[] =
  SKILL_GRADE_VALUES.map((name) => ({
    name,
    tier: name.slice(0, 2),
  }));

export const CODEX_SKILL_TIER_NOTES: Record<string, string> = {
  天阶: '最高一档，多为失传残卷或渊中所授。',
  地阶: '宗门压箱底的传承，非核心不外传。',
  玄阶: '正经功法的中坚，市面能买到的大部分是这一档。',
  黄阶: '入门功法，胜在稳，不易练出问题。',
};

export interface CodexSectEntry {
  id: string;
  name: string;
  motto: string;
  description: string;
}

/** 六宗门（名称与地图宗门地标一致） */
export const CODEX_SECTS: CodexSectEntry[] = [
  {
    id: 'lingxiao',
    name: '太乙清都观',
    motto: '香火为契，守灯为誓',
    description: '以香火愿力养灯的正统道场。观中香火即契约：你供灯，灯护你。入门先学《守灯录》。',
  },
  {
    id: 'tianyan',
    name: '观星台',
    motto: '星图之下，无所遁形',
    description: '倒悬于崖壁下观星的学者一脉。他们推演星图、记录异象——知道的真相越多，疯得越彻底。',
  },
  {
    id: 'wuxiang',
    name: '白莲乳母教',
    motto: '莲灯不熄，乳母不眠',
    description: '南疆雾瘴中的莲灯信仰。乳母们以歌谣与莲灯安抚渊中低语，信众遍布三十七家村。',
  },
  {
    id: 'youdu',
    name: '幽都·地藏殿',
    motto: '渡亡者，亦渡生人',
    description: '藏于西北山腹的亡者之城执灯者。地藏殿管理忘川渡口，主持亡者入城的规矩。',
  },
  {
    id: 'jiujie',
    name: '掌灯司',
    motto: '天下灯火，皆归司辖',
    description: '官方执灯机构，烛京的秩序本家。颁灯契、缉私灯、管渊隙出入——也管你灯里烧的是什么。',
  },
  {
    id: 'baixiban',
    name: '百戏班',
    motto: '粉墨登场，渊下亦然',
    description: '以戏入道的奇门。班中人相信渊也爱看戏，唱得好，渊便肯多留一盏灯。',
  },
];

/** 货币与凭证 */
export const CODEX_CURRENCIES: { name: string; icon: string; description: string }[] = [
  { name: '灯油券', icon: '💰', description: '通用货币。坊市、鬼市竞珍、灯下坊市买卖皆用它。' },
  { name: '声望', icon: '🏵️', description: '榜上扬名、幻境破关所得，用于天骄宝阁兑换珍藏。' },
  { name: '宗门贡献', icon: '📜', description: '宗门任务与建设所得，在宗门宝库兑换内部物资。' },
  { name: '灯韵', icon: '🧘', description: '修为进度，问渊突破的底气。' },
  { name: '窥悟', icon: '💡', description: '突破、推演功法与神通所需的悟性结晶。' },
];

/** 鬼市竞珍规矩 */
export const CODEX_AUCTION_RULES: string[] = [
  '仅玄品及以上物品可寄售；封灵器须先卸下，每次限寄售 1 件。',
  '每人最多 5 个寄售位，寄售时长 48 小时，过期物品自动经灯笺返还。',
  '价格不是随意填写：单价设有全局上限，且按品相另有封顶（见品相一栏）。',
  '成交按单件价格适用超额累进「阶梯税」，税率约 3% ～ 15%，税后款项自动随灯笺（游戏邮件）寄给卖家。',
  '买家付款后物品同样经灯笺投递，买卖双方无需当面交易。',
  '可以给好友指定「专属交易」：需消耗一张拍卖行贵宾符，非指定道友不可购买。',
  '寄售中不可改价——想调价需先下架（物品原样返还），再重新上架。',
  '禁止购买自己寄售之物，也禁止同一账号下不同角色互相交易（防对敲）。'
];

/** 天骄宝阁规矩 */
export const CODEX_VAULT_RULES: string[] = [
  '宝阁货物由掌柜（服务器管理员）定期陈列，来源为官方鉴定的道具库。',
  '兑换消耗声望，部分珍藏设有每周个人限购。',
  '兑换后道具直接归入储物袋，无需邮寄。'
];

/** 阶梯税表（引用引擎配置，百分比展示） */
export const CODEX_TAX_TABLE = AUCTION_TAX_BRACKETS.map((bracket) => ({
  upTo: Number.isFinite(bracket.upTo) ? (bracket.upTo as number) : null,
  ratePercent: bracket.rateBps / 100,
}));

export const CODEX_QUALITY_CAP_MAP = AUCTION_QUALITY_UNIT_PRICE_CAPS;
