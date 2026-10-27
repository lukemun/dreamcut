"use client";

import { useRef, type ReactNode } from "react";

/**
 * A native textarea owns editing/selection; the inert mirror colors reference tokens (@Element1, @Image1, @Video1, @Audio1).
 * `footer` sits inside the field under the text, so the prompt and its output settings read as one box.
 */
export function GenerationPrompt({ value, onChange, character, label = "Prompt", id = "asset-generation-prompt", placeholder = "Describe the action, camera, and what should stay the same…", footer }: { value: string; onChange: (value: string) => void; character: boolean; label?: string; id?: string; placeholder?: string; footer?: ReactNode }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const metrics = { padding: "12px", fontSize: "14px", lineHeight: "24px", fontFamily: "inherit", fontWeight: 400, letterSpacing: "normal" } as const;
  const textStyle = "m-0 w-full whitespace-pre-wrap break-words border-0 px-3 py-3 text-sm font-normal leading-6 tracking-normal [tab-size:4]";
  return <section className="space-y-2">
    <div className="flex items-center justify-between gap-3"><label htmlFor={id} className="text-xs font-medium text-[var(--ink-secondary)]">{label}</label>{character ? <button type="button" className="rounded-md bg-violet-500/15 px-2 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/25" onClick={() => {
      const node = input.current, start = node?.selectionStart ?? value.length, end = node?.selectionEnd ?? start;
      const token = `${start && !/\s/.test(value[start - 1]) ? " " : ""}@Element1 `;
      onChange(value.slice(0, start) + token + value.slice(end));
      requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(start + token.length, start + token.length); });
    }}>Insert @Element1 (character)</button> : null}</div>
    {/* The whole box resizes, so the grip sits at its bottom corner under the chips, not between text and chips. */}
    <div className="flex min-h-28 resize-y flex-col overflow-hidden rounded-lg border border-[var(--edge-outline)] bg-[var(--glass-field)] focus-within:border-[var(--chrome-focus-ring)] focus-within:ring-3 focus-within:ring-[var(--chrome-focus-ring)]/35">
      <div className="relative flex min-h-0 flex-1">
      <div ref={mirror} aria-hidden="true" style={metrics} className={`${textStyle} pointer-events-none absolute inset-0 overflow-hidden text-[var(--ink)]`}>
        {value.split(/(@(?:Element|Image|Video|Audio)\d+\b)/g).map((part, i) => /^@(?:Element|Image|Video|Audio)\d+\b$/.test(part) ? <span key={i} className="rounded-sm bg-violet-500/15 text-violet-300">{part}</span> : part)}{"\n"}
      </div>
      <textarea ref={input} id={id} aria-label={label === "Prompt" ? "Generation prompt" : label} rows={5} style={{ ...metrics, color: "transparent", background: "transparent", border: 0, boxShadow: "none", margin: 0 }} className={`${textStyle} relative block min-h-0 flex-1 resize-none caret-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] selection:bg-violet-500/30 selection:text-[var(--ink)]`} value={value} onChange={e => onChange(e.target.value)} onScroll={e => { if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop; }} placeholder={placeholder} />
      </div>
      {footer ? <div className="shrink-0 pb-1.5 pl-1.5 pr-4">{footer}</div> : null}
    </div>
  </section>;
}
