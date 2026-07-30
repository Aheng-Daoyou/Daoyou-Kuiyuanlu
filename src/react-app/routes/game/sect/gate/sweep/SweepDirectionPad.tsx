import type { SweepDirection } from '@shared/engine/sect';

const buttonClass =
  'absolute grid h-11 w-11 touch-none select-none place-items-center rounded-full bg-[#18201c]/72 text-xl text-stone-100 shadow-lg ring-1 ring-white/15 backdrop-blur-md transition active:scale-90 active:bg-[#25342c]/90 disabled:pointer-events-none disabled:opacity-40';

export function SweepDirectionPad({
  disabled,
  onMove,
}: {
  disabled?: boolean;
  onMove: (direction: SweepDirection) => boolean;
}) {
  const move = (direction: SweepDirection) => {
    if (disabled) return;
    if (!onMove(direction)) navigator.vibrate?.(15);
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-[max(env(safe-area-inset-bottom),0.75rem)] left-[max(env(safe-area-inset-left),0.75rem)] z-20 h-28 w-28 touch-none"
      role="group"
      aria-label="清扫方向盘"
    >
      <button
        type="button"
        className={`${buttonClass} top-0 left-[2.625rem]`}
        aria-label="向上移动一格"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          move('up');
        }}
      >
        ↑
      </button>
      <button
        type="button"
        className={`${buttonClass} top-[2.625rem] right-0`}
        aria-label="向右移动一格"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          move('right');
        }}
      >
        →
      </button>
      <button
        type="button"
        className={`${buttonClass} bottom-0 left-[2.625rem]`}
        aria-label="向下移动一格"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          move('down');
        }}
      >
        ↓
      </button>
      <button
        type="button"
        className={`${buttonClass} top-[2.625rem] left-0`}
        aria-label="向左移动一格"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          move('left');
        }}
      >
        ←
      </button>
      <span
        className="absolute top-[2.875rem] left-[2.875rem] h-9 w-9 rounded-full bg-[#18201c]/40 ring-1 ring-white/8 backdrop-blur-sm"
        aria-hidden="true"
      />
    </div>
  );
}
