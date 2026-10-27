import type { ReactNode } from "react";

/**
 * Readable agent text: paragraphs, bullet and numbered lists, short headings, code
 * blocks, **bold** and `code`. Deliberately small; anything else stays plain text, and
 * a partially streamed reply renders the same way as a finished one.
 */
export function ChatText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/^```[^\n]*\n?/m);
  parts.forEach((part, index) => {
    // Odd parts sit between fences (an unclosed fence while streaming stays a code block).
    if (index % 2) { blocks.push(<pre key={`code-${index}`}><code>{part.replace(/\n$/, "")}</code></pre>); return; }
    part.split(/\n{2,}/).forEach((block, blockIndex) => {
      const lines = block.split("\n").filter(line => line.trim());
      if (!lines.length) return;
      const key = `${index}-${blockIndex}`;
      if (lines.every(line => /^\s*[-*•]\s+/.test(line))) {
        blocks.push(<ul key={key}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</li>)}</ul>);
      } else if (lines.every(line => /^\s*\d+[.)]\s+/.test(line))) {
        blocks.push(<ol key={key} start={Number(/\d+/.exec(lines[0])![0])}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>);
      } else if (lines.length === 1 && /^#{1,4}\s+/.test(lines[0])) {
        blocks.push(<p key={key} className="chat-text-heading">{inline(lines[0].replace(/^#{1,4}\s+/, ""))}</p>);
      } else {
        blocks.push(<p key={key}>{lines.flatMap((line, i) => i ? [<br key={`br-${i}`} />, inline(line, i)] : [inline(line, i)])}</p>);
      }
    });
  });
  return <div className="chat-text">{blocks}</div>;
}

function inline(text: string, key: number | string = 0): ReactNode {
  return <span key={key}>{text.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code>
        : part)}</span>;
}
