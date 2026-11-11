import { RecommendScreen } from "@/components/recommend/recommend-screen";
import { getIngredients } from "@/lib/queries/ingredients";
import { getMenus } from "@/lib/queries/menus";

// AI 메뉴 추천 (FR-REC-01~07, UC-08) — WBS 4.2a·4.2b. 추천 생성은 클라이언트에서 POST /api/recommendations
export default async function Page() {
  const [menus, ingredients] = await Promise.all([getMenus(), getIngredients()]);
  // 추천 대상은 활성 메뉴만 (08 9장 ①). 비활성 메뉴만 있으면 메뉴 등록 안내
  return (
    <RecommendScreen
      hasMenus={menus.some((m) => m.isActive)}
      ingredients={ingredients.map(({ id, name, unit }) => ({ id, name, unit }))} // 특선 등록 시 미등록 재료를 연결할 목록
    />
  );
}
