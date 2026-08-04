import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveProduct } from "@/app/actions/digital-products";
import { ProductForm } from "../../ProductForm";

export default async function DigitalProductsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const myProducts = await db.digitalProduct.findMany({
    where: { creatorId: currentUser.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Digital products</h2>
      {myProducts.length === 0 && <p className="mutedText">No digital products yet.</p>}
      {myProducts.map((product) => (
        <div key={product.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{product.title}</strong>{" "}
              <span className="mutedText">
                {product.price.toFixed(2)} {product.currency.toUpperCase()} · {product.status}
              </span>
            </span>
            {product.status !== "archived" && (
              <form action={archiveProduct}>
                <input type="hidden" name="productId" value={product.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
              </form>
            )}
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <ProductForm product={product} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add a product</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <ProductForm />
        </div>
      </details>
    </div>
  );
}
