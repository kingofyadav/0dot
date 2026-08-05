"use client";

import { useState } from "react";
import { recordAISuggestionDecision, type AISuggestionResult } from "@/app/actions/ai-content";

// phase-11 spec §5.1: a suggestion is only ever inserted into the caller's
// own existing textarea (via onInsert) for the user to review/edit and
// submit through that surface's normal validated action — this component
// never submits anything on its own. accepted is recorded (§5.3) on
// Insert/Discard, distinct from mere generation.
export function AISuggestButton({
  label,
  contextLabel,
  contextPlaceholder,
  generate,
  onInsert,
}: {
  label: string;
  contextLabel: string;
  contextPlaceholder?: string;
  generate: (context: string) => Promise<AISuggestionResult>;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ generationId: string; text: string } | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    const result = await generate(context);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSuggestion(result);
  }

  async function handleInsert() {
    if (!suggestion) return;
    onInsert(suggestion.text);
    setSuggestion(null);
    setOpen(false);
    await recordAISuggestionDecision(suggestion.generationId, true);
  }

  async function handleDiscard() {
    if (!suggestion) return;
    const id = suggestion.generationId;
    setSuggestion(null);
    await recordAISuggestionDecision(id, false);
  }

  if (!open) {
    return (
      <button type="button" className="button buttonSecondary buttonSmall" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="field" style={{ border: "1px solid var(--border, #333)", borderRadius: 8, padding: "0.6rem" }}>
      <label>{contextLabel}</label>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input
          className="textInput"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={contextPlaceholder}
          style={{ flex: 1, minWidth: "10ch" }}
        />
        <button type="button" className="button buttonSmall" onClick={handleGenerate} disabled={pending}>
          {pending ? "Thinking…" : "Generate"}
        </button>
        <button
          type="button"
          className="button buttonSecondary buttonSmall"
          onClick={() => {
            setOpen(false);
            setSuggestion(null);
            setError(null);
          }}
        >
          Close
        </button>
      </div>
      {error && <p className="errorText">{error}</p>}
      {suggestion && (
        <div style={{ marginTop: "0.5rem" }}>
          <p className="mutedText" style={{ whiteSpace: "pre-wrap" }}>
            {suggestion.text}
          </p>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button type="button" className="button buttonSmall" onClick={handleInsert}>
              Insert
            </button>
            <button type="button" className="button buttonSecondary buttonSmall" onClick={handleDiscard}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
