import { InkButton } from '@app/components/ui';
import type { ReactNode } from 'react';

export function AlchemyFacilityWorkspace({
  sigil,
  title,
  description,
  onBack,
  backDisabled = false,
  children,
}: {
  sigil: string;
  title: string;
  description: string;
  onBack(): void;
  backDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border-ink/20 min-h-[34rem] border bg-[rgba(248,243,230,0.42)]">
      <header className="border-ink/10 bg-ink/[0.025] sticky top-0 z-10 flex items-center gap-4 border-b px-4 py-4 backdrop-blur-sm sm:px-6">
        <span
          aria-hidden
          className="border-ink/15 text-ink grid size-12 shrink-0 place-items-center border text-2xl"
        >
          {sigil}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-normal sm:text-xl">{title}</h2>
          <p className="text-ink-secondary mt-1 text-xs leading-5 sm:text-sm">
            {description}
          </p>
        </div>
        <InkButton variant="secondary" onClick={onBack} disabled={backDisabled}>
          返回丹房
        </InkButton>
      </header>
      <div className="px-4 py-6 sm:px-7 sm:py-8">{children}</div>
    </section>
  );
}
