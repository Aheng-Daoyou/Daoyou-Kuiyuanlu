import { RefineScene } from '@app/components/feature/craft/RefineScene';
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
  { key: 'sect.refinery.craft', renderer: SectFacilityWorkspaceConversation },
]);

export default function SectRefineryPage() {
  return (
    <SectPermissionBoundary
      permission="sect.facility.refinery.use"
      sceneKey="refinery"
    >
      <SectRefineryBody />
    </SectPermissionBoundary>
  );
}

function SectRefineryBody() {
  const { data } = useSectCurrentQuery();
  const presentation = useSectPresentation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  if (!data) return <SectPageLoading sceneKey="refinery" />;
  const effect = (data.benefits ?? data.overview?.benefits)?.facilityEffects
    .refinery;
  const level = getSectBenefitMetric(effect, 'level', 1);
  const discountPercent = getSectBenefitMetric(effect, 'discount') * 100;
  const scene = presentation.scenes.refinery;
  if (searchParams.get('workspace') === 'craft')
    return (
      <>
        <title>{formatDocumentTitle(scene.title)}</title>
        <RefineScene
          sectContext={{
            facilityLevel: level,
            discountPercent,
            facilityLabel:
              presentation.facilityLabels.refinery ??
              presentation.facilityLabels.workshop,
            scene,
            onExit: () => navigate('/game/sect/refinery'),
          }}
        />
      </>
    );
  return (
    <SectScene sceneKey="refinery" mood="refinery">
      <SectManagedRoom
        roomKey="refinery"
        registry={registry}
        eyebrow="地火炉道 · 锻台封签"
      />
    </SectScene>
  );
}
