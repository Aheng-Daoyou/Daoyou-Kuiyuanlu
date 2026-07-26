import {
  SectFacilityStatusConversation,
  SectManagedRoom,
  SectNpcConversationRegistry,
} from '@app/components/feature/sect/room';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  {
    key: 'sect.herb-garden.status',
    renderer: SectFacilityStatusConversation,
  },
]);

export default function SectHerbGardenPage() {
  return (
    <SectPermissionBoundary
      permission="sect.herb_garden.view"
      sceneKey="herbGarden"
    >
      <SectScene sceneKey="herbGarden" mood="garden">
        <SectManagedRoom
          roomKey="herbGarden"
          registry={registry}
          eyebrow="药畦晨露 · 草木值录"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}
