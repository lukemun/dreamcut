"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<TArgs | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    if (lastArgsRef.current == null) return;
    cancel();
    callbackRef.current(...lastArgsRef.current);
    lastArgsRef.current = null;
  }, [cancel]);

  const debounced = useCallback(
    (...args: TArgs) => {
      lastArgsRef.current = args;
      cancel();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (lastArgsRef.current == null) return;
        callbackRef.current(...lastArgsRef.current);
        lastArgsRef.current = null;
      }, delayMs);
    },
    [cancel, delayMs],
  );

  useEffect(() => cancel, [cancel]);

  return { debounced, cancel, flush };
}
