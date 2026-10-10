"use client";

import { useId, useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { fileReport } from "@/app/actions/reports";
import { REPORT_CATEGORIES, type ReportCategory } from "@/lib/report-categories";

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  violence: "Violence",
  sexual_content: "Sexual content",
  ip_infringement: "Copyright/IP infringement",
  impersonation: "Impersonation",
  fraud: "Fraud",
  other: "Other",
};

// phase-12 spec §4.1: the one reusable report entry point every reportable
// subjectType renders instead of a bespoke report UI per content type.
// reporterId is never surfaced back to the reported party anywhere in this
// codebase (§4.2) — this component doesn't even know who owns the subject,
// only what it's reporting.
export function ReportButton({ subjectType, subjectId, small = true }: { subjectType: string; subjectId: string; small?: boolean }) {
  // One ReportButton per reportable item (every post in a feed, for one) —
  // a modal stays mounted in the DOM even while closed (Modal.tsx), so a
  // static id here duplicated across every instance on the page (Chrome's
  // "Duplicate form field id in the same form" warning). useId() gives each
  // instance its own.
  const categoryId = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await fileReport({ subjectType, subjectId, category, details });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setDetails("");
    showToast("Report submitted — a Trust & Safety reviewer will take a look.");
  }

  return (
    <>
      <button
        type="button"
        className={`button buttonSecondary${small ? " buttonSmall" : ""}`}
        onClick={() => setOpen(true)}
      >
        Report
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Report content">
        <div className="field">
          <label htmlFor={categoryId}>Reason</label>
          <select
            id={categoryId}
            className="textInput"
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory)}
          >
            {REPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={detailsId}>Details (optional)</label>
          <textarea
            id={detailsId}
            className="textInput"
            rows={3}
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        {error && <p className="errorText">{error}</p>}
        <div className="modalActions">
          <button type="button" className="button buttonSecondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="button buttonDanger" onClick={handleSubmit} disabled={pending}>
            {pending ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </Modal>
    </>
  );
}
