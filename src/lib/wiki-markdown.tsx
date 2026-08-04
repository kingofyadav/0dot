import type { ReactNode } from "react";

// Hand-rolled safe markdown SUBSET, built the same way linkifyPostBody
// (src/lib/linkify.tsx) turns regex matches into React nodes — never
// dangerouslySetInnerHTML, so there's no sanitizer to get wrong or fall
// behind on. Deliberately not full CommonMark: headers, bold, italic,
// inline code, bullet lists, paragraphs, and http(s)-only links. No
// tables/images/nested lists/blockquotes — a documented scope limit (phase-3
// spec §10.1's "sanitized markdown, never raw HTML"), not an oversight,
// matching this codebase's "no new dependency" posture (see
// message-events.ts) rather than adding a markdown+sanitizer library pair.

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Links first (they can contain the bold/italic/code delimiter characters
  // in their label), then bold/italic/code over what's left.
  const parts = text.split(LINK_PATTERN);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    if (plain) nodes.push(...renderEmphasis(plain, `${keyPrefix}-t${i}`));

    const linkLabel = parts[i + 1];
    const linkUrl = parts[i + 2];
    if (linkLabel !== undefined && linkUrl !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-l${i}`} href={linkUrl} target="_blank" rel="noopener noreferrer">
          {linkLabel}
        </a>
      );
    }
  }

  return nodes;
}

function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  // Single pass, longest-delimiter-first (** before *) so bold isn't
  // mis-split into two italics — a plain, non-nested subset, not a real
  // parser (no bold-inside-italic or vice versa).
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return segments
    .filter((s) => s.length > 0)
    .map((segment, index) => {
      const key = `${keyPrefix}-e${index}`;
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return <strong key={key}>{segment.slice(2, -2)}</strong>;
      }
      if (segment.startsWith("*") && segment.endsWith("*")) {
        return <em key={key}>{segment.slice(1, -1)}</em>;
      }
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return <code key={key}>{segment.slice(1, -1)}</code>;
      }
      return segment;
    });
}

// Blank-line-separated blocks; each block is either a heading, a bullet
// list (consecutive "- " lines), or a paragraph.
export function renderWikiMarkdown(rawBody: string): ReactNode[] {
  // Every textarea this renders content from is a plain uncontrolled
  // <textarea> submitted as normal form data — the HTML spec requires
  // form submission to normalize textarea line breaks to CRLF, so a
  // multi-paragraph body arrives here as "\r\n\r\n", not "\n\n". Without
  // this normalization, \n{2,} never matches (the \n's aren't adjacent)
  // and the whole body collapses into a single paragraph.
  const body = rawBody.replace(/\r\n/g, "\n");
  const blocks = body.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    const key = `block-${blockIndex}`;

    const headingMatch = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.*)$/) : null;
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2], key);
      if (level === 1) return <h2 key={key}>{content}</h2>;
      if (level === 2) return <h3 key={key}>{content}</h3>;
      return <h4 key={key}>{content}</h4>;
    }

    const isList = lines.every((l) => l.trim().startsWith("- "));
    if (isList) {
      return (
        <ul key={key}>
          {lines.map((line, lineIndex) => (
            <li key={`${key}-${lineIndex}`}>{renderInline(line.trim().slice(2), `${key}-${lineIndex}`)}</li>
          ))}
        </ul>
      );
    }

    return <p key={key}>{renderInline(lines.join(" "), key)}</p>;
  });
}
