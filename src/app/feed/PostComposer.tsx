"use client";

import { useState } from "react";
import { ComposeBox } from "./ComposeBox";
import { PollComposeForm } from "./PollComposeForm";

// Lifts the poll show/hide state above ComposeBox/PollComposeForm — the two
// stay separate <form>s (a poll's compose shape is structurally different,
// see PollComposeForm's own comment; nesting it inside ComposeBox's <form>
// would be invalid HTML), but their toggle now lives inside ComposeBox's
// own action row instead of below it as an unrelated <details> block.
// Shared by /feed, /explore, /trending (FeedList) and community feeds
// (CommunityFeedList) — the one place both composers are offered together.
export function PostComposer({
  communityId,
  flairs,
  postableBusinesses,
  ownTiers,
}: {
  communityId?: string;
  flairs?: { id: string; label: string }[];
  postableBusinesses?: { id: string; name: string }[];
  ownTiers?: { id: string; name: string }[];
}) {
  const [showPoll, setShowPoll] = useState(false);

  return (
    <>
      <ComposeBox
        communityId={communityId}
        flairs={flairs}
        postableBusinesses={postableBusinesses}
        ownTiers={ownTiers}
        showPoll={showPoll}
        onTogglePoll={() => setShowPoll((v) => !v)}
      />
      {showPoll && <PollComposeForm communityId={communityId} flairs={flairs} />}
    </>
  );
}
