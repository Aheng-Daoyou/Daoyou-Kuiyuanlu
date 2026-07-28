import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
  type NpcConversationOption,
} from '@app/components/feature/room';
import {
  SectNpcConversationRegistry,
  SectRoutedRoom,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import {
  getSectPresentationForContext,
  useSectConstructionBoardQuery,
  useSectConstructionMemberQuery,
  useSectContextQuery,
  useSectInfrastructureQuery,
} from '@app/components/feature/sect/sectResources';
import { InkButton, InkSelect } from '@app/components/ui';
import {
  inventoryArtifactsResource,
  inventoryConsumablesResource,
  inventoryMaterialsResource,
} from '@app/lib/resources/definitions';
import { useResource } from '@app/lib/resources/hooks';
import { useResourceMutation } from '@app/lib/resources/mutations';
import type {
  SectConstructionBoardData,
  SectConstructionMemberData,
  SectDonationDemandData,
  SectInfrastructureData,
} from '@shared/contracts/sect';
import {
  ArtifactDeliverySpecification,
  describeSectConstructionProject,
  MaterialDeliverySpecification,
  PillDeliverySpecification,
  STANDARD_SECT_PRESENTATION,
} from '@shared/engine/sect';
import { QUALITY_ORDER, type Quality } from '@shared/types/constants';
import type { Artifact, Consumable, Material } from '@shared/types/cultivator';
import { useMemo, useState } from 'react';
import {
  postJson,
  SectPermissionBoundary,
  SectScene,
} from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  {
    key: 'sect.industries.construction',
    renderer: ConstructionConversation,
  },
  { key: 'sect.industries.donation', renderer: DonationConversation },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.industries);

export default function SectIndustriesPage() {
  return (
    <SectPermissionBoundary
      permission="sect.construction.view"
      sceneKey="industries"
    >
      <SectScene sceneKey="industries" mood="industries">
        <SectRoutedRoom
          roomKey="industries"
          registry={registry}
          eyebrow="公共工程 · 物料功簿"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

function ConstructionConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const context = useSectContextQuery();
  const infrastructure = useSectInfrastructureQuery();
  const board = useSectConstructionBoardQuery();
  const member = useSectConstructionMemberQuery();
  const presentation = getSectPresentationForContext(context.data);
  const [topic, setTopic] = useState<'project' | 'facilities' | 'activity'>();
  const data = useMemo(
    () =>
      infrastructure.data && board.data && member.data
        ? {
            ...infrastructure.data,
            ...board.data,
            ...member.data,
          }
        : undefined,
    [board.data, infrastructure.data, member.data],
  );
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: data,
    perform: async () => undefined,
    onReset: () => setTopic(undefined),
  });
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
  ];
  if (topic === 'project' && data) {
    const segments = describeSectConstructionProject({
      project: data.project,
      facilityLabel: data.project
        ? presentation.facilityLabels[data.project.facilityKey]
        : undefined,
    });
    messages.push({
      id: 'project',
      speaker: actor.name,
      body: (
        <>
          {segments.map((segment, index) => (
            <span
              key={`${index}:${segment.text}`}
              className={
                segment.emphasis ? 'text-crimson font-medium' : undefined
              }
            >
              {segment.text}
            </span>
          ))}
        </>
      ),
    });
  }
  if (topic === 'facilities' && data)
    messages.push({
      id: 'facilities',
      speaker: actor.name,
      body: data.facilities
        .filter(
          (facility) => !presentation.lockedFacilities.includes(facility.key),
        )
        .map(
          (facility) =>
            `${presentation.facilityLabels[facility.key] ?? '未命名设施'}${facility.level}级`,
        )
        .join('，')
        .concat('。'),
    });
  if (topic === 'activity' && data)
    messages.push({
      id: 'activity',
      speaker: actor.name,
      body: data.recentActivity.length
        ? data.recentActivity
            .slice(0, 5)
            .map(
              (item) =>
                `${item.memberName}完成一笔建设捐献，工程增加${item.constructionPoints}点`,
            )
            .join('；')
            .concat('。')
        : '近期尚无建设捐献入册。',
    });
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={[
        { id: 'project', label: '请说说本周工程' },
        { id: 'facilities', label: '请替我查查各处设施' },
        { id: 'activity', label: '最近有哪些同门参与建设' },
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ]}
      busy={session.phase === 'loading'}
      error={
        session.error ?? infrastructure.error ?? board.error ?? member.error
      }
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (
          optionId === 'project' ||
          optionId === 'facilities' ||
          optionId === 'activity'
        )
          setTopic(optionId);
      }}
    />
  );
}

type DonationIntent = { demandId: string; itemId?: string };

function DonationConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const infrastructure = useSectInfrastructureQuery();
  const board = useSectConstructionBoardQuery();
  const member = useSectConstructionMemberQuery();
  const { mutate } = useResourceMutation();
  const [selectedDemandId, setSelectedDemandId] = useState<string>();
  const [materialPage, setMaterialPage] = useState(1);
  const [consumablePage, setConsumablePage] = useState(1);
  const [artifactPage, setArtifactPage] = useState(1);
  const construction = useMemo(
    () =>
      infrastructure.data && board.data && member.data
        ? {
            ...infrastructure.data,
            ...board.data,
            ...member.data,
          }
        : undefined,
    [board.data, infrastructure.data, member.data],
  );
  const constructionError = infrastructure.error ?? board.error ?? member.error;
  const demand = construction?.demands.find(
    (candidate) => candidate.id === selectedDemandId,
  );
  const pageSize = 20;
  const materialParams = useMemo(
    () => ({ page: materialPage, pageSize }),
    [materialPage],
  );
  const consumableParams = useMemo(
    () => ({ page: consumablePage, pageSize }),
    [consumablePage],
  );
  const artifactParams = useMemo(
    () => ({ page: artifactPage, pageSize }),
    [artifactPage],
  );
  const materials = useResource(
    inventoryMaterialsResource,
    materialParams,
    demand?.kind === 'sect.donation.material',
  );
  const consumables = useResource(
    inventoryConsumablesResource,
    consumableParams,
    demand?.kind === 'sect.donation.pill',
  );
  const artifacts = useResource(
    inventoryArtifactsResource,
    artifactParams,
    demand?.kind === 'sect.donation.artifact',
  );
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: construction,
    perform: async ({ intent }: { intent: DonationIntent }) => {
      const demand = construction?.demands.find(
        (candidate) => candidate.id === intent.demandId,
      );
      if (!demand) throw new Error('这项物料需求已经变更。');
      await mutate(
        fetch(
          '/api/sects/current/construction/donate',
          postJson({
            demandId: demand.id,
            itemId: intent.itemId,
            quantity: 1,
          }),
        ),
      );
      return demand.name;
    },
    onReset: () => setSelectedDemandId(undefined),
  });
  const activeInventory =
    demand?.kind === 'sect.donation.material'
      ? materials
      : demand?.kind === 'sect.donation.pill'
        ? consumables
        : demand?.kind === 'sect.donation.artifact'
          ? artifacts
          : undefined;
  const candidates = demand
    ? donationCandidates(demand, activeInventory?.data?.items ?? [])
    : [];
  const needsItem =
    Boolean(demand) && demand?.kind !== 'sect.donation.spirit-stones';

  if (demand && needsItem)
    return (
      <DonationWorkspace
        demand={demand}
        candidates={candidates}
        quotaAvailable={
          construction !== undefined &&
          construction.dailyContributionCap -
            construction.donatedContributionToday >=
            demand.contribution
        }
        busy={session.phase === 'submitting'}
        loading={activeInventory?.loading ?? false}
        error={session.error ?? activeInventory?.error ?? constructionError}
        pagination={activeInventory?.data?.pagination}
        onPageChange={(page) => {
          if (demand.kind === 'sect.donation.material') setMaterialPage(page);
          else if (demand.kind === 'sect.donation.pill')
            setConsumablePage(page);
          else if (demand.kind === 'sect.donation.artifact')
            setArtifactPage(page);
        }}
        onBack={() => {
          session.clearResult();
          setSelectedDemandId(undefined);
          void session.reload();
        }}
        onSubmit={async (itemId) => {
          const result = await session.dispatch({
            demandId: demand.id,
            itemId,
          });
          if (result) setSelectedDemandId(undefined);
        }}
      />
    );

  const messages = donationMessages(
    actor.name,
    actor.greeting,
    construction,
    demand,
    session.result,
  );
  const options = donationOptions(construction, demand);
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={options}
      busy={session.phase === 'loading' || session.phase === 'submitting'}
      error={session.error ?? constructionError}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'back') {
          session.clearResult();
          setSelectedDemandId(undefined);
        } else if (optionId === 'confirm' && demand)
          void session
            .dispatch({ demandId: demand.id })
            .then((result) => result && setSelectedDemandId(undefined));
        else if (optionId.startsWith('demand:')) {
          setSelectedDemandId(optionId.slice(7));
        }
      }}
    />
  );
}

interface DonationCandidate {
  id: string;
  label: string;
  name: string;
  quality: Quality;
  submittedQuantity: number;
  unit: string;
  exceedsMinimumQuality: boolean;
}

const materialDonationSpecification = new MaterialDeliverySpecification();
const pillDonationSpecification = new PillDeliverySpecification();
const artifactDonationSpecification = new ArtifactDeliverySpecification();

function qualityExceedsMinimum(
  quality: Quality,
  minimum: string | undefined,
): boolean {
  return (
    QUALITY_ORDER[quality] >
    (QUALITY_ORDER[minimum as Quality] ?? QUALITY_ORDER.凡品)
  );
}

function donationCandidates(
  demand: SectDonationDemandData,
  items: readonly (Artifact | Material | Consumable)[],
): DonationCandidate[] {
  const minimumQuality = (demand.minQuality ?? '凡品') as Quality;
  if (demand.kind === 'sect.donation.material') {
    return items
      .filter(
        (item): item is Material & { id: string } =>
          Boolean(item.id) &&
          'rank' in item &&
          item.type === 'herb' &&
          materialDonationSpecification.violations(item, {
            quantity: demand.quantity,
            minQuality: minimumQuality,
          }).length === 0,
      )
      .map((item) => ({
        id: item.id,
        label: `${item.name}，${item.rank}，现有${item.quantity}份`,
        name: item.name,
        quality: item.rank,
        submittedQuantity: demand.quantity,
        unit: '份',
        exceedsMinimumQuality: qualityExceedsMinimum(
          item.rank,
          demand.minQuality,
        ),
      }));
  }
  if (demand.kind === 'sect.donation.pill') {
    return items
      .filter(
        (item): item is Consumable & { id: string; quality: Quality } =>
          Boolean(item.id) &&
          'spec' in item &&
          Boolean(item.quality) &&
          pillDonationSpecification.violations(
            { ...item, quality: item.quality ?? '' },
            {
              quantity: demand.quantity,
              minQuality: minimumQuality,
              pillFamily: demand.pillFamily,
            },
          ).length === 0,
      )
      .map((item) => ({
        id: item.id,
        label: `${item.name}，${item.quality}，现有${item.quantity}枚`,
        name: item.name,
        quality: item.quality,
        submittedQuantity: demand.quantity,
        unit: '枚',
        exceedsMinimumQuality: qualityExceedsMinimum(
          item.quality,
          demand.minQuality,
        ),
      }));
  }
  if (demand.kind === 'sect.donation.artifact') {
    return items
      .filter(
        (item): item is Artifact & { id: string; quality: Quality } =>
          Boolean(item.id) &&
          'slot' in item &&
          Boolean(item.quality) &&
          artifactDonationSpecification.violations(
            {
              quality: item.quality ?? '',
              isEquipped: Boolean(item.isEquipped),
            },
            {
              quantity: demand.quantity,
              minQuality: minimumQuality,
            },
          ).length === 0,
      )
      .map((item) => ({
        id: item.id,
        label: `${item.name}，${item.quality}`,
        name: item.name,
        quality: item.quality,
        submittedQuantity: demand.quantity,
        unit: '件',
        exceedsMinimumQuality: qualityExceedsMinimum(
          item.quality,
          demand.minQuality,
        ),
      }));
  }
  return [];
}

type SectConstructionViewData = SectInfrastructureData &
  SectConstructionBoardData &
  SectConstructionMemberData;

function donationMessages(
  actorName: string,
  greeting: string,
  data: SectConstructionViewData | undefined,
  demand: SectDonationDemandData | undefined,
  result: string | undefined,
): NpcConversationMessage[] {
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actorName, body: greeting },
  ];
  if (data)
    messages.push({
      id: 'quota',
      speaker: actorName,
      body: `今日已经记入${data.donatedContributionToday}点建设贡献，上限是${data.dailyContributionCap}点。`,
    });
  if (result)
    messages.push({
      id: 'result',
      speaker: actorName,
      body: `「${result}」已经验明入册，个人贡献与建设点都已记下。`,
      tone: 'attention',
    });
  if (demand)
    messages.push({
      id: 'demand',
      speaker: actorName,
      body: `${demand.description}。验明后可得${demand.contribution}点贡献，并为工程增加${demand.constructionPoints}点。`,
    });
  return messages;
}

function donationOptions(
  data: SectConstructionViewData | undefined,
  demand: SectDonationDemandData | undefined,
): NpcConversationOption[] {
  if (!demand)
    return [
      ...(data?.demands.map((item) => ({
        id: `demand:${item.id}`,
        label: `我想捐献${item.name}`,
      })) ?? []),
      { id: 'leave', label: '弟子告退', tone: 'muted' },
    ];
  return [
    {
      id: 'confirm',
      label: '核对无误，就捐这一份',
      tone: 'primary',
      disabled:
        !data ||
        data.dailyContributionCap - data.donatedContributionToday <
          demand.contribution,
    },
    { id: 'back', label: '我再想想' },
    { id: 'leave', label: '弟子告退', tone: 'muted' },
  ];
}

function DonationWorkspace({
  demand,
  candidates,
  quotaAvailable,
  busy,
  loading,
  error,
  pagination,
  onPageChange,
  onBack,
  onSubmit,
}: {
  demand: SectDonationDemandData;
  candidates: readonly DonationCandidate[];
  quotaAvailable: boolean;
  busy: boolean;
  loading: boolean;
  error?: string;
  pagination?: {
    page: number;
    totalPages: number;
    hasMore: boolean;
  };
  onPageChange(page: number): void;
  onBack(): void;
  onSubmit(itemId: string): Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const selected = candidates.find((candidate) => candidate.id === selectedId);

  return (
    <div className="min-h-[34rem] px-5 py-7 sm:px-8 md:px-10">
      <div className="flex items-start justify-between gap-4 border-b border-current/10 pb-4">
        <div>
          <p className="text-ink-secondary text-xs tracking-[0.24em]">
            建设物料核验
          </p>
          <p className="mt-2 text-sm leading-7">{demand.description}</p>
        </div>
        <InkButton onClick={onBack} disabled={busy}>
          返回物料执事
        </InkButton>
      </div>

      <div className="mx-auto mt-8 max-w-xl space-y-5">
        <InkSelect
          label="选择移交物品"
          value={selectedId}
          onChange={(itemId) => {
            setSelectedId(itemId);
            setConfirming(false);
          }}
          disabled={busy}
        >
          <option value="">请选择符合要求的物品</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </InkSelect>

        {!loading && !candidates.length ? (
          <p className="text-crimson text-sm">背包中没有符合这项需求的物品。</p>
        ) : null}
        {loading ? (
          <p className="text-ink-secondary text-sm">正在翻检当前页背包……</p>
        ) : null}
        {!quotaAvailable ? (
          <p className="text-crimson text-sm">
            今日剩余建设贡献额度不足，无法再登记这笔捐献。
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-crimson text-sm">
            {error}
          </p>
        ) : null}

        {selected && confirming ? (
          <div className="border-crimson/25 bg-crimson/5 border-l-2 px-4 py-3 text-sm leading-7">
            <p>
              将永久移交「{selected.name}」{selected.submittedQuantity}
              {selected.unit}，交付后无法取回。
            </p>
            {selected.exceedsMinimumQuality ? (
              <p className="text-crimson">
                此物为{selected.quality}
                ，高于需求的最低品质，请确认没有误选。
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {confirming && selected ? (
            <>
              <InkButton
                variant="primary"
                disabled={busy || !quotaAvailable}
                onClick={() => void onSubmit(selected.id)}
              >
                核对无误，确认移交
              </InkButton>
              <InkButton disabled={busy} onClick={() => setConfirming(false)}>
                重新选择
              </InkButton>
            </>
          ) : (
            <InkButton
              variant="primary"
              disabled={!selected || busy || !quotaAvailable}
              onClick={() => setConfirming(true)}
            >
              核对交付
            </InkButton>
          )}
        </div>
        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <InkButton
              disabled={busy || loading || pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              上一页
            </InkButton>
            <span>
              第 {pagination.page} / {pagination.totalPages} 页
            </span>
            <InkButton
              disabled={busy || loading || !pagination.hasMore}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              下一页
            </InkButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
