// Browser-persisted keys use the "dreamcut" prefix ("dreamcut.x" / "dreamcut:x").
// Values saved under the earlier OpenEdit/OpenSequence prefixes are read once and
// moved to the new key, so existing preferences carry over. The legacy entry is
// removed after the move so a later removal of the new key cannot resurrect it.
export const LEGACY_KEY_PREFIXES = ["openedit", "open-edit", "opensequence"] as const;

type ReadableStorage = Pick<Storage, "getItem" | "setItem"> & { removeItem?: (key: string) => void };

/** Older spellings of a current "dreamcut…" key, newest first. */
export function legacyStorageKeys(key: string): string[] {
  return key.startsWith("dreamcut") && /^[.:\-]/.test(key.slice(8))
    ? LEGACY_KEY_PREFIXES.map(prefix => `${prefix}${key.slice(8)}`)
    : [];
}

/** Reads the current key, else migrates the first legacy value found. */
export function getStoredItem(storage: ReadableStorage, key: string): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const legacyKeys = legacyStorageKeys(key);
  for (const legacy of legacyKeys) {
    const value = storage.getItem(legacy);
    if (value === null) continue;
    try {
      storage.setItem(key, value);
      for (const old of legacyKeys) storage.removeItem?.(old);
    } catch { /* Read-only or full storage: still return the saved value. */ }
    return value;
  }
  return null;
}
