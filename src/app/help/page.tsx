import type { Metadata } from "next";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { loadHelpGuide } from "@/lib/help-content";

export const metadata: Metadata = {
  title: "Help",
  description: "Everything 0dot can do — profile, posting, communities, monetization, wallet, and more.",
};

// Not in route-context.ts's CHROMELESS_PATHS: unlike /about and /download
// (anonymous-only marketing pages with their own MarketingNav), this page is
// read by both signed-in users looking up a feature and prospects arriving
// from the marketing footer while signed out — the same "everyone, session
// state varies" audience /dmca and /trust-safety already serve inside the
// normal SiteHeader/Sidebar shell (SiteHeader itself renders a graceful
// anonymous state, same as /explore). Rendering MarketingNav here too, on
// top of that shell, was a double-header bug — see git history.
// renderWikiMarkdown maps "#"->h2, "##"->h3 (it expects a document's own
// "# Title" line to become the page's one real <h2> section opener). Here
// the "# Title" line is already consumed above for the hero's own <h1>, so
// without this the guide's "##" sections would render starting at <h3>,
// skipping <h2> entirely — Lighthouse's heading-order audit caught exactly
// that. Shifting every heading up one level (##->#, ###->##) keeps this
// page's heading tree sequential (h1, then h2 sections) without touching
// the shared renderer's level mapping, which every other call site already
// relies on being unchanged.
function promoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,3})(\s)/gm, (_match, hashes: string, space: string) => hashes.slice(1) + space);
}

export default async function HelpPage() {
  const { title, body, sections } = await loadHelpGuide();
  const renderedBody = promoteHeadings(body);

  return (
    <div className="helpPage">
      <header className="helpHero">
        <span className="eyebrow">Help</span>
        <h1 className="display-3">{title}</h1>
        <p>One guide to everything 0dot can do. Jump to a section, or read straight through.</p>
      </header>

      {sections.length > 0 && (
        <nav aria-label="Guide sections">
          <p className="helpTocHeading">On this page</p>
          <ul className="helpTocGrid">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="helpGuideBody">{renderWikiMarkdown(renderedBody)}</div>
    </div>
  );
}
