import defaultCover from "../../assets/default-cover.jpg";

// Mirrors src/app/[username]/page.tsx's DEFAULT_COVER_URL on the web app —
// same image, shown the same way (a display-time fallback when coverUrl is
// null, never written back to the profile) so a cover-less profile looks
// the same "on-brand" way on both platforms instead of mobile falling back
// to a flat, blank-looking tile.
export const DEFAULT_COVER_SOURCE = defaultCover;
