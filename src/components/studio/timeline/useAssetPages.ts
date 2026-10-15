"use client";
import {useCallback, useEffect, useRef, useState} from 'react';
import {mergeAssetPages, type AssetPage} from '@/lib/library/asset-page';
type Inventory = Record<string, unknown> & {page?: AssetPage};
const cache = new Map<string, {data: Inventory; at: number}>();
const TTL = 30_000;
export function useAssetPages<T extends Inventory>(projectId: string, category: string, search: string, active: boolean, filters: Record<string, string> = {}) {
  const [query, setQuery] = useState(search);
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 200); return () => clearTimeout(timer); }, [search]);
  const filterQuery = Object.entries(filters).filter(([, value]) => value).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([projectId, category, query, filterQuery]);
  const [state, setState] = useState<{key: string; data: T | null}>({key, data: null});
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const currentKey = useRef(key); currentKey.current = key;
  const data = state.key === key ? state.data : (cache.get(key)?.data as T ?? null);
  const dataRef = useRef(data); dataRef.current = data;
  const request = useCallback(async (offset = 0) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    busy.current = true; setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({category, q: query, offset: String(offset), limit: '40', ...Object.fromEntries(JSON.parse(key)[3] as [string, string][])});
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/timeline/assets?${params}`, {signal: abort.signal});
      if (!response.ok) throw new Error('Could not load assets. Try again.');
      const page = await response.json() as T;
      if (abort.signal.aborted || currentKey.current !== key) return;
      const next = offset && dataRef.current ? mergeAssetPages(dataRef.current, page) : page;
      cache.set(key, {data: next, at: Date.now()});
      while (cache.size > 20) cache.delete(cache.keys().next().value!);
      setState({key, data: next});
    } catch (e) { if (!abort.signal.aborted && currentKey.current === key) setError(e instanceof Error ? e.message : 'Could not load assets.'); }
    finally { if (controller.current === abort) { busy.current = false; setLoading(false); } }
  }, [projectId, category, query, key]);
  useEffect(() => {
    setError(null); setLoading(false); busy.current = false;
    if (!active) { controller.current?.abort(); return; }
    const saved = cache.get(key);
    if (saved) setState({key, data: saved.data as T});
    if (!saved || Date.now() - saved.at > TTL) void request();
    return () => controller.current?.abort();
  }, [active, key, request]);
  const refresh = useCallback(async (_options?: {silent?: boolean}) => {
    for (const cachedKey of cache.keys()) if (JSON.parse(cachedKey)[0] === projectId) cache.delete(cachedKey);
    await request();
  }, [projectId, request]);
  const loadMore = useCallback(() => { if (!busy.current && !loading && !error && data?.page?.nextOffset != null) void request(data.page.nextOffset); }, [data, loading, error, request]);
  return {data, loading, error, refresh, loadMore};
}
