"use client";

import { useState, useTransition } from "react";
import { requestLessonFileUrl } from "@/app/actions/courses";

// spec §11: same "server action called directly from onClick, not a form"
// shape as DigitalProductCard's download button — video plays inline via
// the resolved token URL (streamProtectedFile serves it with
// Content-Disposition: inline for content_type=video), a download lesson
// just navigates to the token URL directly.
export function LessonFileButton({ lessonId, contentType }: { lessonId: string; contentType: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await requestLessonFileUrl(lessonId);
      if ("error" in result) setError(result.error);
      else if (contentType === "video") setUrl(result.url);
      else window.location.href = result.url;
    });
  }

  if (url) {
    return <video controls src={url} style={{ width: "100%", maxWidth: "480px", borderRadius: "10px" }} />;
  }

  return (
    <>
      <button type="button" className="button buttonSmall" onClick={handleClick} disabled={isPending}>
        {isPending ? "Loading…" : contentType === "video" ? "Play" : "Download"}
      </button>
      {error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{error}</p>}
    </>
  );
}
