import { useSyncExternalStore } from 'react';

const RECOVERY_CLOCK_INTERVAL_MS = 60_000;

type Listener = () => void;

const listeners = new Set<Listener>();
let serverOffsetMs = 0;
let snapshotNowMs = Date.now();
let timer: number | undefined;

function readEstimatedServerNowMs(): number {
  return Date.now() + serverOffsetMs;
}

function emitNow(): void {
  snapshotNowMs = readEstimatedServerNowMs();
  for (const listener of listeners) listener();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    emitNow();
    startTimer();
    return;
  }
  stopTimer();
}

function startTimer(): void {
  if (
    typeof window === 'undefined' ||
    timer !== undefined ||
    document.visibilityState !== 'visible'
  ) {
    return;
  }
  snapshotNowMs = readEstimatedServerNowMs();
  timer = window.setInterval(emitNow, RECOVERY_CLOCK_INTERVAL_MS);
}

function stopTimer(): void {
  if (typeof window === 'undefined' || timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
}

function startClock(): void {
  if (typeof window === 'undefined') return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  startTimer();
}

function stopClock(): void {
  if (typeof window === 'undefined') return;
  stopTimer();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) startClock();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopClock();
  };
}

function subscribeDisabled(): () => void {
  return () => undefined;
}

function getSnapshot(): number {
  return snapshotNowMs;
}

export function observePlayerResourceServerTime(serverTime: string): void {
  const parsed = Date.parse(serverTime);
  if (!Number.isFinite(parsed)) return;
  serverOffsetMs = parsed - Date.now();
  snapshotNowMs = readEstimatedServerNowMs();
  if (listeners.size > 0) {
    for (const listener of listeners) listener();
  }
}

export function getEstimatedServerNowMs(): number {
  return readEstimatedServerNowMs();
}

export function useRecoveryClock(enabled: boolean): number {
  const snapshot = useSyncExternalStore(
    enabled ? subscribe : subscribeDisabled,
    getSnapshot,
    getSnapshot,
  );
  return enabled ? snapshot : getEstimatedServerNowMs();
}
