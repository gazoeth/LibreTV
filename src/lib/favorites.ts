'use client';

import { useSyncExternalStore } from 'react';
import type { SearchResultItem } from './types';

const STORAGE_KEY = 'freedy:favorites:v1';
export const MAX_FAVORITES = 200;
const EMPTY: SearchResultItem[] = [];
let cachedRaw: string | null | undefined;
let cachedItems: SearchResultItem[] = EMPTY;
const listeners = new Set<() => void>();

export function favoriteKey(item: Pick<SearchResultItem, 'sourceKey' | 'vodId' | 'sourceUrl'>) {
  return JSON.stringify([item.sourceKey, item.vodId, item.sourceUrl || '']);
}

/** 只读取收藏字段；损坏或过大的存储不影响页面使用。 */
function parse(raw: string | null): SearchResultItem[] {
  if (!raw || raw.length > 1_000_000) return EMPTY;
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return EMPTY;
    const seen = new Set<string>();
    const result: SearchResultItem[] = [];
    for (const value of rows.slice(0, MAX_FAVORITES)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Record<string, unknown>;
      if (['sourceKey', 'sourceName', 'vodId', 'name'].some(k => typeof row[k] !== 'string' || !(row[k] as string).trim() || (row[k] as string).length > 1000)) continue;
      const item: SearchResultItem = { sourceKey: row.sourceKey as string, sourceName: row.sourceName as string, vodId: row.vodId as string, name: row.name as string };
      for (const field of ['pic', 'typeName', 'year', 'area', 'remarks', 'sourceUrl'] as const) {
        if (typeof row[field] === 'string' && row[field].length <= 4000) item[field] = row[field];
      }
      if (row.isAdult === true) item.isAdult = true;
      const key = favoriteKey(item);
      if (!seen.has(key)) { seen.add(key); result.push(item); }
    }
    return result;
  } catch { return EMPTY; }
}

function snapshot() {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) { cachedRaw = raw; cachedItems = parse(raw); }
  } catch { return EMPTY; }
  return cachedItems;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function useFavorites() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

function persist(items: SearchResultItem[]) {
  try {
    const bounded = items.slice(0, MAX_FAVORITES);
    let raw = JSON.stringify(bounded);
    while (raw.length > 1_000_000 && bounded.length) { bounded.pop(); raw = JSON.stringify(bounded); }
    localStorage.setItem(STORAGE_KEY, raw);
    for (const listener of listeners) listener();
    return true;
  } catch { return false; }
}

export function addFavorite(item: SearchResultItem) {
  const validated = parse(JSON.stringify([item]));
  if (!validated.length) return false;
  const key = favoriteKey(item);
  return persist([validated[0], ...snapshot().filter(row => favoriteKey(row) !== key)].slice(0, MAX_FAVORITES));
}

export function removeFavorite(item: SearchResultItem) {
  const key = favoriteKey(item);
  return persist(snapshot().filter(row => favoriteKey(row) !== key));
}
