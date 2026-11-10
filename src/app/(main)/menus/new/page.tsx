import { getIngredients } from "@/lib/queries/ingredients";
import { MenuFormScreen } from "@/components/menus/form-screen";

export default async function Page() {
  const ingredients = await getIngredients();
  return <MenuFormScreen ingredients={ingredients} />;
}
