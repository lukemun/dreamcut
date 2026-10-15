"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex min-w-0 flex-1 truncate text-left", className)}
      {...props}
    />
  )
}

// "field" is the bordered form control. "chip" is a quiet inline trigger for
// composer and toolbar choices (such as the chat agent and model): no field box,
// just text that brightens on hover and shows the shared focus ring.
const CHIP_TRIGGER = "flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-[color:var(--ink-secondary,var(--foreground))] whitespace-nowrap outline-none select-none transition-colors hover:bg-[var(--glass-control,var(--accent))] hover:text-[color:var(--ink,var(--foreground))] data-[popup-open]:bg-[var(--glass-control,var(--accent))] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring,var(--ring))]/40 disabled:cursor-not-allowed disabled:opacity-50"

function SelectTrigger({
  className,
  size = "default",
  variant = "field",
  showChevron = true,
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
  variant?: "field" | "chip"
  showChevron?: boolean
}) {
  if (variant === "chip") {
    return (
      <SelectPrimitive.Trigger data-slot="select-trigger" data-variant="chip" className={cn(CHIP_TRIGGER, className)} {...props}>
        {children}
      </SelectPrimitive.Trigger>
    )
  }
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--chrome-line-strong,var(--input))] bg-[var(--glass-field,var(--color-card))] py-2 pe-3 ps-3 text-sm whitespace-nowrap transition-colors outline-none select-none hover:border-[var(--color-text-secondary)] focus-visible:border-[var(--select-selected-marker)] focus-visible:ring-3 focus-visible:ring-[var(--select-selected-marker)]/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-foreground/65 data-[size=default]:h-10 data-[size=sm]:h-8 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:truncate *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {showChevron && <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />}
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        // Always open downward and scroll if cramped, rather than flipping up
        // when the list is long — keeps every Select consistent regardless of
        // item count or position on the page.
        collisionAvoidance={{ side: "none", align: "shift" }}
        className="isolate z-[1300]"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-[1300] max-h-[min(var(--available-height),20rem)] w-(--anchor-width) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--color-border)] bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2.5 pt-2 pb-1 text-[12px] font-semibold text-[var(--color-text-secondary)]", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        // Canva-style two-state item, no brand orange anywhere:
        //   data-selected   → teal tint (--select-selected-bg) + teal check
        //   data-highlighted → neutral (--accent), applied only when NOT
        //                      selected so the selected row stays teal on hover
        //                      (matches Canva's purple-selected row).
        // Both are flipping tokens (light / dark / force-light), so no `dark:`
        // variants — the editor renders under .force-light and ignores those.
        "relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-2 pr-8 pl-2.5 text-sm outline-hidden select-none data-[selected]:bg-[var(--select-selected-bg)] not-data-[selected]:data-[highlighted]:bg-[var(--accent)] data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 gap-2 whitespace-normal break-words">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none text-[var(--select-selected-marker)]" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

/** Compact controlled choices using the shared, in-app popup and keyboard behavior. */
export function OptionSelect({ label, value, options, placeholder = "Choose…", disabled, onValueChange }: {
  label: string; value: string; options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string; disabled?: boolean; onValueChange: (value: string) => void;
}) {
  const selected = options.find(option => option.value === value);
  return <Select value={value} disabled={disabled} onValueChange={next => { if (next !== null) onValueChange(next); }}>
    <SelectTrigger className="w-full" aria-label={label}><SelectValue>{selected?.label ?? placeholder}</SelectValue></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}
