import { useInkUI } from '@app/components/providers/InkUIProvider';
import type { Material } from '@shared/types/cultivator';
import { AlchemyFacilityWorkspace } from '../AlchemyFacilityWorkspace';
import { useAlchemyCraftSession } from '../alchemyCraftContext';
import { AlchemyMaterialShelf } from './AlchemyMaterialShelf';

export function HerbCabinetView({
  onBack,
  onOpenFurnace,
}: {
  onBack(): void;
  onOpenFurnace(): void;
}) {
  const session = useAlchemyCraftSession();
  const { pushToast } = useInkUI();
  const carry = (material: Material) => {
    const outcome = session.addMaterialToFurnace(material);
    if (outcome === 'limit-reached') {
      pushToast({
        message: '本炉材料种类已满，请先到丹炉调整。',
        tone: 'warning',
      });
      return;
    }
    pushToast({
      message:
        outcome === 'already-added'
          ? `【${material.name}】已在炉中，原有剂量保持不变。`
          : `已将【${material.name}】带至丹炉。`,
      tone: 'success',
    });
    onOpenFurnace();
  };
  return (
    <AlchemyFacilityWorkspace
      sigil="草"
      title="百草药柜"
      description="辨认和查看已有灵材；真正的配伍与剂量调整在丹炉内完成。"
      onBack={onBack}
    >
      <AlchemyMaterialShelf
        cultivatorId={session.cultivator?.id}
        onCarry={carry}
      />
    </AlchemyFacilityWorkspace>
  );
}
