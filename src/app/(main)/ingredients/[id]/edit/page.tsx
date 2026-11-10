import Link from "next/link";
import { z } from "zod";
import { notFound, unstable_rethrow } from "next/navigation";
import { getIngredient } from "@/lib/queries/ingredients";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { IngredientFormScreen } from "@/components/ingredients/form-screen";
import { IngredientLoadError } from "@/components/ingredients/load-error";
import { ingredientDraft } from "@/components/ingredients/form-input";

export default async function Page({ params }: PageProps<"/ingredients/[id]/edit">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try { data = await getIngredient(id); }
  catch (error) {
    unstable_rethrow(error);
    return <><PageHeader title="재료 수정" /><IngredientLoadError /></>;
  }
  if (!data) notFound();
  return <>
    <PageHeader title="재료 수정" action={<Button asChild variant="ghost" className="h-11"><Link href={`/ingredients/${id}`}>상세로</Link></Button>} />
    <main className="p-4"><IngredientFormScreen id={id} initial={ingredientDraft(data)} unitLocked={data.lots.length > 0} /></main>
  </>;
}
