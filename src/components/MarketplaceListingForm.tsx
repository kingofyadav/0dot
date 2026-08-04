"use client";

import { useActionState, useState } from "react";
import { createMarketplaceListing, updateMarketplaceListing } from "@/app/actions/marketplace";

type BusinessOption = { id: string; name: string };
type Category = "theme" | "template" | "app";

// Mirrors lib/marketplace.ts's EMBED_PROVIDERS keys and theme token fields
// for client-side UX only — createMarketplaceListing/validateListingPayload
// (server-only) remain the authoritative check, this just keeps the form
// from submitting something that's guaranteed to be rejected.
const APP_PROVIDERS = ["youtube", "vimeo", "spotify", "soundcloud", "x", "codepen"] as const;

type ExistingListing = {
  id: string;
  category: Category;
  title: string;
  description: string;
  price: number | null;
  currency: string | null;
  payload: string; // raw JSON text, as stored
};

function parsePayload(category: Category, raw: string | undefined) {
  let parsed: Record<string, unknown> = {};
  try {
    if (raw) parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  if (category === "theme") {
    return {
      accent: typeof parsed.accent === "string" ? parsed.accent : "#6366f1",
      accentStrong: typeof parsed.accentStrong === "string" ? parsed.accentStrong : "#4338ca",
      accentSoft: typeof parsed.accentSoft === "string" ? parsed.accentSoft : "#e0e7ff",
    };
  }
  if (category === "app") {
    const provider = APP_PROVIDERS.includes(parsed.provider as (typeof APP_PROVIDERS)[number])
      ? (parsed.provider as (typeof APP_PROVIDERS)[number])
      : "youtube";
    return { provider, embedUrl: typeof parsed.embedUrl === "string" ? parsed.embedUrl : "" };
  }
  return { json: raw ?? "{}" };
}

// Same "one form, create-vs-edit reuse" shape as OfferingForm/ReviewForm —
// category (and seller) can't change on edit, updateMarketplaceListing only
// ever reads title/description/price/currency/payload for an existing row.
export function MarketplaceListingForm({
  businesses,
  existing,
}: {
  businesses: BusinessOption[];
  existing?: ExistingListing;
}) {
  const isEdit = Boolean(existing);
  const [state, formAction, pending] = useActionState(isEdit ? updateMarketplaceListing : createMarketplaceListing, undefined);
  const [sellerType, setSellerType] = useState<"user" | "business">("user");
  const [category] = useState<Category>(existing?.category ?? "theme");
  const initial = parsePayload(category, existing?.payload);
  const [themeAccent, setThemeAccent] = useState((initial as { accent: string }).accent ?? "#6366f1");
  const [themeAccentStrong, setThemeAccentStrong] = useState((initial as { accentStrong: string }).accentStrong ?? "#4338ca");
  const [themeAccentSoft, setThemeAccentSoft] = useState((initial as { accentSoft: string }).accentSoft ?? "#e0e7ff");
  const [appProvider, setAppProvider] = useState<(typeof APP_PROVIDERS)[number]>(
    (initial as { provider: (typeof APP_PROVIDERS)[number] }).provider ?? "youtube"
  );
  const [appEmbedUrl, setAppEmbedUrl] = useState((initial as { embedUrl: string }).embedUrl ?? "");
  const [templateJson, setTemplateJson] = useState((initial as { json: string }).json ?? "{}");
  const [categorySelectable, setCategorySelectable] = useState<Category>(category);

  const activeCategory = isEdit ? category : categorySelectable;
  const payload =
    activeCategory === "theme"
      ? JSON.stringify({ accent: themeAccent, accentStrong: themeAccentStrong, accentSoft: themeAccentSoft })
      : activeCategory === "app"
        ? JSON.stringify({ provider: appProvider, embedUrl: appEmbedUrl })
        : templateJson;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "40ch" }}>
      <input type="hidden" name="payload" value={payload} />
      {isEdit && <input type="hidden" name="listingId" value={existing!.id} />}

      {!isEdit && (
        <>
          <label className="mutedText" style={{ fontSize: "0.85rem" }}>
            Selling as
          </label>
          <select
            name="sellerType"
            value={sellerType}
            onChange={(e) => setSellerType(e.target.value as typeof sellerType)}
            className="textInput"
          >
            <option value="user">Myself</option>
            {businesses.length > 0 && <option value="business">A business I manage</option>}
          </select>
        </>
      )}

      {!isEdit && sellerType === "business" && (
        <select name="sellerBusinessId" required defaultValue="" className="textInput">
          <option value="" disabled>
            Choose a business
          </option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {!isEdit && (
        <>
          <label className="mutedText" style={{ fontSize: "0.85rem" }}>
            Category
          </label>
          <select
            name="category"
            value={categorySelectable}
            onChange={(e) => setCategorySelectable(e.target.value as Category)}
            className="textInput"
          >
            <option value="theme">Theme</option>
            <option value="template">Template</option>
            <option value="app">App (embed widget)</option>
          </select>
        </>
      )}

      <input type="text" name="title" placeholder="Title" defaultValue={existing?.title} maxLength={120} required className="textInput" />
      <textarea
        name="description"
        placeholder="Description"
        defaultValue={existing?.description}
        maxLength={5000}
        rows={3}
        className="textInput"
      />

      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          type="text"
          name="price"
          placeholder="Price (optional — blank = free)"
          defaultValue={existing?.price ?? ""}
          inputMode="decimal"
          className="textInput"
          style={{ flex: 1 }}
        />
        <input
          type="text"
          name="currency"
          placeholder="USD"
          defaultValue={existing?.currency ?? ""}
          maxLength={3}
          className="textInput"
          style={{ width: "5rem" }}
        />
      </div>

      {activeCategory === "theme" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label className="mutedText" style={{ fontSize: "0.8rem" }}>
            Theme tokens (spec §4.1 — the same fixed token set Phase 1 profile theming uses, not custom CSS)
          </label>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input type="color" value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} aria-label="Accent" />
            <input type="color" value={themeAccentStrong} onChange={(e) => setThemeAccentStrong(e.target.value)} aria-label="Accent (strong)" />
            <input type="color" value={themeAccentSoft} onChange={(e) => setThemeAccentSoft(e.target.value)} aria-label="Accent (soft)" />
          </div>
        </div>
      )}

      {activeCategory === "app" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label className="mutedText" style={{ fontSize: "0.8rem" }}>
            Embed widget (spec §4.2 — an allowlisted provider only, never raw HTML/JS)
          </label>
          <select value={appProvider} onChange={(e) => setAppProvider(e.target.value as typeof appProvider)} className="textInput">
            {APP_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Embed URL"
            value={appEmbedUrl}
            onChange={(e) => setAppEmbedUrl(e.target.value)}
            className="textInput"
          />
        </div>
      )}

      {activeCategory === "template" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label className="mutedText" style={{ fontSize: "0.8rem" }}>
            Template content (JSON starter data, spec §4.4 — applied through the normal creation form for
            whatever it prefills, never a bulk-insert bypass)
          </label>
          <textarea
            value={templateJson}
            onChange={(e) => setTemplateJson(e.target.value)}
            rows={6}
            className="textInput"
            style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
          />
        </div>
      )}

      {isEdit && (
        <p className="mutedText" style={{ fontSize: "0.8rem" }}>
          Saving sends this back to pending review (spec §4.5) — it&apos;s hidden from purchase/install again
          until a moderator re-approves it.
        </p>
      )}

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Submitting…" : isEdit ? "Save & resubmit for review" : "Submit for review"}
      </button>
    </form>
  );
}
