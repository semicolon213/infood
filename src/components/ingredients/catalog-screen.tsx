"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IngredientCatalog } from "./catalog";
import { catalogHref, type CatalogFilters } from "./filters";
import type { IngredientCardData } from "./view-model";

export function IngredientCatalogScreen({ items, filters, loadError = false }: { items: IngredientCardData[]; filters: CatalogFilters; loadError?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <IngredientCatalog items={items} initialFilters={filters} loadError={loadError} pending={pending}
    onApplyFilters={(next) => startTransition(() => router.push(catalogHref(next), { scroll: false }))}
    onRetry={() => startTransition(() => router.refresh())} />;
}
