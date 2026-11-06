import { z } from "zod";
import { notFound, unstable_rethrow } from "next/navigation";
import { getIngredient } from "@/lib/queries/ingredients";
import { PageHeader } from "@/components/common/page-header";
import { IngredientDetailScreen } from "@/components/ingredients/detail-screen";
import { IngredientLoadError } from "@/components/ingredients/load-error";
import { ingredientDetail } from "@/components/ingredients/presentation";

export default async function Page({ params }: PageProps<"/ingredients/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try { data = await getIngredient(id); }
  catch (error) {
    unstable_rethrow(error);
    return <><PageHeader title="재료 상세" /><IngredientLoadError /></>;
  }
  if (!data) notFound();
  return <IngredientDetailScreen data={ingredientDetail(data)} />;
}
