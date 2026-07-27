import { RetreatView } from '@app/components/feature/retreat/RetreatView';
import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
} from '@app/components/feature/room';
import {
  useSectCurrentQuery,
  useSectPresentation,
} from '@app/components/feature/sect/SectQueryProvider';
import {
  SectNpcConversationRegistry,
  SectRoutedRoom,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { createSectRoomNpcHref } from '@app/components/feature/sect/sectRoomNavigation';
import { formatDocumentTitle } from '@app/lib/router/routeTitle';
import { getSectBenefitMetric } from '@app/lib/sect/sectPresentation';
import {
  describeSectFacilityStatus,
  STANDARD_SECT_PRESENTATION,
} from '@shared/engine/sect';
import { Suspense, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  SectPageLoading,
  SectPermissionBoundary,
  SectScene,
} from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  { key: 'sect.cultivation.retreat', renderer: CultivationConversation },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.cultivation);

export default function SectCultivationRoomPage() {
  return (
    <SectPermissionBoundary
      permission="sect.facility.cultivation.use"
      sceneKey="cultivation"
    >
      <SectCultivationRoomBody />
    </SectPermissionBoundary>
  );
}

function SectCultivationRoomBody() {
  const { data } = useSectCurrentQuery();
  const presentation = useSectPresentation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  if (!data) return <SectPageLoading sceneKey="cultivation" />;
  const effect = (data.benefits ?? data.overview?.benefits)?.facilityEffects
    .cultivation_room;
  const level = getSectBenefitMetric(effect, 'level', 1);
  const experienceBonusPercent =
    getSectBenefitMetric(effect, 'retreat_bonus') * 100;
  const scene = presentation.scenes.cultivation;
  if (searchParams.get('workspace') === 'retreat')
    return (
      <>
        <title>{formatDocumentTitle(scene.title)}</title>
        <Suspense fallback={<SectPageLoading sceneKey="cultivation" />}>
          <RetreatView
            sectContext={{
              facilityLevel: level,
              experienceBonusPercent,
              facilityLabel: presentation.facilityLabels.cultivation_room,
              scene,
              onExit: () =>
                navigate(
                  createSectRoomNpcHref(
                    '/game/sect/cultivation-room',
                    'keeper',
                  ),
                  { replace: true },
                ),
            }}
          />
        </Suspense>
      </>
    );
  return (
    <SectScene sceneKey="cultivation" mood="cultivation">
      <SectRoutedRoom
        roomKey="cultivation"
        registry={registry}
        eyebrow="聚灵阵枢 · 闭关名册"
      />
    </SectScene>
  );
}

function CultivationConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const current = useSectCurrentQuery();
  const presentation = useSectPresentation();
  const navigate = useNavigate();
  const [showStatus, setShowStatus] = useState(false);
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: current.data,
    load: current.reload,
    perform: async () => undefined,
    onReset: () => setShowStatus(false),
  });
  const facility = current.data?.overview?.facilities.find(
    (candidate) => candidate.key === 'cultivation_room',
  );
  const effect = (current.data?.benefits ?? current.data?.overview?.benefits)
    ?.facilityEffects.cultivation_room;
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
  ];
  if (showStatus && facility)
    messages.push({
      id: 'status',
      speaker: actor.name,
      body: describeSectFacilityStatus({
        facilityLabel: presentation.facilityLabels.cultivation_room,
        facility,
        effect,
      })
        .map((segment) => segment.text)
        .join(''),
    });
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={[
        { id: 'status', label: '请执事说说此地阵效' },
        { id: 'workspace', label: '有劳执事为我启阵闭关' },
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ]}
      busy={session.phase === 'loading'}
      error={session.error ?? current.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'status') setShowStatus(true);
        else if (optionId === 'workspace')
          navigate(
            createSectRoomNpcHref(
              '/game/sect/cultivation-room?workspace=retreat',
              actor.roleKey,
            ),
          );
      }}
    />
  );
}
