"use client";

import type { ComponentProps, ReactNode } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

/**
 * Shared action menu (commands, not choices; use Select for a value). The trigger
 * renders the caller's element, e.g. a Button, so it keeps the button hierarchy.
 */
export function ActionMenu({ trigger, children, align = "end", side = "bottom" }: {
  trigger: ComponentProps<typeof MenuPrimitive.Trigger>["render"]; children: ReactNode;
  align?: "start" | "center" | "end"; side?: "top" | "bottom";
}) {
  return <MenuPrimitive.Root>
    <MenuPrimitive.Trigger render={trigger} />
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={6} align={align} side={side} className="editor-chrome isolate z-[1300]">
        <MenuPrimitive.Popup className="min-w-52 rounded-xl border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] p-1 text-sm text-[var(--ink)] shadow-xl outline-none">
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
