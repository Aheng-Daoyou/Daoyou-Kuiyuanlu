import {
  SectFacilityStatusConversation,
  SectNpcConversationRegistry,
  SectRoutedRoom,
} from '@app/components/feature/sect/room';
import { STANDARD_SECT_PRESENTATION } from '@shared/engine/sect';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  {
    key: 'sect.herb-garden.status',
    renderer: SectFacilityStatusConversation,
  },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.herbGarden);

export default function SectHerbGardenPage() {
  return (
    <SectPermissionBoundary
      permission="sect.herb_garden.view"
      sceneKey="herbGarden"
    >
      <SectScene sceneKey="herbGarden" mood="garden">
        <SectRoutedRoom
          roomKey="herbGarden"
          registry={registry}
          eyebrow="药畦晨露 · 草木值录"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}
