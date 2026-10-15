"use client";
import type { ReactNode } from "react";
import { PlusIcon } from "lucide-react";
import styles from "./CatalogTile.module.css";
import { setShelfDragPayload } from "./shelf-drag";
import type { ElementCreatePayload } from "./asset-shelf-payloads";

/**
 * One choosable item in an editor panel. Clicking selects it for the agent (never edits) and
 * outlines the tile; the Add button on the preview and dragging onto the timeline use it directly.
 */
export function CatalogTile({ label, detail, preview, selected, onSelect, addLabel, onAdd, adding = false, dragPayload, disabled = false }: {
  label: string;
  detail?: string;
  preview: ReactNode;
  selected: boolean;
  onSelect: () => void;
  addLabel: string;
  onAdd?: () => void;
  adding?: boolean;
  dragPayload?: ElementCreatePayload | null;
  disabled?: boolean;
}) {
  return <article className={styles.tile} data-selected={selected} draggable={!!dragPayload && !disabled}
    onDragStart={dragPayload ? event => setShelfDragPayload(event, dragPayload, label) : undefined}>
    <button type="button" className={styles.select} aria-pressed={selected} disabled={disabled}
      aria-label={`${selected ? "Deselect" : "Select"} ${label}`} onClick={onSelect}>
      <span className={styles.preview} aria-hidden="true">{preview}</span>
      <span className={styles.caption}>
        <span className={styles.label}>{label}</span>
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </span>
    </button>
    {onAdd && <button type="button" className={styles.add} disabled={disabled || adding} aria-label={`${addLabel}: ${label}`} title={addLabel} onClick={onAdd}>
      <PlusIcon size={13} aria-hidden="true" /><span>Add</span>
    </button>}
  </article>;
}

/** Grid owner for CatalogTile collections; columns follow the panel width. */
export function CatalogTileGrid({ children, label }: { children: ReactNode; label: string }) {
  return <div className={styles.grid} role="group" aria-label={label}>{children}</div>;
}
