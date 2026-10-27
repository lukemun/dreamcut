# Page header and way-back UX audit case

Case: `page-header-way-back-v1`. Status: ready for a manual visual audit; no automated
runner or independent model result. This is a product UI case, not a timeline-editing
benchmark. Opening pages is viewing only; do not change a project to run it.

## Input and task

Use every page built on `PageHeader` that is reached from inside a project or from
Home: Project history, Library, User, Guide, Templates and a template draft. Use a
disposable project with some history.

Give an unfamiliar reviewer only the rendered page and this task:
“You opened this page from the editor. Say what the page is, then go back to where
you were.” Do not give the reviewer this rubric until their initial findings are recorded.

Capture the header at 480px and full width. Record how long the reviewer took to
find the way back, wrong turns, independence and untested pages in the local receipt.

## Grader rubric

Fail the affected page when any of these occurs:

- The way back is styled as text (small, uppercase, muted, or the same style as a
  label beside it) instead of a button with an arrow. A reviewer must find it in
  one look without reading every line.
- The header stacks three or more small label lines (back, project name, section)
  above the title, so the title is not the first thing read.
- The project name is uppercase or eyebrow-styled when it is the only context line;
  it sits under the title in normal case.
- A decorative icon tile competes with the title or the back button, pushing the
  heading off the content's left edge.
- The back button shares a line with the title and wraps differently at narrow widths.

Functional success (the link works) does not excuse a failed layout criterion.
Record pass/fail/unverified separately for each criterion, page and width.

## Scope

The rule belongs to the shared `PageHeader`: `back` takes `{ href, label }` and draws
the button, so callers cannot pass a text link. A page reached only from the dashboard
navigation may omit `back`.
