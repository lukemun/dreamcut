"use client";

import type { ComponentProps, ReactNode } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopupContainer } from "./popup-container";

/**
 * Shared action menu (commands, not choices; use Select for a value). The trigger
 * renders the caller's element, e.g. a Button, so it keeps the button hierarchy.
 */
export function ActionMenu({ trigger, children, align = "end", side = "bottom" }: {
  trigger: ComponentProps<typeof MenuPrimitive.Trigger>["render"]; children: ReactNode;
  align?: "start" | "center" | "end"; side?: "top" | "bottom";
}) {
  const container = usePopupContainer();
  return <MenuPrimitive.Root>
    <MenuPrimitive.Trigger render={trigger} />
    <MenuPrimitive.Portal container={container}>
      <MenuPrimitive.Positioner positionMethod="fixed" sideOffset={6} align={align} side={side} className="editor-chrome isolate z-(--layer-popover)">
        <MenuPrimitive.Popup className="min-w-52 rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-1 text-sm text-[var(--ink)] shadow-xl outline-none">
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  </MenuPrimitive.Root>;
}

export function ActionMenuItem({ className, icon, description, children, ...props }: ComponentProps<typeof MenuPrimitive.Item> & { icon?: ReactNode; description?: ReactNode }) {
  return <MenuPrimitive.Item className={cn("flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--ink-secondary)]", className)} {...props}>
    {icon}<span className="min-w-0"><span className="block">{children}</span>{description && <span className="block text-xs text-[var(--ink-muted)]">{description}</span>}</span>
  </MenuPrimitive.Item>;
}

/** A menu entry that switches something on or off (e.g. which panels show); the menu stays open. */
export function ActionMenuCheckboxItem({ className, icon, children, ...props }: ComponentProps<typeof MenuPrimitive.CheckboxItem> & { icon?: ReactNode }) {
  return <MenuPrimitive.CheckboxItem closeOnClick={false} className={cn("group flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--ink-secondary)]", className)} {...props}>
    <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center rounded-[var(--edge-control-inner)] border border-[var(--edge-outline)] group-data-[checked]:border-transparent group-data-[checked]:bg-[var(--ink)]">
      <MenuPrimitive.CheckboxItemIndicator className="grid place-items-center text-[var(--chrome-panel)]"><Check strokeWidth={3} className="!size-3 !text-[var(--chrome-panel)]" /></MenuPrimitive.CheckboxItemIndicator>
    </span>
    {icon}<span className="min-w-0 flex-1">{children}</span>
  </MenuPrimitive.CheckboxItem>;
}
