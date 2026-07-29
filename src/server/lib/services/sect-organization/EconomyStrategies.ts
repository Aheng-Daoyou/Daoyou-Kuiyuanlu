import type { SectShopGrant } from '@shared/engine/sect';
import type { Material } from '@shared/types/cultivator';
import { organizationError } from './applicationSupport';
import type {
  IdGenerator,
  SectRewardGateway,
} from './ports';
import type { SectCommandEffects } from './SectCommandEffects';

export interface SectRewardGrantContext {
  userId: string;
  cultivatorId: string;
  quantity: number;
  grant: SectShopGrant;
  rewards: SectRewardGateway;
  ids: IdGenerator;
  source: string;
}

export interface SectRewardGrantStrategy {
  readonly key: string;
  grant(context: SectRewardGrantContext): Promise<SectCommandEffects>;
}

export class SectRewardGrantStrategyRegistry {
  private readonly strategies = new Map<string, SectRewardGrantStrategy>();

  constructor(strategies: readonly SectRewardGrantStrategy[] = []) {
    for (const strategy of strategies) this.register(strategy);
  }

  register(strategy: SectRewardGrantStrategy): void {
    if (this.strategies.has(strategy.key))
      throw new Error(`重复的宗门奖励策略：${strategy.key}`);
    this.strategies.set(strategy.key, strategy);
  }

  has(key: string): boolean {
    return this.strategies.has(key);
  }

  require(key: string): SectRewardGrantStrategy {
    const strategy = this.strategies.get(key);
    if (!strategy) organizationError(`尚未注册宗门奖励策略：${key}`, 500);
    return strategy;
  }
}

export class SpiritStoneRewardGrantStrategy implements SectRewardGrantStrategy {
  readonly key = 'sect.reward.spirit-stones';

  async grant(context: SectRewardGrantContext): Promise<SectCommandEffects> {
    if (context.grant.kind !== this.key)
      organizationError('宗门灵石奖励配置不匹配', 500);
    return (
      await context.rewards.grantSpiritStones(
      context.cultivatorId,
      context.quantity,
      )
    ).effects;
  }
}

export class MaterialRewardGrantStrategy implements SectRewardGrantStrategy {
  readonly key = 'sect.reward.material';

  async grant(context: SectRewardGrantContext): Promise<SectCommandEffects> {
    if (
      context.grant.kind !== this.key ||
      !context.grant.type ||
      !context.grant.quality
    )
      organizationError('宗门材料奖励配置不匹配', 500);
    return context.rewards.grantMaterial(context.cultivatorId, {
      name: context.grant.name,
      type: context.grant.type,
      rank: context.grant.quality,
      element: context.grant.element as Material['element'],
      description: context.grant.description,
      details: { source: context.source },
      quantity: context.quantity,
    });
  }
}

export class PillRewardGrantStrategy implements SectRewardGrantStrategy {
  readonly key = 'sect.reward.pill';

  async grant(context: SectRewardGrantContext): Promise<SectCommandEffects> {
    if (
      context.grant.kind !== this.key ||
      !context.grant.spec ||
      !context.grant.quality
    )
      organizationError('宗门丹药奖励配置不匹配', 500);
    return context.rewards.grantPill(context.userId, context.cultivatorId, {
      id: context.ids.next(),
      name: context.grant.name,
      quality: context.grant.quality,
      description: context.grant.description,
      prompt:
        context.source === 'sect_stipend' ? '宗门弟子周俸' : '宗门宝库制式丹药',
      spec: context.grant.spec,
      quantity: context.quantity,
    });
  }
}
