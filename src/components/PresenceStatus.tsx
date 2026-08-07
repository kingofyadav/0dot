"use client";

import { useEffect, useState } from "react";

function formatLastActive(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Active just now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days}d ago`;
  return `Active ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// Conversation-header presence line ("Active now" / "Active 5m ago").
// Same hydration-mismatch avoidance as MessageBubble's MessageTimestamp:
// relative time depends on wall-clock time at render, which can differ
// between the server render and client hydration — deferring the text to a
// post-mount effect keeps the hydration-time DOM (empty) identical on both
// sides instead of racing the clock.
export function PresenceStatus({ online, lastActiveAt }: { online: boolean; lastActiveAt: Date }) {
  const [text, setText] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(online ? "Active now" : formatLastActive(lastActiveAt));
  }, [online, lastActiveAt]);

  if (!text) return null;
  return (
    <span className="mutedText presenceStatusLine">
      {online && <span className="presenceDot presenceDotInline" aria-hidden="true" />}
      {text}
    </span>
  );
}
