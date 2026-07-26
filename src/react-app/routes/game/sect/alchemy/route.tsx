import { AlchemyScene } from '@app/components/feature/craft/AlchemyScene';
import {
  useSectCurrentQuery,
  useSectPresentation,
} from '@app/components/feature/sect/SectQueryProvider';
import {
  SectFacilityWorkspaceConversation,
  SectManagedRoom,
  SectNpcConversationRegistry,
} from '@app/components/feature/sect/room';
import { formatDocumentTitle } from '@app/lib/router/routeTitle';
import { getSectBenefitMetric } from '@app/lib/sect/sectPresentation';
import { useNavigate, useSearchParams } from 'react-router';
import {
  SectPageLoading,
  SectPermissionBoundary,
  SectScene,
} from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  { key: 'sect.alchemy.craft', renderer: SectFacilityWorkspaceConversation },
]);

export default function SectAlchemyPage() {
  return (
    <SectPermissionBoundary
      permission="sect.facility.alchemy.use"
      sceneKey="alchemy"
    >
      <SectAlchemyBody />
    </SectPermissionBoundary>
  );
}

function SectAlchemyBody() {
  const { data } = useSectCurrentQuery();
  const presentation = useSectPresentation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  if (!data) return <SectPageLoading sceneKey="alchemy" />;
  const effect = (data.benefits ?? data.overview?.benefits)?.facilityEffects
    .alchemy;
  const level = getSectBenefitMetric(effect, 'level', 1);
  const discountPercent = getSectBenefitMetric(effect, 'discount') * 100;
  const scene = presentation.scenes.alchemy;
  if (searchParams.get('workspace') === 'craft')
    return (
      <>
        <title>{formatDocumentTitle(scene.title)}</title>
        <AlchemyScene
          sectContext={{
            facilityLevel: level,
            discountPercent,
            facilityLabel:
              presentation.facilityLabels.alchemy ??
              presentation.facilityLabels.workshop,
            scene,
            onExit: () => navigate('/game/sect/alchemy'),
          }}
        />
      </>
    );
  return (
    <SectScene sceneKey="alchemy" mood="alchemy">
      <SectManagedRoom
        roomKey="alchemy"
        registry={registry}
        eyebrow="丹炉火候 · 药柜封签"
      />
    </SectScene>
  );
}
