"use client";

import dynamic from "next/dynamic";

// Same reasoning as AccountMenuLazy.tsx: both call sites (ConversationListItem,
// messages/[conversationId]/page.tsx) are Server Components, so the dynamic
// import has to happen in this thin client wrapper for the code-split to
// actually take effect.
export const ConversationRowMenu = dynamic(() => import("./ConversationRowMenu").then((m) => m.ConversationRowMenu));
