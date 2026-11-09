import { unstable_rethrow } from "next/navigation";
import { getIngredients } from "@/lib/queries/ingredients";
import { IngredientCatalogScreen } from "@/components/ingredients/catalog-screen";
import { catalogHref, readFilters } from "@/components/ingredients/filters";
import { ingredientCard } from "@/components/ingredients/presentation";

export default async function Page({ searchParams }: PageProps<"/ingredients">) {
  const filters = readFilters(await searchParams);
  let items;
  try {
    items = await getIngredients({ q: filters.q || undefined, status: filters.status === "all" ? undefined : filters.status });
  } catch (error) {
    unstable_rethrow(error);
    return <IngredientCatalogScreen key={catalogHref(filters)} items={[]} filters={filters} loadError />;
  }
  return <IngredientCatalogScreen key={catalogHref(filters)} items={items.filter((item) => filters.storage === "all" || item.storage === filters.storage).map(ingredientCard)} filters={filters} />;
}
