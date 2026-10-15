"use client";

import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native keyboard/menu behavior with the shared dropdown spacing contract. */
export function NativeSelect({ className, style, children, ...props }: Omit<ComponentProps<"select">, "multiple" | "size">) {
  return <span className="relative block min-w-0">
    <select
      {...props}
      data-slot="native-select"
      className={cn("h-10 w-full min-w-0 appearance-none truncate rounded-lg border border-[var(--chrome-line-strong,var(--input))] bg-[var(--glass-field,var(--card))] ps-3 py-2 text-sm text-[color:var(--ink,var(--foreground))] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-[var(--glass-solid,var(--popover))] [&>option]:text-[color:var(--ink,var(--popover-foreground))]", className)}
      style={{ ...style, paddingInlineEnd: 36 }}
    >{children}</select>
    <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--ink-secondary,var(--foreground))] opacity-70" />
  </span>;
}
