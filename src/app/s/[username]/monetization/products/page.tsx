import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveProduct } from "@/app/actions/digital-products";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ProductForm } from "../../ProductForm";

export const metadata: Metadata = { title: "Digital products" };

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
      {myProducts.length === 0 && <EmptyState message="No digital products yet." />}
      {myProducts.map((product) => (
        <div key={product.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={Package}
            label={product.title}
            description={`${product.price.toFixed(2)} ${product.currency.toUpperCase()} · ${product.status}`}
            trailing={
              product.status !== "archived" ? (
                <form action={archiveProduct}>
                  <input type="hidden" name="productId" value={product.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                </form>
              ) : undefined
            }
          />
          <details>
            <summary className="settingsRow settingsAddTrigger">
              <span className="settingsRowIcon" aria-hidden="true">
                <Pencil size={16} />
              </span>
              <span className="settingsRowText">
                <span className="settingsRowLabel">Edit</span>
              </span>
            </summary>
            <div className="settingsAddPanelBody">
              <ProductForm product={product} />
            </div>
          </details>
        </div>
      ))}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add a product</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <ProductForm />
        </div>
      </details>
    </div>
  );
}
