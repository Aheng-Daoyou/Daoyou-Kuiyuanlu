import { useEffect, useState } from 'react';

/**
 * 注册页灯引门槛：订阅公开端点 /api/auth/invitation-requirement。
 * 返回 null 表示尚未取到（视为选填渲染，提交时服务端仍会兜底强制校验）。
 */
export function useInvitationLampRequired(): boolean | null {
  const [required, setRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/invitation-requirement')
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

  return required;
}
