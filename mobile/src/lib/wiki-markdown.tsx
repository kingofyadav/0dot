import type { ReactNode } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { type Theme } from "../theme";

// Mobile port of src/lib/wiki-markdown.tsx (web) — same hand-rolled safe
// markdown SUBSET (headers, bold, italic, inline code, bullet lists,
// paragraphs, http(s)-only links; no tables/images/nested lists/
// blockquotes/HTML), same regex rules, so content renders identically on
// both platforms. Never a WebView/HTML render — Article/Book/WikiPage
// bodies are markdown text, not HTML, so there's nothing to sandbox.
// RN has no CSS classes, so this takes a `theme` and returns styled
// <Text>/<View> trees instead of tagged elements. Keep this file's
// regex/block logic in sync with the web one by inspection if either
// changes.

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    h2: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginBottom: theme.space[1] },
    h3: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginBottom: theme.space[1] },
    h4: { fontSize: theme.text.base, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginBottom: theme.space[1] },
    paragraph: { fontSize: theme.text.base, color: theme.colors.foreground, lineHeight: theme.text.base * 1.45 },
    list: { gap: theme.space[1] },
    listItemRow: { flexDirection: "row", gap: theme.space[2] },
    bullet: { fontSize: theme.text.base, color: theme.colors.mutedForeground },
    listItemText: { flex: 1, fontSize: theme.text.base, color: theme.colors.foreground, lineHeight: theme.text.base * 1.45 },
    link: { color: theme.colors.accent, textDecorationLine: "underline" },
    bold: { fontWeight: theme.weight.emphasis },
    italic: { fontStyle: "italic" },
    code: { fontFamily: "monospace", backgroundColor: theme.colors.surface },
  });
}

function renderInline(text: string, keyPrefix: string, styles: ReturnType<typeof createStyles>): ReactNode[] {
  // Links first (they can contain the bold/italic/code delimiter characters
  // in their label), then bold/italic/code over what's left.
  const parts = text.split(LINK_PATTERN);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    if (plain) nodes.push(...renderEmphasis(plain, `${keyPrefix}-t${i}`, styles));

    const linkLabel = parts[i + 1];
    const linkUrl = parts[i + 2];
    if (linkLabel !== undefined && linkUrl !== undefined) {
      nodes.push(
        <Text key={`${keyPrefix}-l${i}`} style={styles.link} onPress={() => Linking.openURL(linkUrl).catch(() => {})}>
          {linkLabel}
        </Text>
      );
    }
  }

  return nodes;
}

function renderEmphasis(text: string, keyPrefix: string, styles: ReturnType<typeof createStyles>): ReactNode[] {
  // Single pass, longest-delimiter-first (** before *) so bold isn't
  // mis-split into two italics — a plain, non-nested subset, not a real
  // parser (no bold-inside-italic or vice versa).
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return segments
    .filter((s) => s.length > 0)
    .map((segment, index) => {
      const key = `${keyPrefix}-e${index}`;
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return (
          <Text key={key} style={styles.bold}>
            {segment.slice(2, -2)}
          </Text>
        );
      }
      if (segment.startsWith("*") && segment.endsWith("*")) {
        return (
          <Text key={key} style={styles.italic}>
            {segment.slice(1, -1)}
          </Text>
        );
      }
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return (
          <Text key={key} style={styles.code}>
            {segment.slice(1, -1)}
          </Text>
        );
      }
      return segment;
    });
}

// Blank-line-separated blocks; each block is either a heading, a bullet
// list (consecutive "- " lines), or a paragraph. Content here always
// arrives as a plain string from a JSON API response (not a submitted
// <textarea>), so — unlike the web version — there's no CRLF normalization
// concern; \n{2,} already matches real paragraph breaks.
//
// Returns a flat array of block-level <Text>/<View> elements with no
// margin of their own — wrap the result in a <View style={{gap: ...}}>
// (or similar) at the call site for inter-block spacing, same as any other
// list of sibling elements in this codebase's screens.
export function renderWikiMarkdown(rawBody: string, theme: Theme): ReactNode[] {
  const styles = createStyles(theme);
  const blocks = rawBody.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  return blocks.flatMap((block, blockIndex) => {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    const key = `block-${blockIndex}`;

    const headingMatch = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.*)$/) : null;
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2], key, styles);
      const style = level === 1 ? styles.h2 : level === 2 ? styles.h3 : styles.h4;
      return [
        <Text key={key} style={style}>
          {content}
        </Text>,
      ];
    }

    // Group consecutive lines by whether they're a "- " list item — see
    // the web file's comment on why this is a run-grouping pass, not an
    // all-or-nothing check on the whole block.
    const runs: { isList: boolean; lines: string[] }[] = [];
    for (const line of lines) {
      const isListLine = line.trim().startsWith("- ");
      const currentRun = runs[runs.length - 1];
      if (currentRun && currentRun.isList === isListLine) {
        currentRun.lines.push(line);
      } else {
        runs.push({ isList: isListLine, lines: [line] });
      }
    }

    return runs.map((run, runIndex) => {
      const runKey = `${key}-r${runIndex}`;
      if (run.isList) {
        return (
          <View key={runKey} style={styles.list}>
            {run.lines.map((line, lineIndex) => (
              <View key={`${runKey}-${lineIndex}`} style={styles.listItemRow}>
                <Text style={styles.bullet}>{"•"}</Text>
                <Text style={styles.listItemText}>{renderInline(line.trim().slice(2), `${runKey}-${lineIndex}`, styles)}</Text>
              </View>
            ))}
          </View>
        );
      }
      return (
        <Text key={runKey} style={styles.paragraph}>
          {renderInline(run.lines.join(" "), runKey, styles)}
        </Text>
      );
    });
  });
}
