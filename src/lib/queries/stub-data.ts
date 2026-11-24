import "server-only";
import type { Dashboard, IngredientDetail, SavedRecommendation } from "@/types/contracts";

// WBS 2.10 stub 고정값. 화면 담당(a 작업)이 서버 구현 전에 화면을 만들 때 쓴다.
// 서버 구현(b 작업)이 끝나 쓰지 않게 된 값은 지웠다 (WBS 5.2). 남은 것: 화면 테스트 2개가 쓰는 STUB_DASHBOARD·STUB_RECOMMENDATION,
// adjustLot stub이 쓰는 STUB_INGREDIENTS(실사 보정 #73 병합 후 삭제).
// 날짜는 오늘 = 2026-11-03 기준 가상 데이터 (SRS C-02).

const STUB_TODAY = "2026-11-03";

const I = {
  onion: "00000000-0000-4000-8000-000000000101",
  tofu: "00000000-0000-4000-8000-000000000102",
  greenOnion: "00000000-0000-4000-8000-000000000103",
  pork: "00000000-0000-4000-8000-000000000104",
  egg: "00000000-0000-4000-8000-000000000105",
  salt: "00000000-0000-4000-8000-000000000106",
  lotOnion: "00000000-0000-4000-8000-000000000201",
  lotTofuOld: "00000000-0000-4000-8000-000000000202",
  lotTofu: "00000000-0000-4000-8000-000000000203",
  lotPork: "00000000-0000-4000-8000-000000000204",
  lotEgg: "00000000-0000-4000-8000-000000000205",
  menuDoenjang: "00000000-0000-4000-8000-000000000302",
  recommendation: "00000000-0000-4000-8000-000000000701",
} as const;

export const STUB_INGREDIENTS: IngredientDetail[] = [
  {
    id: I.tofu, name: "두부", category: "가공", unit: "ea", storage: "fridge",
    totalRemaining: 8, availableRemaining: 6, expiredRemaining: 2,
    minStock: 5, targetStock: 15, isLow: false,
    nearestExpiresAt: "2026-11-02", daysLeft: -1,
    defaultShelfDays: 5, trackExpiry: true,
    units: [{ unitName: "모", factor: 1 }],
    lots: [
      { id: I.lotTofuOld, quantity: 10, remaining: 2, unitPrice: 900, receivedAt: "2026-10-28", expiresAt: "2026-11-02", expirySource: "default", daysLeft: -1 },
      { id: I.lotTofu, quantity: 6, remaining: 6, unitPrice: 900, receivedAt: "2026-11-01", expiresAt: "2026-11-04", expirySource: "manual", daysLeft: 1 },
    ],
  },
  {
    id: I.greenOnion, name: "대파", category: "채소", unit: "g", storage: "fridge",
    totalRemaining: 0, availableRemaining: 0, expiredRemaining: 0,
    minStock: 500, targetStock: 2000, isLow: true,
    nearestExpiresAt: null, daysLeft: null,
    defaultShelfDays: 7, trackExpiry: true,
    units: [{ unitName: "단", factor: 800 }],
    lots: [],
  },
  {
    id: I.egg, name: "계란", category: "유제품·계란", unit: "ea", storage: "fridge",
    totalRemaining: 30, availableRemaining: 30, expiredRemaining: 0,
    minStock: 30, targetStock: 90, isLow: false,
    nearestExpiresAt: "2026-11-20", daysLeft: 17,
    defaultShelfDays: 21, trackExpiry: true,
    units: [{ unitName: "판", factor: 30 }],
    lots: [{ id: I.lotEgg, quantity: 30, remaining: 30, unitPrice: 220, receivedAt: "2026-10-30", expiresAt: "2026-11-20", expirySource: "default", daysLeft: 17 }],
  },
  {
    id: I.pork, name: "돼지고기(앞다리)", category: "육류", unit: "g", storage: "fridge",
    totalRemaining: 1200, availableRemaining: 1200, expiredRemaining: 0,
    minStock: 2000, targetStock: null, isLow: true,
    nearestExpiresAt: "2026-11-05", daysLeft: 2,
    defaultShelfDays: 4, trackExpiry: true,
    units: [],
    lots: [{ id: I.lotPork, quantity: 3000, remaining: 1200, unitPrice: 14, receivedAt: "2026-11-01", expiresAt: "2026-11-05", expirySource: "default", daysLeft: 2 }],
  },
  {
    id: I.salt, name: "소금", category: "양념·곡류", unit: "g", storage: "room",
    totalRemaining: 3000, availableRemaining: 3000, expiredRemaining: 0,
    minStock: 500, targetStock: null, isLow: false,
    nearestExpiresAt: null, daysLeft: null,
    defaultShelfDays: null, trackExpiry: false,
    units: [],
    lots: [],
  },
  {
    id: I.onion, name: "양파", category: "채소", unit: "g", storage: "room",
    totalRemaining: 5000, availableRemaining: 5000, expiredRemaining: 0,
    minStock: 2000, targetStock: 8000, isLow: false,
    nearestExpiresAt: "2026-11-24", daysLeft: 21,
    defaultShelfDays: 30, trackExpiry: true,
    units: [{ unitName: "망", factor: 15000 }],
    lots: [{ id: I.lotOnion, quantity: 5000, remaining: 5000, unitPrice: 1.5, receivedAt: "2026-10-25", expiresAt: "2026-11-24", expirySource: "default", daysLeft: 21 }],
  },
];

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
