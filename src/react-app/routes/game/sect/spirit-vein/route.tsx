import {
  SectFacilityStatusConversation,
  SectManagedRoom,
  SectNpcConversationRegistry,
} from '@app/components/feature/sect/room';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  {
    key: 'sect.spirit-vein.status',
    renderer: SectFacilityStatusConversation,
  },
]);

export default function SectSpiritVeinPage() {
  return (
    <SectPermissionBoundary
      permission="sect.spirit_vein.view"
      sceneKey="spiritVein"
    >
      <SectScene sceneKey="spiritVein" mood="vein">
        <SectManagedRoom
          roomKey="spiritVein"
          registry={registry}
          eyebrow="矿场井口 · 脉息封签"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}
