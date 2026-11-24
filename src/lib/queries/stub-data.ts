import "server-only";
import type { Dashboard, SavedRecommendation } from "@/types/contracts";

// WBS 2.10 stub 고정값. 화면 담당(a 작업)이 서버 구현 전에 화면을 만들 때 쓴다.
// 서버 구현(b 작업)이 끝나 쓰지 않게 된 값은 지웠다 (WBS 5.2). 남은 것은 화면 테스트 2개가 쓰는 STUB_DASHBOARD·STUB_RECOMMENDATION.
// 날짜는 오늘 = 2026-11-03 기준 가상 데이터 (SRS C-02).

const STUB_TODAY = "2026-11-03";

const I = {
  onion: "00000000-0000-4000-8000-000000000101",
  tofu: "00000000-0000-4000-8000-000000000102",
  greenOnion: "00000000-0000-4000-8000-000000000103",
  pork: "00000000-0000-4000-8000-000000000104",
  lotTofuOld: "00000000-0000-4000-8000-000000000202",
  lotTofu: "00000000-0000-4000-8000-000000000203",
  lotPork: "00000000-0000-4000-8000-000000000204",
  menuDoenjang: "00000000-0000-4000-8000-000000000302",
  recommendation: "00000000-0000-4000-8000-000000000701",
} as const;

export const STUB_DASHBOARD: Dashboard = {
  today: STUB_TODAY,
  expiringLots: [
    { lotId: I.lotTofu, ingredientId: I.tofu, name: "두부", remaining: 6, unit: "ea", expiresAt: "2026-11-04", daysLeft: 1 },
    { lotId: I.lotPork, ingredientId: I.pork, name: "돼지고기(앞다리)", remaining: 1200, unit: "g", expiresAt: "2026-11-05", daysLeft: 2 },
  ],
  expiredLots: [
    { lotId: I.lotTofuOld, ingredientId: I.tofu, name: "두부", remaining: 2, unit: "ea", expiresAt: "2026-11-02", daysLeft: -1 },
  ],
  lowStock: [
    { ingredientId: I.greenOnion, name: "대파", unit: "g", availableRemaining: 0, minStock: 500 },
    { ingredientId: I.pork, name: "돼지고기(앞다리)", unit: "g", availableRemaining: 1200, minStock: 2000 },
  ],
};

export const STUB_RECOMMENDATION: SavedRecommendation = {
  id: I.recommendation,
  basis: "expiry",
  fallback: false,
  accepted: false,
  pushMenus: [
    {
      menuId: I.menuDoenjang, name: "된장찌개", reason: "내일까지인 두부 6모를 쓸 수 있어요",
      consumes: [
        { ingredientId: I.tofu, name: "두부", qty: 0.5, unit: "ea", status: "have", availableQty: 6 },
        { ingredientId: I.onion, name: "양파", qty: 50, unit: "g", status: "have", availableQty: 5000 },
      ],
    },
  ],
  newIdeas: [
    {
      index: 0, name: "두부제육 덮밥",
      ingredients: [
        { ingredientId: I.tofu, name: "두부", qty: 1, unit: "ea", status: "have", availableQty: 6 },
        { ingredientId: I.pork, name: "돼지고기(앞다리)", qty: 150, unit: "g", status: "have", availableQty: 1200 },
        { ingredientId: I.greenOnion, name: "대파", qty: 20, unit: "g", status: "short", availableQty: 0 },
        { ingredientId: null, name: "고추기름", qty: 10, unit: null, status: "unregistered", availableQty: null },
      ],
      steps: ["두부를 깍둑썰어 굽는다", "돼지고기를 양념에 볶는다", "밥 위에 올리고 대파를 얹는다"],
      estCost: 3000,
      suggestedPrice: 9500,
    },
  ],
  droppedCount: 0,
  shortCount: 1,
  unregisteredCount: 1,
};
