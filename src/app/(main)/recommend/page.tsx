import { RecommendScreen } from "@/components/recommend/recommend-screen";
import { getMenus } from "@/lib/queries/menus";

// AI 메뉴 추천 (FR-REC-01~06, UC-08) — WBS 4.2a. 추천 생성은 클라이언트에서 POST /api/recommendations
export default async function Page() {
  const menus = await getMenus();
  // 추천 대상은 활성 메뉴만 (08 9장 ①). 비활성 메뉴만 있으면 메뉴 등록 안내
  return <RecommendScreen hasMenus={menus.some((m) => m.isActive)} />;
}
