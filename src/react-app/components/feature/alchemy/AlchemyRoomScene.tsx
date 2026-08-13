import { RoomView, type RoomActorView } from '@app/components/feature/room';
import { GameSceneFrame, GameSceneLoading } from '@app/components/game-shell';
import { useEffect } from 'react';
import { useBlocker, useSearchParams } from 'react-router';
import { AlchemyCraftSessionProvider } from './AlchemyCraftSessionProvider';
import { useAlchemyCraftSession } from './alchemyCraftContext';
import type { AlchemyFacilityId } from './alchemyTypes';
import { AlchemyGuideView } from './facilities/AlchemyGuideView';
import { FormulaArchiveView } from './facilities/FormulaArchiveView';
import { FurnaceWorkspace } from './facilities/FurnaceWorkspace';
import { HerbCabinetView } from './facilities/HerbCabinetView';

const FACILITY_IDS = new Set<AlchemyFacilityId>([
  'furnace',
  'cabinet',
  'formulas',
  'guide',
]);

export function AlchemyRoomScene() {
  return (
    <AlchemyCraftSessionProvider>
      <AlchemyRoomContent />
    </AlchemyCraftSessionProvider>
  );
}

function AlchemyRoomContent() {
  const session = useAlchemyCraftSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const blocker = useBlocker(session.phase === 'firing');
  const rawFacility = searchParams.get('facility');
  const selectedId = FACILITY_IDS.has(rawFacility as AlchemyFacilityId)
    ? (rawFacility as AlchemyFacilityId)
    : undefined;

  useEffect(() => {
    if (!rawFacility || selectedId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('facility');
    setSearchParams(next, { replace: true });
  }, [rawFacility, searchParams, selectedId, setSearchParams]);

  const blockerState = blocker.state;
  const resetBlockedNavigation =
    blocker.state === 'blocked' ? blocker.reset : undefined;
  useEffect(() => {
    if (blockerState === 'blocked') resetBlockedNavigation?.();
  }, [blockerState, resetBlockedNavigation]);

  if (session.loading && !session.cultivator)
    return <GameSceneLoading message="丹房禁制正在辨认来者……" />;

  const open = (id: AlchemyFacilityId) => {
    const next = new URLSearchParams(searchParams);
    next.set('facility', id);
    setSearchParams(next);
  };
  const back = () => {
    if (session.phase === 'firing') return;
    const next = new URLSearchParams(searchParams);
    next.delete('facility');
    setSearchParams(next);
  };
  const actors: RoomActorView[] = [
    {
      id: 'furnace',
      sigil: '鼎',
      name: '玄火丹炉',
      identity: '核心炼丹设施',
      responsibility: '配炉、观火、引火、开鼎',
      appearance: 'facility',
      status: {
        label: furnaceStatus(session),
        tone:
          session.phase === 'result'
            ? 'attention'
            : session.materials.ids.length || session.formula || session.intent
              ? 'active'
              : 'neutral',
      },
    },
    {
      id: 'cabinet',
      sigil: '草',
      name: '百草药柜',
      identity: '材料设施',
      responsibility: '浏览、辨认与查看炼丹灵材',
      appearance: 'facility',
      status: { label: '库存可查', tone: 'neutral' },
    },
    {
      id: 'formulas',
      sigil: '简',
      name: '丹方玉简',
      identity: '丹方设施',
      responsibility: '查阅、筛选与管理已有丹方',
      appearance: 'facility',
      status: { label: '玉简可阅', tone: 'neutral' },
    },
    {
      id: 'guide',
      sigil: '理',
      name: '炉理碑',
      identity: '指引设施',
      responsibility: '阅读炼丹规则与第一炉建议',
      appearance: 'facility',
      status: {
        label: session.starterTask ? '初次可先阅读' : '碑文可阅',
        tone: session.starterTask ? 'attention' : 'neutral',
      },
    },
  ];

  return (
    <GameSceneFrame
      title="【炼丹房】"
      description="丹炉负责完整炼制；药柜、丹方玉简与炉理碑各守一职，可按需使用。"
    >
      <RoomView
        eyebrow="丹火沉静 · 四处设施各司其职"
        description="中央玄火丹炉可独立完成一整炉炼制。沿墙药柜供辨材，玉简供理方，炉理碑只记述炼丹之理。"
        actors={actors}
        selectedId={selectedId}
        onSelect={(id) => open(id as AlchemyFacilityId)}
        prompt="选择一处设施"
        promptDetail="若要直接炼丹，只需走近玄火丹炉。"
        detail={
          selectedId === 'furnace' ? (
            <FurnaceWorkspace onBack={back} />
          ) : selectedId === 'cabinet' ? (
            <HerbCabinetView
              onBack={back}
              onOpenFurnace={() => open('furnace')}
            />
          ) : selectedId === 'formulas' ? (
            <FormulaArchiveView
              onBack={back}
              onOpenFurnace={() => open('furnace')}
            />
          ) : selectedId === 'guide' ? (
            <AlchemyGuideView
              starterTask={session.starterTask}
              onBack={back}
              onOpenFurnace={() => open('furnace')}
            />
          ) : undefined
        }
      />
    </GameSceneFrame>
  );
}

function furnaceStatus(
  session: ReturnType<typeof useAlchemyCraftSession>,
): string {
  if (session.phase === 'firing') return '地火正盛';
  if (session.phase === 'result') return '丹成待收';
  if (session.phase === 'observing') return '火候已显';
  if (session.readyForObservation) return '可观火';
  if (session.materials.ids.length || session.formula || session.intent.trim())
    return '配炉中';
  return '空炉待启';
}
