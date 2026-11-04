import type { ReactNode } from "react";

// Geist Sans renders "0" and capital "O" as near-identical shapes (see
// globals.css's .brandUrl comment — font-feature-settings/font-variant-numeric
// confirmed as no-ops on this font). .brandUrl's monospace swap already fixes
// every hardcoded occurrence of the brand string in the UI's own chrome, but
// nothing wraps it inside free text a user typed (a bio, a project title) —
// this does that: find literal "0dot"/"0dot.in" runs in `text` and wrap only
// those in .brandUrl, leaving the rest of the string in the surrounding font.
const BRAND_PATTERN = /0dot\.in|0dot/gi;

export function BrandText({ text }: { text: string }): ReactNode {
  const parts = text.split(BRAND_PATTERN);
  const matches = text.match(BRAND_PATTERN) ?? [];
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(part);
    if (matches[i]) {
      nodes.push(
        <span className="brandUrl" key={i}>
          {matches[i]}
        </span>
      );
    }
  });
  return nodes;
}
