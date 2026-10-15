import type { ReactNode } from "react";

/**
 * The one heading for catalog and record pages (Library, Guide, User, History).
 * Workspaces (Editor, Generate, Storyboard) have no page title: the project
 * navigation already names them. `eyebrow` is the project for project-scoped
 * pages; account-wide pages (Guide, User) omit it. `icon` is optional; Guide is a plain heading. `subtitle` sits under the title (User shows its
 * account there). `children` sits at the right:
 * section tabs, help and page actions.
 */
export function PageHeader({ id, icon, eyebrow, back, title, subtitle, children }: {
  id: string; icon?: ReactNode; eyebrow?: ReactNode; back?: ReactNode; title: ReactNode; subtitle?: ReactNode; children?: ReactNode;
}) {
  return <header className="memory-page-heading">
    {icon && <div className="memory-page-title-mark" aria-hidden="true">{icon}</div>}
    <div className="min-w-0">
      {back}
      {eyebrow && <p className="memory-eyebrow">{eyebrow}</p>}
      <h1 id={id}>{title}</h1>
      {subtitle}
    </div>
    {children && <div className="memory-page-actions">{children}</div>}
  </header>;
}
