import type { DbExecutor, DbTransaction } from '@server/lib/drizzle/db';
import * as organization from '@server/lib/repositories/sectOrganizationRepository';
import * as memberships from '@server/lib/repositories/sectRepository';
import {
  addConsumableToInventory,
  getPlayerRuntimeCultivatorByIdUnsafe,
  updateCultivationExp,
} from '@server/lib/services/cultivatorService';
import { addMaterialStackToInventory } from '@server/lib/services/materialInventory';
import { SeededBattleRandomSource } from '@shared/engine/battle-v5/core/BattleRandom';
import {
  SectTaskRecordPayloadSchema,
  type SectDiscipleRank,
  type SectPillSubmissionFacts,
  type SectPillTraitKey,
  type SectRuntime,
  type SectSubmissionItemFacts,
  type SectSubmissionItemKind,
} from '@shared/engine/sect';
import { simulateBattleV5 } from '@shared/lib/battle/simulateBattleV5';
import { isPillSpec } from '@shared/lib/consumables';
import {
  ELEMENT_VALUES,
  MATERIAL_TYPE_VALUES,
  QUALITY_VALUES,
  type ElementType,
  type MaterialType,
  type Quality,
} from '@shared/types/constants';
import type { ConsumableSpec } from '@shared/types/consumable';
import type {
  Clock,
  IdGenerator,
  SectAdmissionRepository,
  SectBenefitQueryContext,
  SectCommandContext,
  SectConstructionCommandContext,
  SectConstructionProjectRecord,
  SectEconomyCommandContext,
  SectEconomyQueryContext,
  SectFacilityRepository,
  SectMembershipCommandContext,
  SectMembershipRepository,
  SectQueryContext,
  SectTaskRecord,
  SectTraditionRepository,
  SectTrainingResourceGateway,
} from './ports';
import { getSectDateKey, getSectWeekKey } from './SectOrganizationClock';

function mapTask(row: {
  id: string;
  membershipId: string;
  taskId: string;
  kind: string;
  periodKey: string;
  status: string;
  progress: number;
  payload: unknown;
  completedAt: Date | null;
  claimedAt: Date | null;
}): SectTaskRecord {
  return {
    id: row.id,
    membershipId: row.membershipId,
    taskId: row.taskId,
    kind: row.kind as SectTaskRecord['kind'],
    periodKey: row.periodKey,
    status: row.status as SectTaskRecord['status'],
    progress: row.progress,
    payload: SectTaskRecordPayloadSchema.parse(row.payload),
    completedAt: row.completedAt ?? undefined,
    claimedAt: row.claimedAt ?? undefined,
  };
}

export const systemSectClock: Clock = {
  now: () => new Date(),
  dateKey: getSectDateKey,
  weekKey: getSectWeekKey,
};

export const cryptoSectIdGenerator: IdGenerator = {
  next: () => globalThis.crypto.randomUUID(),
};

function moduleResolver(runtime: SectRuntime) {
  return {
    require: (sectId: string) => runtime.registry.require(sectId).organization,
  };
}

function requireTransaction(q: DbExecutor | DbTransaction): DbTransaction {
  if (!('rollback' in q)) throw new Error('宗门写操作必须使用事务绑定 Adapter');
  return q;
}

function stateAdapter(q: DbExecutor | DbTransaction, runtime: SectRuntime) {
  return {
    load: (cultivatorId: string) =>
      memberships.loadCultivatorSectState(cultivatorId, q, runtime),
    loadForSect: (cultivatorId: string, sectId: string) =>
      memberships.loadCultivatorSectStateForSect(
        cultivatorId,
        sectId,
        q,
        runtime,
      ),
    listMemberships: (cultivatorId: string) =>
      memberships.listMemberships(cultivatorId, q),
  };
}

export function createPostgresSectAdmissionRepository(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
}): SectAdmissionRepository {
  const { q, runtime } = args;
  return {
    ...stateAdapter(q, runtime),
    findActiveMembership: (cultivatorId) =>
      memberships.findMembership(cultivatorId, q),
    findMembershipForSect: (cultivatorId, sectId) =>
      memberships.findMembershipForSect(cultivatorId, sectId, q),
    ensureMembershipCandidate(cultivatorId, sectId, configVersion) {
      return memberships.ensureMembershipCandidate(
        cultivatorId,
        sectId,
        configVersion,
        requireTransaction(q),
      );
    },
    activateMembership: (membershipId, definition) =>
      memberships.activateMembership(
        membershipId,
        definition,
        requireTransaction(q),
      ),
    ensureFacilities: (sectId, facilities) =>
      organization.ensureSectFacilities(
        sectId,
        facilities,
        requireTransaction(q),
      ),
  };
}

export function createPostgresSectTraditionRepository(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
}): SectTraditionRepository {
  const { q, runtime } = args;
  const tx = () => requireTransaction(q);
  return {
    ...stateAdapter(q, runtime),
    setMethodLevel: (membershipId, methodId, level) =>
      memberships.setMethodLevel(membershipId, methodId, level, tx()),
    createPathWithFirstLayer: (membershipId, pathId, tacticId, layerId) =>
      memberships.createPathWithFirstLayer(
        membershipId,
        pathId,
        tacticId,
        layerId,
        tx(),
      ),
    appendUnlockedPathLayer: (membershipId, pathId, layerId, expectedCount) =>
      memberships.appendUnlockedPathLayer(
        membershipId,
        pathId,
        layerId,
        expectedCount,
        tx(),
      ),
    activatePathIfNone: (membershipId, pathId) =>
      memberships.activatePathIfNone(membershipId, pathId, tx()),
    activatePath: (membershipId, pathId) =>
      memberships.activatePath(membershipId, pathId, tx()),
    replaceMeridianLoadout: (membershipId, pathId, slot, nodeIds) =>
      memberships.replaceMeridianLoadout(
        membershipId,
        pathId,
        slot,
        nodeIds,
        tx(),
      ),
    activateMeridianLoadout: (membershipId, pathId, slot) =>
      memberships.activateMeridianLoadout(membershipId, pathId, slot, tx()),
    replaceAbilityLoadout: (membershipId, slots) =>
      memberships.replaceAbilityLoadout(membershipId, slots, tx()),
    setPathTactic: (membershipId, pathId, tacticId) =>
      memberships.setPathTactic(membershipId, pathId, tacticId, tx()),
  };
}

export function createPostgresSectTrainingResourceGateway(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
}): SectTrainingResourceGateway {
  const { q, runtime } = args;
  return {
    load: (cultivatorId) =>
      memberships.loadSectCultivatorProgress(cultivatorId, q),
    spend: (cultivatorId, cost) =>
      memberships.spendTrainingResources(
        cultivatorId,
        cost,
        requireTransaction(q),
      ),
    async methodLevelCap(cultivatorId) {
      const state = await memberships.loadCultivatorSectState(
        cultivatorId,
        q,
        runtime,
      );
      if (!state) return 20;
      const levels = new Map(
        (await organization.listSectFacilities(state.sectId, q)).map((row) => [
          row.facilityKey,
          row.level,
        ]),
      );
      return runtime.registry
        .require(state.sectId)
        .organization.benefits.methodLevelCap(levels);
    },
  };
}

function mapProject(
  row: {
    id: string;
    sectId: string;
    facilityKey: string;
    targetLevel: number;
    progress: number;
    target: number;
    status: string;
    startedWeekKey: string;
    completedAt: Date | null;
  } | null,
): SectConstructionProjectRecord | null {
  return row
    ? {
        id: row.id,
        sectId: row.sectId,
        facilityKey: row.facilityKey,
        targetLevel: row.targetLevel,
        progress: row.progress,
        target: row.target,
        status: row.status as SectConstructionProjectRecord['status'],
        startedWeekKey: row.startedWeekKey,
        completedAt: row.completedAt,
      }
    : null;
}

function membershipAdapter(
  q: DbExecutor | DbTransaction,
): SectMembershipRepository {
  return {
    async findByCultivator(cultivatorId) {
      const row = await memberships.findMembership(cultivatorId, q);
      return row
        ? {
            id: row.id,
            sectId: row.sectId,
            cultivatorId: row.cultivatorId,
            discipleRank: row.discipleRank as SectDiscipleRank,
            contribution: row.contribution,
          }
        : null;
    },
    countCompletedDailyTasks: (membershipId) =>
      organization.countCompletedDailySectTasks(membershipId, q),
    hasCompletedTask: (membershipId, taskId) =>
      organization.hasCompletedSectTask(membershipId, taskId, q),
    loadState: (cultivatorId) =>
      memberships.loadCultivatorSectState(cultivatorId, q),
    async promote(membershipId, rank) {
      if (!('rollback' in q)) throw new Error('宗门晋升必须在事务中执行');
      return Boolean(
        await organization.promoteSectMembership(membershipId, rank, q),
      );
    },
    async listMembers(sectId, page, pageSize) {
      const result = await organization.listSectMembers(
        sectId,
        page,
        pageSize,
        q,
      );
      return {
        rows: result.rows.map((row) => ({
          ...row,
          discipleRank: row.discipleRank as SectDiscipleRank,
        })),
        total: result.total,
      };
    },
  };
}

function facilityAdapter(
  q: DbExecutor | DbTransaction,
  runtime: SectRuntime,
): SectFacilityRepository {
  return {
    ensure: (sectId) =>
      organization.ensureSectFacilities(
        sectId,
        runtime.registry.require(sectId).organization.construction.facilities,
        q,
      ),
    list: (sectId) => organization.listSectFacilities(sectId, q),
  };
}

function inventoryAdapter(q: DbExecutor | DbTransaction) {
  return {
    findMaterial: (cultivatorId: string, itemId: string) =>
      organization.findOwnedMaterial(cultivatorId, itemId, q),
    findConsumable: (cultivatorId: string, itemId: string) =>
      organization.findOwnedConsumable(cultivatorId, itemId, q),
    async findArtifact(cultivatorId: string, itemId: string) {
      const row = await organization.findOwnedArtifact(cultivatorId, itemId, q);
      return row ? { ...row, quality: row.quality ?? '凡品' } : null;
    },
    consumeMaterial: (itemId: string, quantity: number) => {
      if (!('rollback' in q)) throw new Error('宗门物品提交必须在事务中执行');
      return organization.consumeOwnedMaterial(itemId, quantity, q);
    },
    consumeConsumable: (itemId: string, quantity: number) => {
      if (!('rollback' in q)) throw new Error('宗门物品提交必须在事务中执行');
      return organization.consumeOwnedConsumable(itemId, quantity, q);
    },
    consumeArtifact: (itemId: string) => {
      if (!('rollback' in q)) throw new Error('宗门物品提交必须在事务中执行');
      return organization.consumeOwnedArtifact(itemId, q);
    },
  };
}

function normalizeQuality(value: string | null): Quality {
  return QUALITY_VALUES.includes(value as Quality)
    ? (value as Quality)
    : '凡品';
}

function pillTraits(spec: unknown): SectPillTraitKey[] {
  if (!isPillSpec(spec as ConsumableSpec)) return [];
  const pillSpec = spec as Extract<ConsumableSpec, { kind: 'pill' }>;
  const traits = new Set<SectPillTraitKey>();
  for (const operation of pillSpec.operations) {
    if (operation.type === 'restore_resource')
      traits.add(operation.resource === 'hp' ? 'restore_hp' : 'restore_mp');
    else if (operation.type === 'remove_status') traits.add('detox');
    else if (operation.type === 'gain_progress')
      traits.add(
        operation.target === 'cultivation_exp'
          ? 'gain_cultivation'
          : 'gain_insight',
      );
    else if (operation.type === 'increase_lifespan')
      traits.add('increase_lifespan');
    else if (operation.type === 'advance_track')
      traits.add(
        operation.track === 'marrow_wash' ? 'marrow_wash' : 'tempering',
      );
    else if (
      operation.type === 'add_status' &&
      ['breakthrough_focus', 'protect_meridians', 'clear_mind'].includes(
        operation.status,
      )
    )
      traits.add('breakthrough_support');
  }
  return [...traits];
}

function mapSubmissionPill(row: {
  id: string;
  name: string;
  quality: string;
  quantity: number;
  spec: unknown;
}): SectPillSubmissionFacts | null {
  if (!isPillSpec(row.spec as ConsumableSpec)) return null;
  const spec = row.spec as ConsumableSpec & { kind: 'pill' };
  return {
    kind: 'pill',
    id: row.id,
    name: row.name,
    quality: normalizeQuality(row.quality),
    quantity: row.quantity,
    family: spec.family,
    appearance: spec.alchemyMeta.appearance,
    traits: pillTraits(spec),
  };
}

function mapSubmissionMaterial(row: {
  id: string;
  name: string;
  rank: string;
  quantity: number;
  type: string;
  element: string | null;
}): SectSubmissionItemFacts {
  return {
    kind: 'material',
    id: row.id,
    name: row.name,
    quality: normalizeQuality(row.rank),
    quantity: row.quantity,
    materialType: MATERIAL_TYPE_VALUES.includes(row.type as MaterialType)
      ? (row.type as MaterialType)
      : 'aux',
    element: ELEMENT_VALUES.includes(row.element as ElementType)
      ? (row.element as ElementType)
      : undefined,
  };
}

function mapSubmissionArtifact(row: {
  id: string;
  name: string;
  quality: string | null;
  slot: string | null;
  isEquipped: boolean;
  productModel: unknown;
}): SectSubmissionItemFacts {
  const model =
    row.productModel && typeof row.productModel === 'object'
      ? (row.productModel as Record<string, unknown>)
      : {};
  const affixes = Array.isArray(model.affixes) ? model.affixes : [];
  const modelQuality = QUALITY_VALUES.includes(
    model.projectionQuality as Quality,
  )
    ? (model.projectionQuality as Quality)
    : undefined;
  const rowQuality = normalizeQuality(row.quality);
  if (modelQuality && modelQuality !== rowQuality)
    throw new Error(`法宝品质持久化不一致：${row.id}`);
  return {
    kind: 'artifact',
    id: row.id,
    name: row.name,
    quality: modelQuality ?? rowQuality,
    quantity: 1,
    slot: ['weapon', 'armor', 'accessory'].includes(row.slot ?? '')
      ? (row.slot as 'weapon' | 'armor' | 'accessory')
      : undefined,
    perfectAffixCount: affixes.filter(
      (affix) =>
        affix &&
        typeof affix === 'object' &&
        (affix as Record<string, unknown>).isPerfect === true,
    ).length,
    isEquipped: row.isEquipped,
  };
}

function submissionInventoryAdapter(q: DbExecutor | DbTransaction) {
  const find = async (
    cultivatorId: string,
    kind: SectSubmissionItemKind,
    itemId: string,
  ): Promise<SectSubmissionItemFacts | null> => {
    if (kind === 'pill') {
      const row = await organization.findOwnedConsumable(
        cultivatorId,
        itemId,
        q,
      );
      return row ? mapSubmissionPill(row) : null;
    }
    if (kind === 'artifact') {
      const row = await organization.findOwnedArtifact(cultivatorId, itemId, q);
      return row ? mapSubmissionArtifact(row) : null;
    }
    const row = await organization.findOwnedMaterial(cultivatorId, itemId, q);
    return row ? mapSubmissionMaterial(row) : null;
  };
  return {
    async listSubmissionItems(input: {
      cultivatorId: string;
      kind: SectSubmissionItemKind;
    }) {
      if (input.kind === 'pill') {
        const rows = await organization.listOwnedSubmissionConsumables(
          input.cultivatorId,
          q,
        );
        return rows
          .map(mapSubmissionPill)
          .filter((item): item is SectPillSubmissionFacts => Boolean(item));
      }
      if (input.kind === 'artifact') {
        const rows = await organization.listOwnedSubmissionArtifacts(
          input.cultivatorId,
          q,
        );
        return rows.map(mapSubmissionArtifact);
      }
      const rows = await organization.listOwnedSubmissionMaterials(
        input.cultivatorId,
        q,
      );
      return rows.map(mapSubmissionMaterial);
    },
    findSubmissionItem: find,
    async consumeSubmissionItem(input: {
      cultivatorId: string;
      kind: SectSubmissionItemKind;
      itemId: string;
      quantity: number;
    }) {
      if (!('rollback' in q)) throw new Error('宗门物品提交必须在事务中执行');
      if (input.kind === 'pill')
        return organization.consumeOwnedSubmissionConsumable(
          input.cultivatorId,
          input.itemId,
          input.quantity,
          q,
        );
      if (input.kind === 'artifact')
        return organization.consumeOwnedSubmissionArtifact(
          input.cultivatorId,
          input.itemId,
          q,
        );
      return organization.consumeOwnedSubmissionMaterial(
        input.cultivatorId,
        input.itemId,
        input.quantity,
        q,
      );
    },
  };
}

function rewardAdapter(q: DbExecutor | DbTransaction, userId: string) {
  return {
    async grantContribution(
      membershipId: string,
      amount: number,
      reason: string,
      referenceId: string,
    ) {
      if (!('rollback' in q)) throw new Error('宗门奖励必须在事务中执行');
      await organization.addSectContribution(
        membershipId,
        amount,
        reason,
        referenceId,
        q,
      );
    },
    async grantSpiritStones(cultivatorId: string, amount: number) {
      if (!('rollback' in q)) throw new Error('宗门奖励必须在事务中执行');
      await organization.addCultivatorSpiritStones(cultivatorId, amount, q);
    },
    async grantCultivationExp(
      _userId: string,
      cultivatorId: string,
      amount: number,
    ) {
      if (!('rollback' in q)) throw new Error('宗门奖励必须在事务中执行');
      await updateCultivationExp(userId, cultivatorId, amount, undefined, q);
    },
    async grantMaterial(
      cultivatorId: string,
      input: Parameters<typeof addMaterialStackToInventory>[1],
    ) {
      if (!('rollback' in q)) throw new Error('宗门奖励必须在事务中执行');
      await addMaterialStackToInventory(cultivatorId, input, q);
    },
    async grantPill(
      _userId: string,
      cultivatorId: string,
      input: Omit<Parameters<typeof addConsumableToInventory>[2], 'type'>,
    ) {
      if (!('rollback' in q)) throw new Error('宗门奖励必须在事务中执行');
      await addConsumableToInventory(
        userId,
        cultivatorId,
        { ...input, type: '丹药' },
        q,
      );
    },
  };
}

function economyAdapter(q: DbExecutor | DbTransaction) {
  return {
    purchasedQuantity: (
      membershipId: string,
      weekKey: string,
      itemId: string,
    ) =>
      organization.getPurchasedSectShopQuantity(
        membershipId,
        weekKey,
        itemId,
        q,
      ),
    async spendContribution(
      membershipId: string,
      amount: number,
      reason: string,
      referenceId: string,
    ) {
      if (!('rollback' in q)) throw new Error('宗门贡献消费必须在事务中执行');
      return (
        (await organization.spendSectContribution(
          membershipId,
          amount,
          reason,
          referenceId,
          q,
        )) !== null
      );
    },
    async recordPurchase(
      membershipId: string,
      weekKey: string,
      itemId: string,
      quantity: number,
    ) {
      if (!('rollback' in q)) throw new Error('宗门兑换必须在事务中执行');
      return Boolean(
        await organization.addSectShopPurchase(
          membershipId,
          weekKey,
          itemId,
          quantity,
          undefined,
          q,
        ),
      );
    },
    hasClaimedStipend: (membershipId: string, weekKey: string) =>
      organization.hasClaimedSectStipend(membershipId, weekKey, q),
    async recordStipendClaim(input: {
      membershipId: string;
      weekKey: string;
      spiritStones: number;
      rewards: unknown[];
    }) {
      if (!('rollback' in q)) throw new Error('宗门俸禄必须在事务中执行');
      return Boolean(await organization.createSectStipendClaim(input, q));
    },
    async spendSpiritStones(cultivatorId: string, amount: number) {
      if (!('rollback' in q)) throw new Error('宗门捐献必须在事务中执行');
      return organization.spendCultivatorSpiritStones(cultivatorId, amount, q);
    },
  };
}

function constructionAdapter(q: DbExecutor | DbTransaction) {
  return {
    async findActiveProject(sectId: string) {
      return mapProject(
        await ('rollback' in q
          ? organization.lockActiveSectProject(sectId, q)
          : organization.findActiveSectProject(sectId, q)),
      );
    },
    async findLatestCompletedProject(sectId: string) {
      return mapProject(
        await organization.findLatestCompletedSectProject(sectId, q),
      );
    },
    async createProject(input: {
      sectId: string;
      facilityKey: string;
      targetLevel: number;
      target: number;
      startedWeekKey: string;
    }) {
      return mapProject(
        await organization.createSectProject(
          {
            ...input,
            facilityKey: input.facilityKey,
          },
          q,
        ),
      );
    },
    countRecentlyActiveMembers: (sectId: string, since: Date) =>
      organization.countRecentlyActiveSectMembers(sectId, since, q),
    async saveProjectProgress(projectId: string, progress: number) {
      if (!('rollback' in q)) throw new Error('宗门建设必须在事务中执行');
      return mapProject(
        await organization.saveSectProjectProgress(projectId, progress, q),
      );
    },
    async completeProject(projectId: string, completedAt: Date) {
      if (!('rollback' in q)) throw new Error('宗门建设必须在事务中执行');
      return mapProject(
        await organization.completeSectProject(projectId, completedAt, q),
      );
    },
    async upgradeFacility(sectId: string, facilityKey: string, level: number) {
      if (!('rollback' in q)) throw new Error('宗门建设必须在事务中执行');
      return Boolean(
        await organization.upgradeSectFacility(sectId, facilityKey, level, q),
      );
    },
    donatedContribution: (membershipId: string, dateKey: string) =>
      organization.sumSectDonationContributionForDate(membershipId, dateKey, q),
    async recordDonation(input: {
      id: string;
      membershipId: string;
      projectId: string;
      dateKey: string;
      demandId: string;
      contribution: number;
      constructionPoints: number;
      itemSnapshot: Record<string, unknown>;
    }) {
      if (!('rollback' in q)) throw new Error('宗门捐献必须在事务中执行');
      return organization.insertSectDonation(input, q);
    },
    listRecentDonations: (sectId: string, limit: number) =>
      organization.listRecentSectDonations(sectId, limit, q),
    async grantContribution(
      membershipId: string,
      amount: number,
      reason: string,
      referenceId: string,
    ) {
      if (!('rollback' in q)) throw new Error('宗门贡献发放必须在事务中执行');
      await organization.addSectContribution(
        membershipId,
        amount,
        reason,
        referenceId,
        q,
      );
    },
  };
}

export function createPostgresSectMembershipContext(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
  clock?: Clock;
}): SectMembershipCommandContext {
  return {
    memberships: membershipAdapter(args.q),
    facilities: facilityAdapter(args.q, args.runtime),
    economy: economyAdapter(args.q),
    construction: constructionAdapter(args.q),
    modules: moduleResolver(args.runtime),
    clock: args.clock ?? systemSectClock,
  };
}

export function createPostgresSectEconomyContext(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
  userId: string;
  clock?: Clock;
  ids?: IdGenerator;
}): SectEconomyCommandContext;
export function createPostgresSectEconomyContext(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
  userId?: undefined;
  clock?: Clock;
  ids?: IdGenerator;
}): SectEconomyQueryContext;
export function createPostgresSectEconomyContext(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
  userId?: string;
  clock?: Clock;
  ids?: IdGenerator;
}): SectEconomyQueryContext | SectEconomyCommandContext {
  const base: SectEconomyQueryContext = {
    memberships: membershipAdapter(args.q),
    facilities: facilityAdapter(args.q, args.runtime),
    economy: economyAdapter(args.q),
    modules: moduleResolver(args.runtime),
    clock: args.clock ?? systemSectClock,
  };
  if (!args.userId) return base;
  return {
    ...base,
    rewards: rewardAdapter(args.q, args.userId),
    ids: args.ids ?? cryptoSectIdGenerator,
  };
}

export function createPostgresSectConstructionContext(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
  clock?: Clock;
  ids?: IdGenerator;
}): SectConstructionCommandContext {
  return {
    memberships: membershipAdapter(args.q),
    facilities: facilityAdapter(args.q, args.runtime),
    construction: constructionAdapter(args.q),
    economy: economyAdapter(args.q),
    inventory: inventoryAdapter(args.q),
    modules: moduleResolver(args.runtime),
    clock: args.clock ?? systemSectClock,
    ids: args.ids ?? cryptoSectIdGenerator,
  };
}

export function createPostgresSectBenefitContext(args: {
  q: DbExecutor | DbTransaction;
  runtime: SectRuntime;
}): SectBenefitQueryContext {
  return {
    memberships: membershipAdapter(args.q),
    facilities: facilityAdapter(args.q, args.runtime),
    modules: moduleResolver(args.runtime),
  };
}

export function createPostgresSectCommandContext(args: {
  tx: DbTransaction;
  runtime: SectRuntime;
  userId: string;
  clock?: Clock;
  ids?: IdGenerator;
}): SectCommandContext {
  const { tx } = args;
  return {
    memberships: {
      async findByCultivator(cultivatorId) {
        const row = await memberships.findMembership(cultivatorId, tx);
        return row
          ? {
              id: row.id,
              sectId: row.sectId,
              cultivatorId: row.cultivatorId,
              discipleRank: row.discipleRank as SectDiscipleRank,
              contribution: row.contribution,
            }
          : null;
      },
      countCompletedDailyTasks: (membershipId) =>
        organization.countCompletedDailySectTasks(membershipId, tx),
      hasCompletedTask: (membershipId, taskId) =>
        organization.hasCompletedSectTask(membershipId, taskId, tx),
    },
    tasks: {
      list: async (membershipId) =>
        (await organization.listSectTaskRecords(membershipId, tx)).map(mapTask),
      find: async (membershipId, periodKey, taskId) => {
        const row = await organization.findSectTaskRecord(
          membershipId,
          periodKey,
          taskId,
          tx,
        );
        return row ? mapTask(row) : null;
      },
      create: async (input) =>
        mapTask(await organization.createSectTaskRecord(input, tx)),
      complete: async (id, progress) => {
        const row = await organization.completeSectTaskRecord(id, progress, tx);
        return row ? mapTask(row) : null;
      },
      updatePayload: async (id, payload) => {
        const row = await organization.updateSectTaskPayload(id, payload, tx);
        return row ? mapTask(row) : null;
      },
      claim: async (id, claimedAt) => {
        const row = await organization.claimCompletedSectTaskRecord(
          id,
          claimedAt,
          tx,
        );
        return row ? mapTask(row) : null;
      },
      upsertProgress: async (input) =>
        mapTask(await organization.upsertSectTaskProgress(input, tx)),
      countCompletedDailySince: (membershipId, periodKey) =>
        organization.countCompletedDailySectTasksSince(
          membershipId,
          periodKey,
          tx,
        ),
    },
    submissionInventory: submissionInventoryAdapter(tx),
    cultivators: {
      async loadRuntime(cultivatorId) {
        return (
          (await getPlayerRuntimeCultivatorByIdUnsafe(cultivatorId, tx))
            ?.cultivator ?? null
        );
      },
      findMirrorCultivatorId: (sectId, excludeCultivatorId) =>
        organization.findSectMirrorCultivatorId(
          sectId,
          excludeCultivatorId,
          tx,
        ),
      loadProgress: (cultivatorId) =>
        memberships.loadSectCultivatorProgress(cultivatorId, tx),
    },
    battle: {
      simulate: (player, opponent, seed) =>
        simulateBattleV5(
          player,
          opponent,
          undefined,
          new SeededBattleRandomSource(seed),
        ),
    },
    rewards: rewardAdapter(tx, args.userId),
    modules: moduleResolver(args.runtime),
    clock: args.clock ?? systemSectClock,
    ids: args.ids ?? cryptoSectIdGenerator,
  };
}

export function createPostgresSectQueryContext(args: {
  q: DbExecutor;
  runtime: SectRuntime;
  clock?: Clock;
}): SectQueryContext {
  return {
    memberships: {
      async findByCultivator(cultivatorId) {
        const row = await memberships.findMembership(cultivatorId, args.q);
        return row
          ? {
              id: row.id,
              sectId: row.sectId,
              cultivatorId: row.cultivatorId,
              discipleRank: row.discipleRank as SectDiscipleRank,
              contribution: row.contribution,
            }
          : null;
      },
      countCompletedDailyTasks: (membershipId) =>
        organization.countCompletedDailySectTasks(membershipId, args.q),
      hasCompletedTask: (membershipId, taskId) =>
        organization.hasCompletedSectTask(membershipId, taskId, args.q),
    },
    tasks: {
      list: async (membershipId) =>
        (await organization.listSectTaskRecords(membershipId, args.q)).map(
          mapTask,
        ),
      find: async (membershipId, periodKey, taskId) => {
        const row = await organization.findSectTaskRecord(
          membershipId,
          periodKey,
          taskId,
          args.q,
        );
        return row ? mapTask(row) : null;
      },
      countCompletedDailySince: (membershipId, periodKey) =>
        organization.countCompletedDailySectTasksSince(
          membershipId,
          periodKey,
          args.q,
        ),
    },
    submissionInventory: submissionInventoryAdapter(args.q),
    modules: {
      require: (sectId) => args.runtime.registry.require(sectId).organization,
    },
    clock: args.clock ?? systemSectClock,
  };
}
