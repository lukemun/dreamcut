"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@/lib/frame-runtime/player";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import { catalogAudioPreviewUrl } from "@/lib/remotion/catalog-audio-preview";
import {
  isEditorMixedAudioElement,
  TimelinePreviewAudioEngine,
} from "./timeline-preview-audio-engine";

function PreviewAudioChannel({
  element,
  engine,
}: {
  element: CompositionElement;
  engine: TimelinePreviewAudioEngine;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const elementRef = useRef(element);
  elementRef.current = element;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    engine.register(element, audio);
    const syncAfterMetadata = () => engine.updateElement(elementRef.current);
    audio.addEventListener("loadedmetadata", syncAfterMetadata);
    const settleSeek = () => engine.settleSeek(element.id);
    audio.addEventListener("seeked", settleSeek);
    // Strict Mode cleanup pauses this element. Explicitly restart its load
    // after registration; metadata restores the authored source offset.
    audio.load();
    return () => {
      audio.removeEventListener("loadedmetadata", syncAfterMetadata);
      audio.removeEventListener("seeked", settleSeek);
      engine.unregister(element.id);
    };
  }, [element.id, element.source_url, engine]);

  useEffect(() => {
    engine.updateElement(element);
  }, [element, engine]);

  return (
    <audio
      ref={audioRef}
      src={element.source_url ? catalogAudioPreviewUrl(element.source_url) : undefined}
      preload="none"
      crossOrigin="anonymous"
      data-timeline-preview-audio-id={element.id}
      title={`timeline-audio-engine:${element.id}:persistent-web-audio`}
      aria-hidden="true"
      hidden
    />
  );
}

export function TimelinePreviewAudioMixer({
  elements,
  player,
  retryGeneration = 0,
}: {
  elements: CompositionElement[];
  player: PlayerRef | null;
  retryGeneration?: number;
}) {
  // Fast Refresh invalidates useMemo caches but retains the audio DOM nodes.
  // Keep their one-to-one AudioContext ownership for the mounted lifetime.
  const [engine] = useState(() => new TimelinePreviewAudioEngine());
  const disposeGenerationRef = useRef(0);
  const audioElements = elements.filter(isEditorMixedAudioElement);

  useEffect(() => {
    if (retryGeneration > 0) engine.retryPendingChannels();
  }, [engine, retryGeneration]);

  useEffect(() => {
    if (!player) return;
    return engine.attachPlayer(player);
  }, [engine, player]);

  useEffect(() => {
    disposeGenerationRef.current += 1;
    return () => {
      const disposeGeneration = disposeGenerationRef.current + 1;
      disposeGenerationRef.current = disposeGeneration;
      // React Strict Mode replays effects against the same mounted <audio>
      // element. Defer teardown by one microtask so the replay can retain its
      // AudioContext and MediaElementAudioSourceNode. A real unmount has no
      // matching setup and therefore still disposes the engine.
      queueMicrotask(() => {
        if (disposeGenerationRef.current === disposeGeneration) {
          engine.dispose();
        }
      });
    };
  }, [engine]);

  return (
    <div data-timeline-preview-audio-engine="true" hidden>
      {audioElements.map((element) => (
        <PreviewAudioChannel
          key={`${element.id}:${element.source_url}`}
          element={element}
          engine={engine}
        />
      ))}
    </div>
  );
}
