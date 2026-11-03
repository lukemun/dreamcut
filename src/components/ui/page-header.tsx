import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * The one heading for catalog and record pages (Library, Guide, User, History).
 * Workspaces (Editor, Generate, Storyboard) have no page title: the project
 * navigation already names them. `eyebrow` is the project for project-scoped
 * pages; account-wide pages (Guide, User) omit it. `icon` is optional; Guide is a plain heading. `subtitle` sits under the title (User shows its
 * account there). `children` sits at the right:
 * section tabs, help and page actions. `back` is a real button on its own line above the
 * heading, so leaving the page is never mistaken for a label.
 */
export function PageHeader({ id, icon, eyebrow, back, title, subtitle, children }: {
  id: string; icon?: ReactNode; eyebrow?: ReactNode; back?: { href: string; label: string }; title: ReactNode; subtitle?: ReactNode; children?: ReactNode;
}) {
  return <header className="memory-page-heading">
    {back && <div className="memory-page-back">
      <Link href={back.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />{back.label}
      </Link>
    </div>}
    {icon && <div className="memory-page-title-mark" aria-hidden="true">{icon}</div>}
    <div className="min-w-0">
      {eyebrow && <p className="memory-eyebrow">{eyebrow}</p>}
      <h1 id={id}>{title}</h1>
      {subtitle}
    </div>
    {children && <div className="memory-page-actions">{children}</div>}
  </header>;
}
