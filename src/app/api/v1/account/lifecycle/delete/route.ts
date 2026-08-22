// Same state transition as deactivate (see that route's comment, mirroring
// account-lifecycle.ts's own scheduleDeactivation) — "deactivate" and
// "request deletion" differ only in which UI screen/confirmation copy the
// client shows, not in what happens server-side, so this re-exports rather
// than duplicating the handler.
export { POST } from "../deactivate/route";
