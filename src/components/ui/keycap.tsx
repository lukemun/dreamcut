import { ArrowBigUp, ChevronUp, Command, Option } from "lucide-react"
import { cn } from "@/lib/utils"

// The monospace face has no ⇧ ⌘ ⌥ ⌃: fallback glyphs come out smaller and lower than the letters.
// They are drawn as icons at the letters' cap height, top and bottom lined up with them.
const MODIFIER_GLYPHS = /([⇧⌘⌥⌃])/
const MODIFIER_ICONS = { "⇧": ArrowBigUp, "⌘": Command, "⌥": Option, "⌃": ChevronUp } as const

/**
 * The quiet shortcut chip that sits after a button's icon or word, e.g. ✓ [A] or ✓ [⇧A].
 * It is decorative: the button carries the key in its accessible name or
 * `aria-keyshortcuts` and in its tooltip.
 */
function Keycap({ className, children, ...props }: React.ComponentProps<"kbd">) {
  const content = typeof children === "string"
    ? children.split(MODIFIER_GLYPHS).filter(Boolean).map((part, index) => {
      const Icon = MODIFIER_ICONS[part as keyof typeof MODIFIER_ICONS]
      return Icon
        // The icon's outline fills ~75% of its box, so a 0.97em box gives ink the height of a capital.
        ? <Icon key={index} data-slot="keycap-modifier" aria-hidden="true" className="-mx-[0.1em] size-[0.97em] shrink-0 -translate-y-[0.02em]" strokeWidth={2} />
        : <span key={index} className="leading-none">{part}</span>
    })
    : children
  return (
    <kbd
      aria-hidden="true"
      data-slot="keycap"
      className={cn(
        "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center gap-px self-center rounded-[3px] bg-current/10 px-1 font-mono text-[10px] leading-none opacity-90",
        className,
      )}
      {...props}
    >
      {content}
    </kbd>
  )
}

export { Keycap }
