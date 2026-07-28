import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import type {
  SectConstructionBoardData,
  SectConstructionMemberData,
  SectInfrastructureData,
} from '@shared/contracts/sect';
import {
  SectConstructionProject,
  SectDonationOffer,
} from '@shared/engine/sect';
import type { SectDonationSpecificationRegistry } from './EconomyStrategies';
import type { SectBenefitService } from './SectBenefitService';
import type { SectDomainEventDispatcherFactory } from './SectDomainEventDispatcher';
import {
  assertDeclaredDonationKind,
  mapFacilities,
  mapProject,
  organizationError,
  organizationFor,
  requireMembership,
} from './applicationSupport';
import type {
  SectConstructionCommandContext,
  SectConstructionQueryContext,
} from './ports';
import { mergeSectCommandEffects } from './SectCommandEffects';

export class SectConstructionApplicationService {
  constructor(
    private readonly benefits: SectBenefitService,
    private readonly donationSpecifications: SectDonationSpecificationRegistry,
    private readonly events: SectDomainEventDispatcherFactory,
  ) {}

  private async ensureCurrentProject(
    sectId: string,
    context: SectConstructionCommandContext,
  ) {
    await context.facilities.ensure(sectId);
    const active = await context.construction.findActiveProject(sectId);
    if (active) return active;
    const weekKey = context.clock.weekKey();
    const latest =
      await context.construction.findLatestCompletedProject(sectId);
    if (
      latest?.completedAt &&
      context.clock.weekKey(latest.completedAt) === weekKey
    )
      return null;
    const facilities = await context.facilities.list(sectId);
    const policy = organizationFor(context.modules, sectId).construction;
    const upgradeable = new Set(
      policy.facilities
        .filter((facility) => facility.upgradeable)
        .map((facility) => facility.key),
    );
    const levels = new Map<string, number>(
      facilities
        .filter((row) => upgradeable.has(row.facilityKey))
        .map((row) => [row.facilityKey, row.level]),
    );
    const next = policy.nextProject(levels);
    if (!next) return null;
    const activeMembers = Math.max(
      1,
      Math.min(
        100,
        await context.construction.countRecentlyActiveMembers(
          sectId,
          new Date(context.clock.now().getTime() - 7 * 24 * 60 * 60 * 1000),
        ),
      ),
    );
    return context.construction.createProject({
      sectId,
      facilityKey: next.facilityKey,
      targetLevel: next.targetLevel,
      target: policy.projectBaseTarget(next.targetLevel) * activeMembers,
      startedWeekKey: weekKey,
    });
  }

  async ensureWeeklyProjectCommand(
    sectId: string,
    context: SectConstructionCommandContext,
  ): Promise<{
    result: Awaited<
      ReturnType<SectConstructionApplicationService['ensureCurrentProject']>
    >;
    resourceChanges: ResourceChangeDescriptor[];
  }> {
    const existing = await context.construction.findActiveProject(sectId);
    const project = await this.ensureCurrentProject(sectId, context);
    if (!project || existing?.id === project.id) {
      return { result: project, resourceChanges: [] };
    }
    const dateKey = context.clock.dateKey();
    const organization = organizationFor(context.modules, sectId);
    const demands = [
      ...organization.economy.donationDemands(sectId, dateKey),
    ];
    for (const demand of demands) {
      assertDeclaredDonationKind(organization, demand.kind);
    }
    const [facilities, recentActivity] = await Promise.all([
      context.facilities.list(sectId),
      context.construction.listRecentDonations(sectId, 12),
    ]);
    return {
      result: project,
      resourceChanges: [
        {
          scope: { kind: 'sect', id: sectId },
          resourceTopic: 'sect.infrastructure',
          eventType: 'sect.construction_project_started',
          operation: 'replace',
          payload: {
            facilities: mapFacilities(facilities),
            project: mapProject(project),
          },
        },
        {
          scope: { kind: 'sect', id: sectId },
          resourceTopic: 'sect.construction-board',
          eventType: 'sect.construction_board_changed',
          operation: 'replace',
          payload: {
            demands,
            dailyContributionCap: organization.economy.donationDailyCap,
            recentActivity: recentActivity.map((item) => ({
              ...item,
              createdAt: item.createdAt.toISOString(),
            })),
          },
        },
      ],
    };
  }

  private async loadConstructionSettlement(
    cultivatorId: string,
    context: SectConstructionQueryContext,
  ): Promise<{
    sectId: string;
    infrastructure: SectInfrastructureData;
    board: SectConstructionBoardData;
    member: SectConstructionMemberData;
  }> {
    const membership = await requireMembership(
      cultivatorId,
      context.memberships,
    );
    this.benefits.assertPermission(
      membership,
      'sect.construction.view',
      context.modules,
    );
    const dateKey = context.clock.dateKey();
    const organization = organizationFor(context.modules, membership.sectId);
    const demands = [
      ...organization.economy.donationDemands(membership.sectId, dateKey),
    ];
    for (const demand of demands)
      assertDeclaredDonationKind(organization, demand.kind);
    const [facilities, project, donatedContributionToday, recentActivity] =
      await Promise.all([
        context.facilities.list(membership.sectId),
        context.construction.findActiveProject(membership.sectId),
        context.construction.donatedContribution(membership.id, dateKey),
        context.construction.listRecentDonations(membership.sectId, 12),
      ]);
    return {
      sectId: membership.sectId,
      infrastructure: {
        facilities: mapFacilities(facilities),
        project: mapProject(project),
      },
      board: {
        demands,
        dailyContributionCap: organization.economy.donationDailyCap,
        recentActivity: recentActivity.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      member: { donatedContributionToday },
    };
  }

  async getConstructionBoard(
    cultivatorId: string,
    context: SectConstructionQueryContext,
  ): Promise<SectConstructionBoardData> {
    const membership = await requireMembership(
      cultivatorId,
      context.memberships,
    );
    this.benefits.assertPermission(
      membership,
      'sect.construction.view',
      context.modules,
    );
    const dateKey = context.clock.dateKey();
    const organization = organizationFor(context.modules, membership.sectId);
    const demands = [
      ...organization.economy.donationDemands(membership.sectId, dateKey),
    ];
    for (const demand of demands) {
      assertDeclaredDonationKind(organization, demand.kind);
    }
    const recentActivity = await context.construction.listRecentDonations(
      membership.sectId,
      12,
    );
    return {
      demands,
      dailyContributionCap: organization.economy.donationDailyCap,
      recentActivity: recentActivity.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async getConstructionMember(
    cultivatorId: string,
    context: SectConstructionQueryContext,
  ): Promise<SectConstructionMemberData> {
    const membership = await requireMembership(
      cultivatorId,
      context.memberships,
    );
    this.benefits.assertPermission(
      membership,
      'sect.construction.view',
      context.modules,
    );
    return {
      donatedContributionToday:
        await context.construction.donatedContribution(
          membership.id,
          context.clock.dateKey(),
        ),
    };
  }

  async donate(
    cultivatorId: string,
    input: { demandId: string; itemId?: string; quantity: number },
    context: SectConstructionCommandContext,
  ) {
    const membership = await requireMembership(
      cultivatorId,
      context.memberships,
    );
    this.benefits.assertPermission(
      membership,
      'sect.construction.donate',
      context.modules,
    );
    const projectRecord = await this.ensureCurrentProject(
      membership.sectId,
      context,
    );
    if (!projectRecord)
      organizationError('本周工程已经完成，请待下周长老议定新工程');
    const organization = organizationFor(context.modules, membership.sectId);
    const dateKey = context.clock.dateKey();
    const demand = organization.economy
      .donationDemands(membership.sectId, dateKey)
      .find((item) => item.id === input.demandId);
    if (!demand) organizationError('今日没有这项宗门需求', 400);
    assertDeclaredDonationKind(organization, demand.kind);
    let offer: SectDonationOffer;
    try {
      offer = SectDonationOffer.quote({
        demandId: demand.id,
        units: input.quantity,
        quantityPerUnit: demand.quantity,
        contributionPerUnit: demand.contribution,
        constructionPointsPerUnit: demand.constructionPoints,
      });
    } catch (error) {
      organizationError(
        error instanceof Error ? error.message : '捐献请求无效',
        400,
      );
    }
    const current = await context.construction.donatedContribution(
      membership.id,
      dateKey,
    );
    if (current + offer.contribution > organization.economy.donationDailyCap)
      organizationError(
        `每日建设贡献上限为 ${organization.economy.donationDailyCap}`,
        400,
      );
    const consumed = await this.donationSpecifications
      .require(demand.kind)
      .consume({
        cultivatorId,
        itemId: input.itemId,
        units: offer.units,
        itemQuantity: offer.itemQuantity,
        demand,
        inventory: context.inventory,
        economy: context.economy,
      });
    const donationId = context.ids.next();
    const aggregate = SectConstructionProject.rehydrate({
      id: projectRecord.id,
      sectId: projectRecord.sectId,
      facilityKey: projectRecord.facilityKey,
      targetLevel: projectRecord.targetLevel,
      target: projectRecord.target,
      progress: projectRecord.progress,
      completed: projectRecord.status === 'completed',
    });
    aggregate.applyDonation(
      membership.id,
      offer.contribution,
      offer.constructionPoints,
      {
        donationId,
        dateKey,
        demand,
        itemSnapshot: consumed.itemSnapshot,
      },
    );

    const dispatchEffects = await this.events
      .forConstruction(context)
      .dispatch(aggregate.pullEvents());
    const effects = mergeSectCommandEffects(
      consumed.effects,
      dispatchEffects,
    );
    const result = await this.loadConstructionSettlement(cultivatorId, context);
    return {
      result,
      resourceChanges: [
        {
          scope: { kind: 'sect', id: result.sectId },
          resourceTopic: 'sect.infrastructure',
          eventType: 'sect.infrastructure_changed',
          operation: 'replace',
          payload: result.infrastructure,
        },
        {
          scope: { kind: 'sect', id: result.sectId },
          resourceTopic: 'sect.construction-board',
          eventType: 'sect.construction_board_changed',
          operation: 'replace',
          payload: result.board,
        },
        {
          resourceTopic: 'sect.construction-member',
          eventType: 'sect.construction_member_changed',
          operation: 'replace',
          payload: result.member,
        },
        ...effects.resourceChanges,
      ] satisfies ResourceChangeDescriptor[],
    };
  }
}
