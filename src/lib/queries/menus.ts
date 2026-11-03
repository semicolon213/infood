import "server-only";
import type { MenuDetail, MenuSummary, UUID } from "@/types/contracts";
import { STUB_MENUS } from "./stub-data";

// 08_API_SPEC 4장. WBS 2.10 stub — 실제 구현은 3.2b

// FR-MENU-01 (cost·costRate는 확장 FR-MENU-03)
export async function getMenus(): Promise<MenuSummary[]> {
  return STUB_MENUS.map((m) => ({ id: m.id, name: m.name, price: m.price, isActive: m.isActive, isSpecial: m.isSpecial }));
}

// FR-MENU-02: 메뉴 + 레시피. 없으면 null
export async function getMenu(id: UUID): Promise<MenuDetail | null> {
  return STUB_MENUS.find((m) => m.id === id) ?? null;
}
