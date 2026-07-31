"use client";

import { useActionState } from "react";
import { updateBusiness } from "@/app/actions/businesses";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";

export function ManageBusinessForm({
  businessId,
  name,
  tagline,
  description,
  category,
  sizeRange,
  foundedYear,
  logoUrl,
  coverUrl,
  email,
  phone,
  website,
}: {
  businessId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  sizeRange: string | null;
  foundedYear: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateBusiness, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <input type="hidden" name="businessId" value={businessId} />

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" defaultValue={name} maxLength={100} required />
      </div>

      <div className="field">
        <label htmlFor="tagline">Tagline</label>
        <input id="tagline" name="tagline" type="text" defaultValue={tagline} maxLength={140} />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" defaultValue={description} maxLength={2000} rows={4} />
      </div>

      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" name="category" defaultValue={category}>
          {BUSINESS_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="sizeRange">Company size</label>
        <select id="sizeRange" name="sizeRange" defaultValue={sizeRange ?? ""}>
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
        <input
          id="foundedYear"
          name="foundedYear"
          type="number"
          defaultValue={foundedYear ?? undefined}
          min={1800}
          max={new Date().getFullYear() + 1}
        />
      </div>

      <div className="field">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" defaultValue={website ?? ""} maxLength={200} />
      </div>

      <div className="field">
        <label htmlFor="email">Contact email</label>
        <input id="email" name="email" type="email" defaultValue={email ?? ""} maxLength={200} />
      </div>

      <div className="field">
        <label htmlFor="phone">Contact phone</label>
        <input id="phone" name="phone" type="text" defaultValue={phone ?? ""} maxLength={40} />
      </div>

      <div className="field">
        <label htmlFor="logo">Logo</label>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a user-uploaded file, not an optimizable static asset
          <img src={logoUrl} alt="Current logo" width={56} height={56} style={{ borderRadius: "50%", objectFit: "cover", marginBottom: "0.4rem" }} />
        )}
        <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a user-uploaded file, not an optimizable static asset
          <img src={coverUrl} alt="Current cover" style={{ width: "100%", maxHeight: "80px", objectFit: "cover", borderRadius: "8px", marginBottom: "0.4rem" }} />
        )}
        <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
