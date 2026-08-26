"use client";

import { useState } from "react";
import { translateArticle } from "@/app/actions/ai-translate";

const LANGUAGES = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
];

// phase-11 spec §9: on-demand, cached per source revision — this button
// just calls the shared translateArticle action and shows the result
// alongside the original, it holds no translation logic of its own.
export function TranslateArticleButton({ articleId }: { articleId: string }) {
  // The value sent to the server (and used as the cache key in
  // ContentTranslation.targetLanguage) is the full language name
  // ("Spanish"), not its ISO code ("es") — the code went straight into the
  // model prompt ("Translate the given text to es") unambiguously enough
  // that Claude usually still guessed right, but not reliably enough to
  // trust, and a wrong guess had no error path to catch it (see
  // getOrCreateTranslation's now-removed silent original-text fallback).
  // The label is unambiguous either way and reads fine as a cache key too.
  const [language, setLanguage] = useState(LANGUAGES[0].label);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<string | null>(null);

  async function handleTranslate() {
    setPending(true);
    setError(null);
    const result = await translateArticle(articleId, language);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setTranslated(result.text);
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <select
          className="textInput"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            setTranslated(null);
          }}
          style={{ width: "auto" }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.label}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="button" className="button buttonSecondary buttonSmall" onClick={handleTranslate} disabled={pending}>
          {pending ? "Translating…" : "Translate"}
        </button>
      </div>
      {error && <p className="errorText">{error}</p>}
      {translated && (
        <div className="mutedText" style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", borderLeft: "2px solid var(--border)", paddingLeft: "0.6rem" }}>
          {translated}
        </div>
      )}
    </div>
  );
}
