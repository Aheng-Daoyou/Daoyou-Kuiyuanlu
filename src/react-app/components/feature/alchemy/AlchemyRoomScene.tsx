import {
  NpcConversation,
  RoomView,
  type NpcConversationActor,
  type RoomActorView,
} from '@app/components/feature/room';
import { GameSceneFrame } from '@app/components/game-shell';
import { useState } from 'react';
import { AlchemyScene } from '../craft/AlchemyScene';

const ROOM_ACTORS: readonly RoomActorView[] = [
  {
    id: 'furnace',
    sigil: '鼎',
    name: '玄火丹炉',
    identity: '炼丹设施',
    responsibility: '纳药、引火、聚蕴、凝丹',
    appearance: 'facility',
    status: { label: '炉火沉眠', tone: 'active' },
  },
  {
    id: 'cabinet',
    sigil: '草',
    name: '百草药柜',
    identity: '炉材设施',
    responsibility: '按药性收纳可用灵材',
    appearance: 'facility',
    status: { label: '封签完整', tone: 'neutral' },
  },
  {
    id: 'formulas',
    sigil: '简',
    name: '丹方玉简',
    identity: '传承设施',
    responsibility: '留存丹方与熟练心得',
    appearance: 'facility',
    status: { label: '灵光内敛', tone: 'neutral' },
  },
  {
    id: 'guide',
    sigil: '理',
    name: '炉理碑',
    identity: '指引设施',
    responsibility: '记述投药、观火与收丹之理',
    appearance: 'facility',
    status: { label: '碑文可读', tone: 'neutral' },
  },
];

const FACILITY_ACTORS: Record<string, NpcConversationActor> =
  Object.fromEntries(ROOM_ACTORS.map((actor) => [actor.id, actor]));

export function AlchemyRoomScene() {
  const [selectedId, setSelectedId] = useState<string>();
  const selectedActor = selectedId ? FACILITY_ACTORS[selectedId] : undefined;

  return (
    <GameSceneFrame
      title="【炼丹房】"
      description="炉火、药柜与丹方各守其位。先走近一处设施，再决定这一炉如何起手。"
    >
      <RoomView
        eyebrow="丹火沉静 · 草木余香"
        description="室内中央立着一尊玄火丹炉，百草药柜沿墙封存，丹方玉简与炉理碑分列炉侧。"
        actors={ROOM_ACTORS}
        selectedId={selectedId}
        onSelect={setSelectedId}
        prompt="点击设施，查看详情"
        promptDetail="炼丹的全部操作都会围绕玄火丹炉展开。"
        detail={
          selectedActor ? (
            selectedId === 'furnace' ? (
              <AlchemyScene onExit={() => setSelectedId(undefined)} />
            ) : (
              <FacilityConversation
                actor={selectedActor}
                kind={selectedId ?? ''}
                onExit={() => setSelectedId(undefined)}
                onOpenFurnace={() => setSelectedId('furnace')}
              />
            )
          ) : undefined
        }
      />
    </GameSceneFrame>
  );
}

function FacilityConversation({
  actor,
  kind,
  onExit,
  onOpenFurnace,
}: {
  actor: NpcConversationActor;
  kind: string;
  onExit(): void;
  onOpenFurnace(): void;
}) {
  const body =
    kind === 'cabinet'
      ? '柜门上的封签按药性依次排列。真正投药时，丹炉会从这里展开可用灵材。'
      : kind === 'formulas'
        ? '玉简中留着已经悟得的丹方与熟练心得。依方起炉时，可在丹炉前直接取用。'
        : '碑文没有列出繁复算式，只反复强调三件事：投药要有主路，观火要辨风险，开炉前要核清代价。';
  return (
    <NpcConversation
      actor={actor}
      messages={[{ id: 'facility', body }]}
      options={[
        { id: 'furnace', label: '回到玄火丹炉', tone: 'primary' },
        { id: 'leave', label: '返回炼丹房', tone: 'muted' },
      ]}
      onSelectOption={(optionId) => {
        if (optionId === 'furnace') onOpenFurnace();
        else onExit();
      }}
    />
  );
}
