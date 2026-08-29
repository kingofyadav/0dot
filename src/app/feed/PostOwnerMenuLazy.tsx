"use client";

import dynamic from "next/dynamic";

// Same reasoning as AccountMenuLazy.tsx: PostCard is a Server Component, so
// the dynamic import has to happen in this thin client wrapper for the
// code-split to actually take effect.
export const PostOwnerMenu = dynamic(() => import("./PostOwnerMenu").then((m) => m.PostOwnerMenu));
