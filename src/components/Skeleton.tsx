// Lightweight streaming placeholders for Server Components that were moved
// behind <Suspense> so their network work stops blocking the page shell
// (see RootLayout and SiteHeader). Styling lives in globals.css
// (.skeletonBlock) so these stay dependency-free server components.

export function Skeleton({
  width,
  height,
  radius,
  style,
}: {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="skeletonBlock"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

// Fallback for the ContextualRail (right column on every chromed route).
// Mirrors the real rail's outer container so it lands in the same grid
// area with the same sticky/border treatment (body.hasRail .contextualRail
// in globals.css).
export function ContextualRailSkeleton() {
  return (
    <div className="contextualRail" aria-busy="true" aria-label="Loading sidebar">
      {[0, 1].map((section) => (
        <section className="railSection" key={section}>
          <Skeleton height="0.9rem" width="45%" style={{ marginBottom: "0.75rem" }} />
          <div className="stack">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} height="2.25rem" style={{ display: "block" }} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// Fallback for the header's async icon cluster (messages + notifications
// badges). Two circular blanks the size of the real icon buttons.
export function HeaderIconsSkeleton() {
  return (
    <span style={{ display: "inline-flex", gap: "0.5rem" }} aria-hidden="true">
      <Skeleton width="2rem" height="2rem" radius="50%" />
      <Skeleton width="2rem" height="2rem" radius="50%" />
    </span>
  );
}
