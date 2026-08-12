/**
 * 通用物品展示弹窗
 *
 * 作为所有道具与能力详情的统一承载容器：
 * - 材料 / 消耗品使用基础信息区域
 * - 神通 / 功法 / 法宝可通过 summary / metaSection / footer 组装更丰富的展示内容
 */

import type { ReactNode } from 'react';
import { InkDetailDrawer } from './InkDetailDrawer';

export interface ItemShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  icon: string;
  name: string;
  nameMark?: ReactNode;
  cornerMeta?: ReactNode;
  badges?: ReactNode[];
  summary?: ReactNode;
  metaSection?: ReactNode;
  extraInfo?: ReactNode;
  description?: string;
  descriptionTitle?: string;
  footer?: ReactNode;
}

export function ItemShowcaseModal({
  isOpen,
  onClose,
  icon,
  name,
  nameMark,
  cornerMeta,
  badges = [],
  summary,
  metaSection,
  extraInfo,
  description,
  descriptionTitle = '说明',
  footer,
}: ItemShowcaseModalProps) {
  return (
    <InkDetailDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={name}
      size="md"
      footer={footer}
    >
      <div className="relative space-y-3">
        {cornerMeta && (
          <div className="absolute top-0 right-0 z-10">{cornerMeta}</div>
        )}
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <div className="mb-2 text-4xl">{icon}</div>
          {nameMark ? <div className="relative">{nameMark}</div> : null}
          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {badges.map((badge, index) => (
                <div key={index}>{badge}</div>
              ))}
            </div>
          )}
          {summary && <div className="mt-3 w-full">{summary}</div>}
        </div>

        <div className="space-y-2 text-sm leading-7">
          {metaSection}
          {extraInfo}

          {description && (
            <div className="pt-2">
              <span className="text-ink mb-1 block font-semibold">
                {descriptionTitle}
              </span>
              <p className="text-ink-secondary">{description}</p>
            </div>
          )}
        </div>
      </div>
    </InkDetailDrawer>
  );
}
