"use client";

import { useState, useTransition } from "react";
import { requestPublishedFileDownloadUrl } from "@/app/actions/published-files";

// Mirrors LessonFileButton.tsx: server action called directly from
// onClick, not a form — used only for the gated (private/unlisted) path.
// The public path is a plain <a href> to the stable /uploads URL and never
// needs this component at all.
export function PublishedFileDownloadButton({ fileId }: { fileId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await requestPublishedFileDownloadUrl(fileId);
      if ("error" in result) setError(result.error);
      else window.location.href = result.url;
    });
  }

  return (
    <>
      <button type="button" className="button buttonSecondary buttonSmall" onClick={handleClick} disabled={isPending}>
        {isPending ? "Preparing…" : "Download"}
      </button>
      {error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{error}</p>}
    </>
  );
}
