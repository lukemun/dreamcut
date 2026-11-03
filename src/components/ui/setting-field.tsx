import type { ReactNode } from "react";

/**
 * One setting in a settings panel: its name above a full-width control (a menu, a segmented
 * choice), with an optional status line under it. Every setting in a panel uses this, so names,
 * spacing and control widths line up whatever the control is.
 */
export function SettingField({ label, labelId, htmlFor, status, children }: {
  label: string;
  /** Id of the name, for a control group that is labelled by it (`aria-labelledby`). */
  labelId?: string;
  /** Id of a single field the name labels. */
  htmlFor?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="setting-field">
      {htmlFor
        ? <label className="setting-field-label" htmlFor={htmlFor}>{label}</label>
        : <span className="setting-field-label" id={labelId}>{label}</span>}
      {children}
      {status ? <p className="setting-field-status" role="status">{status}</p> : null}
    </div>
  );
}
