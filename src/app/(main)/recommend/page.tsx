import { RecommendScreen } from "@/components/recommend/recommend-screen";
import { getMenus } from "@/lib/queries/menus";

// AI 메뉴 추천 (FR-REC-01~06, UC-08) — WBS 4.2a. 추천 생성은 클라이언트에서 POST /api/recommendations
export default async function Page() {
  const menus = await getMenus();
  return <RecommendScreen hasMenus={menus.length > 0} />;
}
