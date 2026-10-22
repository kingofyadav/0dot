import type { ReactNode } from "react";

// Hand-rolled safe markdown SUBSET, built the same way linkifyPostBody
// (src/lib/linkify.tsx) turns regex matches into React nodes — never
// dangerouslySetInnerHTML, so there's no sanitizer to get wrong or fall
// behind on. Deliberately not full CommonMark: headers, bold, italic,
// inline code, bullet and numbered lists, paragraphs, `---` rules, and
// http(s)-only links. No tables/images/nested lists/blockquotes — a
// documented scope limit (phase-3 spec §10.1's "sanitized markdown, never
// raw HTML"), not an oversight, matching this codebase's "no new
// dependency" posture (see message-events.ts) rather than adding a
// markdown+sanitizer library pair.

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
        <a key={`${keyPrefix}-l${i}`} href={linkUrl} target="_blank" rel="noopener noreferrer" className="wikiLink">
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

// Plain-text slug for a heading, so a long document (the help guide, a wiki
// page) can be deep-linked into by section instead of only by scrolling —
// shared with help-content.ts, which slugifies the same raw "## heading"
// lines to build a table of contents that has to land on exactly these ids.
// Strips the inline-markdown delimiters renderInline would otherwise turn
// into real emphasis/code (e.g. "Portfolio — `/p/`") before slugifying, so
// a backtick or asterisk in a heading doesn't end up baked into the id.
export function slugifyHeading(text: string): string {
  return text
    .replace(/[`*_]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  // Resets per renderWikiMarkdown call (one call = one document), so two
  // identically-titled headings in the same document still get distinct,
  // stable ids instead of colliding on the same anchor.
  const usedIds = new Map<string, number>();
  function headingId(text: string): string {
    const base = slugifyHeading(text) || "section";
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  }

  return blocks.flatMap((block, blockIndex) => {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    const key = `block-${blockIndex}`;

    if (lines.length === 1 && lines[0].trim() === "---") {
      return [<hr key={key} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1rem 0" }} />];
    }

    const headingMatch = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.*)$/) : null;
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2], key);
      const id = headingId(headingMatch[2]);
      if (level === 1) return [<h2 id={id} key={key}>{content}</h2>];
      if (level === 2) return [<h3 id={id} key={key}>{content}</h3>];
      return [<h4 id={id} key={key}>{content}</h4>];
    }

    // Group consecutive lines by whether they're a "- " list item, instead
    // of the previous all-or-nothing `lines.every(...)` check on the whole
    // block — that required every line in a blank-line-separated block to
    // be a bullet, so a block mixing an intro line immediately followed by
    // bullets (no blank line between them, a common way to naturally write
    // this) silently fell through to the paragraph branch and lost the
    // list formatting entirely instead of rendering the intro as its own
    // paragraph and the bullets as a real <ul>.
    type RunKind = "ul" | "ol" | "text";
    const ORDERED_MARKER = /^\d+\.\s/;
    const runs: { kind: RunKind; lines: string[] }[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const kind: RunKind = trimmed.startsWith("- ") ? "ul" : ORDERED_MARKER.test(trimmed) ? "ol" : "text";
      const currentRun = runs[runs.length - 1];
      if (currentRun && currentRun.kind === kind) {
        currentRun.lines.push(line);
      } else {
        runs.push({ kind, lines: [line] });
      }
    }

    return runs.map((run, runIndex) => {
      const runKey = `${key}-r${runIndex}`;
      if (run.kind === "ul") {
        return (
          <ul key={runKey}>
            {run.lines.map((line, lineIndex) => (
              <li key={`${runKey}-${lineIndex}`}>{renderInline(line.trim().slice(2), `${runKey}-${lineIndex}`)}</li>
            ))}
          </ul>
        );
      }
      if (run.kind === "ol") {
        return (
          <ol key={runKey}>
            {run.lines.map((line, lineIndex) => (
              <li key={`${runKey}-${lineIndex}`}>{renderInline(line.trim().replace(ORDERED_MARKER, ""), `${runKey}-${lineIndex}`)}</li>
            ))}
          </ol>
        );
      }
      return <p key={runKey}>{renderInline(run.lines.join(" "), runKey)}</p>;
    });
  });
}
