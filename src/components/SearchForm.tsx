// Shared search entry point — native GET form, works without JS. Used by
// NavLinks (sidebar/mobile menu) and the desktop top header, per
// NAVIGATION.md's "top search belongs in the persistent header."
export function SearchForm() {
  return (
    <form action="/search" method="GET" role="search" className="siteHeaderSearch">
      <input
        type="search"
        name="q"
        placeholder="Search…"
        aria-label="Search"
        className="textInput"
      />
    </form>
  );
}
