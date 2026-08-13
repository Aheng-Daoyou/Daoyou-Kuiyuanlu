import { cn } from '@shared/lib/cn';
import type { AlchemyWorkspacePhase } from './alchemyTypes';

const STEPS = [
  { key: 'preparing', sigil: '配', label: '配炉' },
  { key: 'observing', sigil: '观', label: '观火' },
  { key: 'opening', sigil: '开', label: '开鼎' },
] as const;

export function AlchemyRitualRail({ phase }: { phase: AlchemyWorkspacePhase }) {
  const current = phase === 'preparing' ? 0 : phase === 'observing' ? 1 : 2;
  return (
    <ol
      aria-label="炼丹流程"
      className="border-ink/10 grid grid-cols-3 border-y py-3"
    >
      {STEPS.map((step, index) => (
        <li
          key={step.key}
          className="relative flex min-w-0 flex-col items-center gap-1 text-center"
        >
          {index > 0 ? (
            <span
              aria-hidden
              className={cn(
                'absolute top-4 right-1/2 h-px w-full',
                index <= current ? 'bg-crimson/40' : 'bg-ink/10',
              )}
            />
          ) : null}
          <span
            className={cn(
              'relative z-10 grid size-8 place-items-center rounded-full border bg-[rgb(248,243,230)] text-xs',
              index === current
                ? 'border-crimson text-crimson shadow-[0_0_0_3px_rgba(145,36,36,0.08)]'
                : index < current
                  ? 'border-ink/35 text-ink'
                  : 'border-ink/15 text-ink-secondary',
            )}
          >
            {step.sigil}
          </span>
          <span
            className={cn(
              'text-xs',
              index === current
                ? 'text-crimson font-semibold'
                : 'text-ink-secondary',
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
