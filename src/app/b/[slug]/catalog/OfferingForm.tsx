"use client";

import { useActionState, useState } from "react";
import { createOffering, updateOffering } from "@/app/actions/offerings";

type OfferingValues = {
  id: string;
  kind: string;
  name: string;
  description: string;
  price: number | null;
  currency: string | null;
  paymentLinkUrl: string | null;
  status: string;
  sku: string | null;
  stockStatus: string | null;
  isBookable: boolean | null;
  durationMinutes: number | null;
};

export function OfferingForm({
  businessId,
  offering,
}: {
  businessId: string;
  // Edit mode when set, create mode when omitted — one form, same shape as
  // ManageBusinessForm's create-vs-edit reuse elsewhere in this phase.
  offering?: OfferingValues;
}) {
  const isEdit = Boolean(offering);
  const [state, formAction, pending] = useActionState(isEdit ? updateOffering : createOffering, undefined);
  const [kind, setKind] = useState(offering?.kind ?? "product");
  const [isBookable, setIsBookable] = useState(offering?.isBookable ?? false);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "36ch" }}>
      <input type="hidden" name="businessId" value={businessId} />
      {isEdit && <input type="hidden" name="offeringId" value={offering!.id} />}

      <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="textInput">
        <option value="product">Product</option>
        <option value="service">Service</option>
      </select>

      <input type="text" name="name" placeholder="Name" defaultValue={offering?.name} maxLength={120} required className="textInput" />
      <textarea name="description" placeholder="Description" defaultValue={offering?.description} maxLength={2000} rows={3} className="textInput" />

      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          type="text"
          name="price"
          placeholder="Price (optional)"
          defaultValue={offering?.price ?? ""}
          inputMode="decimal"
          className="textInput"
          style={{ flex: 1 }}
        />
        <input
          type="text"
          name="currency"
          placeholder="USD"
          defaultValue={offering?.currency ?? ""}
          maxLength={3}
          className="textInput"
          style={{ width: "5rem" }}
        />
      </div>

      <input
        type="text"
        name="paymentLinkUrl"
        placeholder="Payment link (optional — e.g. Stripe/PayPal checkout URL)"
        defaultValue={offering?.paymentLinkUrl ?? ""}
        maxLength={500}
        className="textInput"
      />

      {kind === "product" ? (
        <>
          <input type="text" name="sku" placeholder="SKU (optional)" defaultValue={offering?.sku ?? ""} maxLength={60} className="textInput" />
          <select name="stockStatus" defaultValue={offering?.stockStatus ?? ""} className="textInput">
            <option value="">Stock status (optional)</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="made_to_order">Made to order</option>
          </select>
        </>
      ) : (
        <>
          <label className="mutedText" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              name="isBookable"
              value="true"
              checked={isBookable}
              onChange={(e) => setIsBookable(e.target.checked)}
            />
            Bookable (customers can request an appointment)
          </label>
          {isBookable && (
            <input
              type="number"
              name="durationMinutes"
              placeholder="Duration (minutes)"
              defaultValue={offering?.durationMinutes ?? ""}
              min={1}
              required
              className="textInput"
            />
          )}
        </>
      )}

      <select name="status" defaultValue={offering?.status ?? "draft"} className="textInput">
        <option value="draft">Draft (not visible to customers)</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>

      <label className="mutedText" style={{ fontSize: "0.8rem" }}>
        Images (up to 8{isEdit ? " — uploading new ones replaces the current set" : ""})
      </label>
      <input type="file" name="images" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="textInput" />

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save" : "Add offering"}
      </button>
    </form>
  );
}
