// Small green "online" badge overlaid on an avatar — direct conversations
// only (see getConversationDisplayInfo's otherUserId: null for groups, there
// being no single "other person" to badge). Purely a function of a boolean
// computed server-side (presence.ts's isUserOnline), so unlike
// PresenceStatus's relative-time text this needs no client-side deferral —
// "online right now" can't itself cause a hydration mismatch.
export function PresenceDot({ online }: { online: boolean }) {
  if (!online) return null;
  return <span className="presenceDot" aria-hidden="true" />;
}
