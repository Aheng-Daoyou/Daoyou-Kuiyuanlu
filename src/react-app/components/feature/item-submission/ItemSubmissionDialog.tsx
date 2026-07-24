import { InkModal } from '@app/components/layout/InkModal';
import { InkButton, InkNotice } from '@app/components/ui';
import { useMemo, useState } from 'react';

export interface ItemSubmissionOption {
  id: string;
  title: string;
  facts: string[];
  eligible: boolean;
  reasons: string[];
  warning?: string;
}

export interface ItemSubmissionDialogProps {
  open: boolean;
  title: string;
  requirement: string;
  items: ItemSubmissionOption[];
  loading: boolean;
  error?: string;
  busy: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange(page: number): void;
  };
  onClose(): void;
  onRetry(): void;
  onConfirm(itemId: string): Promise<void>;
}

export function ItemSubmissionDialog({
  open,
  title,
  requirement,
  items,
  loading,
  error,
  busy,
  pagination,
  onClose,
  onRetry,
  onConfirm,
}: ItemSubmissionDialogProps) {
  const [selectedId, setSelectedId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId],
  );
  const close = () => {
    if (busy) return;
    setSelectedId('');
    setConfirming(false);
    onClose();
  };
  const changePage = (page: number) => {
    setSelectedId('');
    setConfirming(false);
    pagination?.onPageChange(page);
  };
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;

  return (
    <InkModal
      isOpen={open}
      onClose={close}
      title={title}
      className="max-w-2xl"
      footer={
        confirming && selected ? (
          <div className="flex flex-wrap justify-end gap-2">
            <InkButton disabled={busy} onClick={() => setConfirming(false)}>
              返回选择
            </InkButton>
            <InkButton
              variant="primary"
              disabled={busy}
              onClick={() => void onConfirm(selected.id)}
            >
              {busy ? '正在移交…' : '确认永久移交'}
            </InkButton>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <InkButton disabled={busy} onClick={close}>
              再看看
            </InkButton>
            <InkButton
              variant="primary"
              disabled={busy || !selected?.eligible}
              onClick={() => setConfirming(true)}
            >
              核对交付
            </InkButton>
          </div>
        )
      }
    >
      <InkNotice>{requirement}</InkNotice>
      {confirming && selected ? (
        <div className="mt-4 space-y-3 text-sm leading-7">
          <p>
            将向宗门移交：
            <strong className="ml-1">{selected.title}</strong>
          </p>
          <p className="text-crimson">提交后物品将永久移交，无法找回。</p>
          {selected.warning ? <InkNotice>{selected.warning}</InkNotice> : null}
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-stone-500">正在查阅背包卷宗…</p>
      ) : error ? (
        <div className="mt-4">
          <InkNotice>{error}</InkNotice>
          <InkButton className="mt-3" onClick={onRetry}>
            重新查阅
          </InkButton>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">暂无可查阅的同类物品。</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.eligible || busy}
                aria-pressed={selectedId === item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full border p-3 text-left transition-colors ${
                  selectedId === item.id
                    ? 'border-crimson/50 bg-crimson/5'
                    : 'border-stone-800/15 bg-white/20'
                } ${item.eligible ? 'hover:border-stone-800/35' : 'cursor-not-allowed opacity-55'}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <strong>{item.title}</strong>
                  <span className="text-xs">
                    {item.eligible ? '符合要求' : '不可提交'}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-stone-500">
                  {item.facts.join(' · ')}
                </span>
                {item.reasons.length > 0 ? (
                  <span className="text-crimson mt-1 block text-xs leading-5">
                    {item.reasons.join('；')}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {pagination && totalPages > 1 ? (
            <nav
              aria-label="交付候选分页"
              className="mt-4 flex items-center justify-between gap-3 text-sm"
            >
              <InkButton
                disabled={busy || loading || pagination.page <= 1}
                onClick={() => changePage(pagination.page - 1)}
              >
                上一页
              </InkButton>
              <span className="text-stone-500">
                第 {pagination.page} / {totalPages} 页，共 {pagination.total} 件
              </span>
              <InkButton
                disabled={
                  busy || loading || pagination.page >= totalPages
                }
                onClick={() => changePage(pagination.page + 1)}
              >
                下一页
              </InkButton>
            </nav>
          ) : null}
        </>
      )}
    </InkModal>
  );
}
