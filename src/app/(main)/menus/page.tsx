import { getMenus } from "@/lib/queries/menus";
import { MenuCatalog } from "@/components/menus/catalog";

// 메뉴·레시피 (FR-MENU-01~02) — WBS 3.2a
export default async function Page() {
  const menus = await getMenus();
  return <MenuCatalog menus={menus} />;
}
