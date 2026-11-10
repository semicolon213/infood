import { notFound } from "next/navigation";
import { IdInput } from "@/types/contracts";
import { getMenu } from "@/lib/queries/menus";
import { getIngredients } from "@/lib/queries/ingredients";
import { MenuFormScreen } from "@/components/menus/form-screen";

export default async function Page({ params }: PageProps<"/menus/[id]/edit">) {
  const { id } = await params;
  if (!IdInput.safeParse({ id }).success) notFound();
  const menu = await getMenu(id);
  if (!menu) notFound();
  const ingredients = await getIngredients();
  return <MenuFormScreen key={id} menu={menu} ingredients={ingredients} />;
}
