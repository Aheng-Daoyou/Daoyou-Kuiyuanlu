import { InkButton, InkNotice } from '@app/components/ui';
import { AlchemyFacilityWorkspace } from '../AlchemyFacilityWorkspace';

const SECTIONS = [
  {
    title: '初识炼丹',
    body: '一炉炼丹只需在丹炉内完成配炉、观火与开鼎。药柜、玉简和炉理碑都是可选的辅助设施。',
  },
  {
    title: '随心炼丹',
    body: '投入灵材并写下一句明确丹意，炉火会根据材料药性与意图自行凝成丹形，也可能由此悟得新方。',
  },
  {
    title: '丹方炼制',
    body: '选择已留存丹方后再安排炉材。观火时玉简投影会判断配伍是契合、勉强还是偏路。',
  },
  {
    title: '药蕴与批次',
    body: '材料数量与品质汇成药蕴。药蕴会分结成主丹和副丹，同一炉可能出现多个品质与品相批次。',
  },
  {
    title: '品质与品相',
    body: '品质代表丹药层次，品相代表同品质下的成丹完整程度。观火只能看见倾向，开鼎时结果才最终落定。',
  },
  {
    title: '丹毒与炉况',
    body: '燥烈、冲突或过杂的配伍会提高损耗与风险。观火阶段会列出阻断原因和需要留意的炉况。',
  },
  {
    title: '常见失败原因',
    body: '材料不足、灵石不足、丹意为空、未选择丹方、配伍变化或分析过期，都会阻止引火；返回配炉调整即可。',
  },
] as const;

export function AlchemyGuideView({
  starterTask,
  onBack,
  onOpenFurnace,
}: {
  starterTask: boolean;
  onBack(): void;
  onOpenFurnace(): void;
}) {
  return (
    <AlchemyFacilityWorkspace
      sigil="理"
      title="炉理碑"
      description="碑文只记述炼丹之理，不替玩家改变本炉配伍或炼制方式。"
      onBack={onBack}
    >
      <div className="space-y-6">
        {starterTask ? (
          <InkNotice tone="info">
            <div className="space-y-2">
              <p className="font-medium">第一炉建议</p>
              <p className="text-sm leading-7">
                先取一至两味凡品灵草，各投入一份；选择随心炼丹，并写下“疗伤回元，药性温和”。第一炉只需看懂观火与批次结果。
              </p>
            </div>
          </InkNotice>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {SECTIONS.map((section) => (
            <section key={section.title} className="border-ink/15 border p-5">
              <h3 className="text-base font-medium">{section.title}</h3>
              <p className="text-ink-secondary mt-2 text-sm leading-7">
                {section.body}
              </p>
            </section>
          ))}
        </div>
        <div className="flex justify-end">
          <InkButton variant="primary" onClick={onOpenFurnace}>
            前往丹炉实践
          </InkButton>
        </div>
      </div>
    </AlchemyFacilityWorkspace>
  );
}
