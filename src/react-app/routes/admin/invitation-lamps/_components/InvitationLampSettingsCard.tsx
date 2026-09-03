import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkSwitch } from '@app/components/ui/InkSwitch';
import { useEffect, useState } from 'react';

/** 灯引强制开关卡片：开启后注册必须持有效灯引，关闭则选填。 */
export function InvitationLampSettingsCard() {
  const { pushToast } = useInkUI();
  const [required, setRequired] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/invitation-lamps/settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { required?: boolean } | null) => {
        if (!cancelled) setRequired(Boolean(data?.required));
      })
      .catch(() => {
        if (!cancelled) setRequired(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRequired = async (next: boolean) => {
    const previous = required;
    setRequired(next);
    setSaving(true);
    try {
      const response = await fetch('/api/admin/invitation-lamps/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ required: next }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? '保存失败');
      pushToast({
        message: next ? '已开启：注册必须持有效灯引' : '已关闭：灯引改为选填',
        tone: 'success',
      });
    } catch (error) {
      setRequired(previous);
      pushToast({
        message: error instanceof Error ? error.message : '保存失败',
        tone: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-ink/15 bg-paper flex items-start justify-between gap-4 border border-dashed p-4">
      <div>
        <p className="text-ink font-bold">注册灯引门槛</p>
        <p className="text-ink-secondary mt-1 text-sm leading-6">
          {required
            ? '已开启：新玩家注册时必须填写有效灯引，无灯引无法入道。'
            : '已关闭：灯引为选填，未填写亦可注册。'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <span className="text-ink-secondary text-sm">{required ? '强制' : '选填'}</span>
        <InkSwitch
          checked={Boolean(required)}
          onCheckedChange={(next) => void updateRequired(next)}
          disabled={saving || required === null}
          aria-label="切换注册灯引门槛"
        />
      </div>
    </div>
  );
}
