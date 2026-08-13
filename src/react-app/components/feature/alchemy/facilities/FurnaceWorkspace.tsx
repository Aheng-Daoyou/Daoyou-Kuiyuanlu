import { AlchemyFacilityWorkspace } from '../AlchemyFacilityWorkspace';
import { AlchemyRitualRail } from '../AlchemyRitualRail';
import { useAlchemyCraftSession } from '../alchemyCraftContext';
import { FurnaceFiringStage } from '../stages/FurnaceFiringStage';
import { FurnaceHarvestStage } from '../stages/FurnaceHarvestStage';
import { FurnaceObservationStage } from '../stages/FurnaceObservationStage';
import { FurnacePreparationStage } from '../stages/FurnacePreparationStage';

export function FurnaceWorkspace({ onBack }: { onBack(): void }) {
  const session = useAlchemyCraftSession();
  const title = session.sectContext?.facilityLabel ?? '玄火丹炉';
  const description = session.sectContext
    ? `宗门炼丹设施 · ${session.sectContext.facilityLevel} 阶；在此选择材料、确认预览并完成炼制。`
    : '可在这里选择材料、查看炼制预览并完成炼制；其他设施均不是必经步骤。';
  return (
    <AlchemyFacilityWorkspace
      sigil="🔥"
      title={title}
      description={description}
      onBack={onBack}
      backDisabled={session.phase === 'firing'}
    >
      <div className="space-y-6">
        {session.note ? (
          <p className="text-ink-secondary text-sm leading-7">{session.note}</p>
        ) : null}
        <AlchemyRitualRail phase={session.phase} />
        {session.phase === 'preparing' ? <FurnacePreparationStage /> : null}
        {session.phase === 'observing' ? <FurnaceObservationStage /> : null}
        {session.phase === 'firing' ? <FurnaceFiringStage /> : null}
        {session.phase === 'result' ? (
          <FurnaceHarvestStage onReturn={onBack} />
        ) : null}
      </div>
    </AlchemyFacilityWorkspace>
  );
}
