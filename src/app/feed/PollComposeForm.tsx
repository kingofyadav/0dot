"use client";

import { useActionState, useRef, useState } from "react";
import { X } from "lucide-react";
import { createPollPost } from "@/app/actions/polls";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const DURATIONS = [
  { value: "60", label: "1 hour" },
  { value: "1440", label: "1 day" },
  { value: "4320", label: "3 days" },
  { value: "10080", label: "7 days" },
];

// Separate from ComposeBox (src/app/feed/ComposeBox.tsx) — a poll's compose
// flow is structurally different (dynamic option inputs, a duration/
// multi-choice picker, no attachments) rather than another branch bolted
// onto that already-multi-shaped component, mirroring createPollPost being
// its own action instead of a createPost branch (src/app/actions/polls.ts).
export function PollComposeForm({
  communityId,
  flairs,
}: {
  communityId?: string;
  flairs?: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(createPollPost, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // Keyed by a stable client-generated id (nextOptionId ref), not array
  // index — removing an option used to shift every later option's index,
  // so React reused the wrong DOM node's key and focus landed on the wrong
  // input after a removal. Every input is fully controlled (value={...}),
  // so this was never a stale-value bug, just a focus/identity glitch.
  const nextOptionId = useRef(2);
  const [options, setOptions] = useState([
    { id: 0, value: "" },
    { id: 1, value: "" },
  ]);

  function updateOption(id: number, value: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, value } : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, { id: nextOptionId.current++, value: "" }]));
  }

  function removeOption(id: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((o) => o.id !== id)));
  }

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
        nextOptionId.current = 2;
        setOptions([
          { id: 0, value: "" },
          { id: 1, value: "" },
        ]);
      }}
      className="authCard"
      style={{ maxWidth: "none", marginBottom: "1.5rem" }}
    >
      {communityId && <input type="hidden" name="communityId" value={communityId} />}
      {communityId && flairs && flairs.length > 0 && (
        <select name="flairId" defaultValue="" className="textInput" style={{ marginBottom: "0.5rem" }}>
          <option value="">No flair</option>
          {flairs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      )}
      <textarea name="body" placeholder="Ask a question…" maxLength={500} rows={2} className="textInput" />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
        {options.map((option, index) => (
          <div key={option.id} style={{ display: "flex", gap: "0.4rem" }}>
            <input
              type="text"
              name="option"
              value={option.value}
              onChange={(e) => updateOption(option.id, e.target.value)}
              placeholder={`Option ${index + 1}`}
              maxLength={80}
              className="textInput"
              style={{ flex: 1 }}
            />
            {options.length > MIN_OPTIONS && (
              <button
                type="button"
                onClick={() => removeOption(option.id)}
                className="button buttonSecondary iconButton"
                aria-label="Remove option"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button type="button" onClick={addOption} className="button buttonSecondary buttonSmall" style={{ alignSelf: "flex-start" }}>
            Add option
          </button>
        )}
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
          <select name="durationMinutes" defaultValue="1440" className="textInput" style={{ width: "auto" }}>
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <label className="mutedText" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <input type="checkbox" name="allowsMultipleChoice" />
            Allow multiple choices
          </label>
        </span>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Posting…" : "Create poll"}
        </button>
      </div>
    </form>
  );
}
