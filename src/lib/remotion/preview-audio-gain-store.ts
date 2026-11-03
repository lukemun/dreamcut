"use client";

import { useCallback, useSyncExternalStore } from "react";

type Listener = () => void;

const previewGainByElementId = new Map<string, number>();
const listenersByElementId = new Map<string, Set<Listener>>();

function emit(elementId: string) {
  for (const listener of listenersByElementId.get(elementId) ?? []) listener();
}

export function readPreviewAudioGain(elementId: string): number | null {
  return previewGainByElementId.get(elementId) ?? null;
}

export function setPreviewAudioGain(elementId: string, gain: number) {
  if (!Number.isFinite(gain)) return;
  const next = Math.max(0, Math.min(4, gain));
  if (previewGainByElementId.get(elementId) === next) return;
  previewGainByElementId.set(elementId, next);
  emit(elementId);
}

export function clearPreviewAudioGain(elementId: string) {
  if (!previewGainByElementId.delete(elementId)) return;
  emit(elementId);
}

export function clearAllPreviewAudioGains() {
  const elementIds = [...previewGainByElementId.keys()];
  previewGainByElementId.clear();
  for (const elementId of elementIds) emit(elementId);
}

export function subscribePreviewAudioGain(elementId: string, listener: Listener) {
  const listeners = listenersByElementId.get(elementId) ?? new Set<Listener>();
  listeners.add(listener);
  listenersByElementId.set(elementId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByElementId.delete(elementId);
  };
}

export function usePreviewAudioGain(elementId: string): number | null {
  const subscribe = useCallback(
    (listener: Listener) => subscribePreviewAudioGain(elementId, listener),
    [elementId],
  );
  const getSnapshot = useCallback(() => readPreviewAudioGain(elementId), [elementId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

declare global {
  interface Window {
    __timelineAudioPreviewGainProbe?: {
      read: (elementId: string) => number | null;
      set: (elementId: string, gain: number) => void;
      clear: (elementId: string) => void;
      clearAll: () => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.__timelineAudioPreviewGainProbe = {
    read: readPreviewAudioGain,
    set: setPreviewAudioGain,
    clear: clearPreviewAudioGain,
    clearAll: clearAllPreviewAudioGains,
  };
}
