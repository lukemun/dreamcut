"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The one yes/no box in DreamCut (editor-controls.md family 4). A browser checkbox ignores the
 * theme tokens, so it never matched the panel around it; `pnpm check:editor-ui` refuses one.
 * Wrap it in a <label> or give it `aria-label`; `id` lands on the form input, so `htmlFor` works.
 * `tone="apply"` is the green of the proposal Apply action, for picking what Apply applies.
 */
function Checkbox({
  className,
  tone = "default",
  onCheckedChange,
  ...props
}: Omit<CheckboxPrimitive.Root.Props, "onCheckedChange"> & {
  tone?: "default" | "apply"
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-tone={tone}
      onCheckedChange={onCheckedChange ? (checked) => onCheckedChange(checked) : undefined}
      className={cn(
        "relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[var(--edge-control-inner)] border border-[var(--edge-outline)] bg-[var(--glass-field,var(--chrome-panel))] text-transparent outline-none transition-colors",
        "hover:border-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--chrome-panel)]",
        "data-[checked]:border-[var(--ink)] data-[checked]:bg-[var(--ink)] data-[checked]:text-[var(--chrome-panel)]",
        "data-[tone=apply]:data-[checked]:border-[var(--proposal-apply)] data-[tone=apply]:data-[checked]:bg-[var(--proposal-apply)] data-[tone=apply]:data-[checked]:text-[var(--proposal-apply-ink)]",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <CheckIcon aria-hidden="true" className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
