import { GameSceneAsideSection, GameSceneFrame } from '@app/components/game-shell';
import {
  CODEX_AUCTION_RULES,
  CODEX_BREAKTHROUGH_RULES,
  CODEX_CURRENCIES,
  CODEX_QUALITIES,
  CODEX_QUALITY_CAP_MAP,
  CODEX_REALMS,
  CODEX_REALM_STAGES,
  CODEX_SECTS,
  CODEX_SKILL_GRADES,
  CODEX_SKILL_TIER_NOTES,
  CODEX_TAX_TABLE,
  CODEX_VAULT_RULES,
} from '@shared/lib/game/kuiyuanluCodex';
import { useState } from 'react';

const SECTIONS = [
  { key: 'realms', label: '九境' },
  { key: 'qualities', label: '品相' },
  { key: 'skills', label: '功法' },
  { key: 'sects', label: '门派' },
  { key: 'currencies', label: '资财' },
  { key: 'rules', label: '交易规矩' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

function formatCap(cap: number | undefined): string {
  if (!cap) return '—';
  return cap >= 10_000 ? `${cap / 10_000} 万` : `${cap}`;
}

export default function CodexPage() {
  const [active, setActive] = useState<SectionKey>('realms');

  return (
    <GameSceneFrame
      title="烬洲志"
      description="灯途指要：九境、品相、功法、门派与交易规矩，皆录于此卷。"
      aside={
        <>
          <GameSceneAsideSection title="本卷条目">
            <div className="flex flex-wrap gap-1.5">
              {SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={
                    active === section.key
                      ? 'bg-crimson text-bgpaper rounded px-2.5 py-1 text-sm font-bold'
                      : 'border-ink/20 text-ink hover:border-crimson/60 hover:text-crimson rounded border px-2.5 py-1 text-sm transition-colors'
                  }
                >
                  {section.label}
                </button>
              ))}
            </div>
          </GameSceneAsideSection>
          <GameSceneAsideSection title="凡例">
            <div className="text-ink-secondary space-y-2 text-sm leading-7">
              <p>数值与规则直取引擎所载，与游戏运行时一致。</p>
              <p>卷中未尽之事，以渊为准。</p>
            </div>
          </GameSceneAsideSection>
        </>
      }
    >
      {active === 'realms' && (
        <div className="space-y-5">
          <section>
            <h3 className="text-ink mb-2 text-lg font-bold">九境 · 闻腥至渡渊</h3>
            <div className="space-y-2.5">
              {CODEX_REALMS.map((realm, index) => (
                <div
                  key={realm.name}
                  className="border-ink/15 bg-background/60 flex gap-3 rounded border p-3"
                >
                  <div className="text-crimson w-14 shrink-0 text-center">
                    <div className="text-base font-bold">{realm.name}</div>
                    <div className="text-ink-secondary text-[11px]">
                      第{index + 1}境
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-ink text-sm font-bold">{realm.title}</div>
                    <p className="text-ink-secondary mt-1 text-sm leading-6">
                      {realm.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-ink-secondary mt-3 text-sm">
              每境又分{CODEX_REALM_STAGES.join('、')}四阶，依次递进。
            </p>
          </section>
          <section className="border-crimson/25 bg-crimson/5 rounded border p-4">
            <h4 className="text-crimson mb-2 text-sm font-bold">点灯问渊 · 突破规矩</h4>
            <ul className="text-ink-secondary space-y-1.5 text-sm leading-6">
              {CODEX_BREAKTHROUGH_RULES.map((rule) => (
                <li key={rule}>· {rule}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {active === 'qualities' && (
        <div className="space-y-2.5">
          <h3 className="text-ink text-lg font-bold">品相八阶 · 凡品至神品</h3>
          {CODEX_QUALITIES.map((quality) => {
            const cap = CODEX_QUALITY_CAP_MAP[quality.name];
            return (
              <div
                key={quality.name}
                className="border-ink/15 bg-background/60 flex items-baseline gap-3 rounded border p-3"
              >
                <span className="text-crimson w-12 shrink-0 font-bold">
                  {quality.name}
                </span>
                <p className="text-ink-secondary flex-1 text-sm leading-6">
                  {quality.description}
                </p>
                <span className="text-ink-secondary shrink-0 text-xs">
                  {cap
                    ? `寄售单价上限 ${formatCap(cap)} 灯油券`
                    : '鬼市不可寄售'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {active === 'skills' && (
        <div className="space-y-5">
          <h3 className="text-ink text-lg font-bold">功法十二品阶</h3>
          {(['天阶', '地阶', '玄阶', '黄阶'] as const).map((tier) => (
            <section key={tier}>
              <div className="flex items-baseline gap-3">
                <h4 className="text-crimson text-base font-bold">{tier}</h4>
                <p className="text-ink-secondary text-sm">
                  {CODEX_SKILL_TIER_NOTES[tier]}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CODEX_SKILL_GRADES.filter((grade) => grade.tier === tier).map(
                  (grade) => (
                    <span
                      key={grade.name}
                      className="border-ink/20 bg-background/60 rounded border px-2 py-0.5 text-sm"
                    >
                      {grade.name}
                    </span>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {active === 'sects' && (
        <div className="space-y-2.5">
          <h3 className="text-ink text-lg font-bold">六大门派</h3>
          {CODEX_SECTS.map((sect) => (
            <div
              key={sect.id}
              className="border-ink/15 bg-background/60 rounded border p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-crimson text-base font-bold">{sect.name}</span>
                <span className="text-ink-secondary text-xs">{sect.motto}</span>
              </div>
              <p className="text-ink-secondary mt-1 text-sm leading-6">
                {sect.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {active === 'currencies' && (
        <div className="space-y-2.5">
          <h3 className="text-ink text-lg font-bold">资财五目</h3>
          {CODEX_CURRENCIES.map((currency) => (
            <div
              key={currency.name}
              className="border-ink/15 bg-background/60 flex items-baseline gap-3 rounded border p-3"
            >
              <span className="w-8 shrink-0 text-center text-lg">{currency.icon}</span>
              <span className="text-ink w-20 shrink-0 text-sm font-bold">
                {currency.name}
              </span>
              <p className="text-ink-secondary text-sm leading-6">
                {currency.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {active === 'rules' && (
        <div className="space-y-5">
          <section>
            <h3 className="text-ink mb-2 text-lg font-bold">鬼市竞珍 · 寄售规矩</h3>
            <ul className="text-ink-secondary space-y-1.5 text-sm leading-6">
              {CODEX_AUCTION_RULES.map((rule) => (
                <li key={rule}>· {rule}</li>
              ))}
            </ul>
            <div className="border-ink/15 bg-background/60 mt-3 rounded border p-3">
              <h4 className="text-ink mb-2 text-sm font-bold">阶梯税率表</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-secondary border-ink/15 border-b text-left text-xs">
                    <th className="py-1.5 font-normal">单件成交价</th>
                    <th className="py-1.5 font-normal">该档税率</th>
                  </tr>
                </thead>
                <tbody>
                  {CODEX_TAX_TABLE.map((row, index) => {
                    const lower =
                      index === 0
                        ? 0
                        : CODEX_TAX_TABLE[index - 1].upTo ?? 0;
                    return (
                      <tr key={index} className="text-ink-secondary">
                        <td className="py-1.5">
                          {lower.toLocaleString()} ～{' '}
                          {row.upTo === null ? '不封顶' : row.upTo.toLocaleString()}
                        </td>
                        <td className="text-ink py-1.5 font-bold">
                          {row.ratePercent}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h3 className="text-ink mb-2 text-lg font-bold">天骄宝阁 · 兑换规矩</h3>
            <ul className="text-ink-secondary space-y-1.5 text-sm leading-6">
              {CODEX_VAULT_RULES.map((rule) => (
                <li key={rule}>· {rule}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </GameSceneFrame>
  );
}
