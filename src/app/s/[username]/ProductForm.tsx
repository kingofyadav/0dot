"use client";

import { useActionState } from "react";
import { createProduct, updateProduct } from "@/app/actions/digital-products";

// spec §5: owner-only product create/edit, same shape as TierForm.tsx.
export function ProductForm({
  product,
}: {
  product?: { id: string; title: string; description: string; price: number; currency: string; status: string };
}) {
  const action = product ? updateProduct : createProduct;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      {product && <input type="hidden" name="productId" value={product.id} />}
      <div className="field">
        <label htmlFor={`productTitle-${product?.id ?? "new"}`}>Title</label>
        <input id={`productTitle-${product?.id ?? "new"}`} name="title" defaultValue={product?.title} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`productDescription-${product?.id ?? "new"}`}>Description</label>
        <textarea id={`productDescription-${product?.id ?? "new"}`} name="description" defaultValue={product?.description} maxLength={2000} rows={2} />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`productPrice-${product?.id ?? "new"}`}>Price</label>
          <input id={`productPrice-${product?.id ?? "new"}`} name="price" type="number" min="0.01" step="0.01" defaultValue={product?.price} required />
        </div>
        <div className="field">
          <label htmlFor={`productCurrency-${product?.id ?? "new"}`}>Currency</label>
          <input id={`productCurrency-${product?.id ?? "new"}`} name="currency" defaultValue={product?.currency ?? "usd"} maxLength={3} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`productFile-${product?.id ?? "new"}`}>{product ? "Replace file (optional)" : "File"}</label>
        <input id={`productFile-${product?.id ?? "new"}`} name="file" type="file" required={!product} />
      </div>
      {product && (
        <div className="field">
          <label htmlFor={`productStatus-${product.id}`}>Status</label>
          <select id={`productStatus-${product.id}`} name="status" defaultValue={product.status} className="textInput">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : product ? "Save changes" : "Create product"}
      </button>
    </form>
  );
}
