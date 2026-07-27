import {
  SectFacilityStatusConversation,
  SectNpcConversationRegistry,
  SectRoutedRoom,
} from '@app/components/feature/sect/room';
import { STANDARD_SECT_PRESENTATION } from '@shared/engine/sect';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  {
    key: 'sect.spirit-vein.status',
    renderer: SectFacilityStatusConversation,
  },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.spiritVein);

export default function SectSpiritVeinPage() {
  return (
    <SectPermissionBoundary
      permission="sect.spirit_vein.view"
      sceneKey="spiritVein"
    >
      <SectScene sceneKey="spiritVein" mood="vein">
        <SectRoutedRoom
          roomKey="spiritVein"
          registry={registry}
          eyebrow="矿场井口 · 脉息封签"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}
