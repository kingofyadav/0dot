"use client";

import { useActionState } from "react";
import { createBusiness } from "@/app/actions/businesses";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";

export default function NewBusinessPage() {
  const [state, formAction, pending] = useActionState(createBusiness, undefined);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Create a business page</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Represents a company, not a person — post as the business, list products and jobs, take
        appointments. New pages go live immediately if your account email matches the business&apos;s
        website domain, or your profile is already verified; otherwise a platform admin reviews it first.
      </p>

      <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" maxLength={100} required />
        </div>

        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            name="slug"
            type="text"
            placeholder="your-business"
            pattern="[a-zA-Z0-9_]{3,40}"
            minLength={3}
            maxLength={40}
            required
          />
          <span className="mutedText">
            <span className="brandUrl">0dot.in</span>/b/your-business — this is permanent.
          </span>
        </div>

        <div className="field">
          <label htmlFor="tagline">Tagline</label>
          <input id="tagline" name="tagline" type="text" maxLength={140} />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" maxLength={2000} rows={4} />
        </div>

        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" required defaultValue="">
            <option value="" disabled>
              Choose a category
            </option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sizeRange">Company size</label>
          <select id="sizeRange" name="sizeRange" defaultValue="">
            <option value="">Prefer not to say</option>
            <option value="solo">Just me</option>
            <option value="2_10">2-10</option>
            <option value="11_50">11-50</option>
            <option value="51_200">51-200</option>
            <option value="201_1000">201-1000</option>
            <option value="1000_plus">1000+</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="foundedYear">Founded year</label>
          <input id="foundedYear" name="foundedYear" type="number" min={1800} max={new Date().getFullYear() + 1} />
        </div>

        <div className="field">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" placeholder="acme.com" maxLength={200} />
          <span className="mutedText">
            Matching this domain to your account email (you@acme.com) is one way to get approved instantly.
          </span>
        </div>

        <div className="field">
          <label htmlFor="email">Contact email</label>
          <input id="email" name="email" type="email" maxLength={200} />
        </div>

        <div className="field">
          <label htmlFor="phone">Contact phone</label>
          <input id="phone" name="phone" type="text" maxLength={40} />
        </div>

        <div className="field">
          <label htmlFor="logo">Logo</label>
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>

        <div className="field">
          <label htmlFor="cover">Cover image</label>
          <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>

        {state?.error && <p className="errorText">{state.error}</p>}

        <button type="submit" className="button" disabled={pending}>
          {pending ? "Creating…" : "Create business"}
        </button>
      </form>
    </div>
  );
}
