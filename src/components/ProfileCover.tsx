// Shared cover-with-fallback for profile/business/community header cards:
// a real coverUrl renders as an image, no coverUrl falls back to a
// theme-aware default cover (replaces the plain gradient
// .profileCoverPlaceholder). Served from /public/defaults, not /uploads —
// the /uploads/[...path] route 307-redirects everything to Vercel Blob
// storage, and this asset was never actually written there, so it 404'd
// ("Blob not found") for every new signup.
//
// Theme-aware, the same way the logo is (Logo.tsx / .themeLogo* in
// globals.css): both variants render, CSS shows the one matching the active
// prefers-color-scheme / data-theme. Unlike the logo's deliberately-reversed
// pairing, the cover uses the natural one — the dark cover in dark mode.
const DEFAULT_COVER_LIGHT = "/defaults/profile-cover-light.jpg";
const DEFAULT_COVER_DARK = "/defaults/profile-cover-dark.jpg";

export function ProfileCover({ src }: { src: string | null }) {
  return (
    <div className="profileCover">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img src={src} alt="" className="profileCoverImg" />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped local asset, sized by CSS */}
          <img src={DEFAULT_COVER_LIGHT} alt="" className="profileCoverImg themeCoverLight" />
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped local asset, sized by CSS */}
          <img src={DEFAULT_COVER_DARK} alt="" className="profileCoverImg themeCoverDark" />
        </>
      )}
    </div>
  );
}
