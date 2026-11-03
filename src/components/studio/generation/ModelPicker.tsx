"use client";

import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, ChevronDownIcon, InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CHIP_TRIGGER } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ModelChoice = {
  id: string; name: string; description: string;
  /** What the model takes besides the prompt: start frame, reference images, your video… */
  inputs: string[];
  /** The price line: approximate credits, or what decides the price. */
  price: string;
  /** The job it serves; models are listed under these headings in order of first appearance. */
  group: string;
};

/**
 * Model choice for Generate: a chip in the prompt box that names the model. Opening it lists every model for this
 * kind of media, grouped by job, one line each with its approximate price; each model's info icon shows what it is
 * good at and what it takes in a panel beside the list, so the list stays short (creator direction 2026-10-22).
 */
export function ModelPicker({ choices, value, onChange, unavailable }: {
  choices: readonly ModelChoice[]; value: string; onChange: (id: string) => void;
  /** The current model when it can no longer be generated with; shown so the draft explains itself. */
  unavailable?: { name: string };
}) {
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const current = choices.find(choice => choice.id === value);
  const groups = [...new Set(choices.map(choice => choice.group))];
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger aria-label={`Model: ${current?.name ?? unavailable?.name ?? "none"}`} className={cn(CHIP_TRIGGER, "text-[color:var(--ink)]")}>
            <span className="truncate">{current?.name ?? (unavailable ? `${unavailable.name} (unavailable)` : "Choose a model")}</span>
      <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
    </Popover.Trigger>
    <Popover.Portal>
      {/* Opens upward like the other chips: below the prompt sits Generate, which spends credits. */}
      <Popover.Positioner side="top" align="end" sideOffset={6} collisionPadding={8} className="editor-chrome isolate z-(--layer-popover)">
        <Popover.Popup initialFocus={() => list.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]") ?? null}
          className="max-h-[min(440px,var(--available-height))] w-[min(272px,calc(100vw-16px))] max-w-[var(--available-width)] overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-1 text-[var(--ink)] shadow-xl outline-none">
          <div ref={list} role="group" aria-label="Models" className="space-y-1.5"
            onKeyDown={event => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-model]") ?? [])];
              const at = items.indexOf(document.activeElement as HTMLButtonElement);
              event.preventDefault();
              items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }}>
            {groups.map(group => <section key={group}>
              {groups.length > 1 ? <h4 className="px-2 pb-0.5 pt-1.5 text-xs font-medium text-[var(--ink-muted)]">{group}</h4> : null}
              {choices.filter(choice => choice.group === group).map(choice => <div key={choice.id} className="group/model flex min-w-0 items-center rounded-md hover:bg-[var(--chrome-raised)] has-[[aria-pressed=true]]:bg-[var(--chrome-selected-bg)]">
                <button type="button" data-model={choice.id} aria-pressed={choice.id === value} onClick={() => { onChange(choice.id); setOpen(false); }}
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 text-left text-sm text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35">
                  <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                  {choice.id === value ? <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                  <span className="shrink-0 text-xs tabular-nums text-[var(--ink-muted)]">{choice.price}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger delay={150} aria-label={`About ${choice.name}`} className="mx-0.5 grid size-7 shrink-0 place-items-center rounded-md text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35">
                    <InfoIcon aria-hidden="true" className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={10} className="editor-chrome block w-64 max-w-64 rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-3 text-[var(--ink)] shadow-xl [&>:last-child]:hidden">
                    <span className="block text-sm font-medium">{choice.name}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--ink-secondary)]">{choice.description}</span>
                    {choice.inputs.length ? <span className="mt-2 block text-xs text-[var(--ink-muted)]">{choice.inputs.join(" · ")}</span> : null}
                    <span className="mt-2 block text-xs tabular-nums text-[var(--ink-secondary)]">{choice.price}</span>
                  </TooltipContent>
                </Tooltip>
              </div>)}
            </section>)}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
