import { notFound } from "next/navigation";
import { IdInput } from "@/types/contracts";
import { getMenu } from "@/lib/queries/menus";
import { MenuDetailScreen } from "@/components/menus/detail-screen";

export default async function Page({ params }: PageProps<"/menus/[id]">) {
  const { id } = await params;
  if (!IdInput.safeParse({ id }).success) notFound();
  const menu = await getMenu(id);
  if (!menu) notFound();
  return <MenuDetailScreen menu={menu} />;
}
