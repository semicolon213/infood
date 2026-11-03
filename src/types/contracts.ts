// 화면↔서버 입출력 계약 (WBS 2.10, docs/08_API_SPEC.md v0.3)
// - 입력: Zod 스키마. 서버 액션이 입구에서 safeParse 하고, 화면 폼도 같은 스키마를 쓸 수 있다.
// - 출력: DTO 타입. 서버 액션은 ActionResult<출력>을 돌려준다 (lib/result.ts).
// - 이 파일은 클라이언트에서도 import하므로 서버 전용 모듈을 import하지 않는다.
// 계약을 바꾸려면 08_API_SPEC.md를 먼저 고치고 상대 담당자와 합의한다 (04_WBS.md 3.2).
import { z } from "zod";

// ── 1.3 공통 타입 ─────────────────────────────────────────────

export type UUID = string;
export type ISODate = string; // "2026-11-03" (Asia/Seoul 기준 날짜)

export const Unit = z.enum(["g", "ml", "ea"]);
export type Unit = z.infer<typeof Unit>;

// "g" | "ml" | "ea" | "kg" | "L" 또는 재료에 등록한 환산 단위 이름 ("단", "판")
export const InputUnit = z.string().trim().min(1).max(10);
export type InputUnit = z.infer<typeof InputUnit>;

export const StorageType = z.enum(["fridge", "freezer", "room"]);
export type StorageType = z.infer<typeof StorageType>;

export const ExpirySource = z.enum(["manual", "default"]);
export type ExpirySource = z.infer<typeof ExpirySource>;

export const WasteReason = z.enum(["expired", "spoiled", "mistake", "other"]);
export type WasteReason = z.infer<typeof WasteReason>;

export const RecommendBasis = z.enum(["expiry", "cost", "popularity"]);
export type RecommendBasis = z.infer<typeof RecommendBasis>;

export const OrderStatus = z.enum(["draft", "ordered", "received"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

const Id = z.uuid();
// "오늘 이전" 검사는 todayKST()가 필요해서 서버 액션에서 한다 (08_API_SPEC 0장)
const DateStr = z.iso.date();
const Qty = z.number().positive().max(1_000_000);
const Memo = (max: number) => z.string().trim().max(max).optional();

// 기본 단위 이름은 환산 단위로 쓸 수 없다 (BR-03)
const RESERVED_UNITS = ["g", "ml", "ea", "kg", "l"];

// 차감하지 못한 양 (FR-USE-05)
export interface Shortage {
  ingredientId: UUID;
  name: string;
  unit: Unit;
  requiredQty: number;
  shortQty: number;
}

// ── 3. 재료 ───────────────────────────────────────────────────

export const IngredientFilter = z.object({
  q: z.string().trim().max(30).optional(),
  status: z.enum(["soon", "expired", "low"]).optional(),
});
export type IngredientFilter = z.infer<typeof IngredientFilter>;

export interface IngredientSummary {
  id: UUID;
  name: string;
  category: string | null;
  unit: Unit;
  storage: StorageType;
  totalRemaining: number; // 경과 포함 잔량 합
  availableRemaining: number; // 사용 가능 재고 (BR-05)
  expiredRemaining: number; // 경과 묶음 잔량 합
  minStock: number;
  targetStock: number | null;
  isLow: boolean;
  nearestExpiresAt: ISODate | null;
  daysLeft: number | null; // 음수면 경과
}

export interface IngredientLot {
  id: UUID;
  quantity: number;
  remaining: number;
  unitPrice: number | null;
  receivedAt: ISODate;
  expiresAt: ISODate | null;
  expirySource: ExpirySource | null;
  daysLeft: number | null;
}

export interface IngredientDetail extends IngredientSummary {
  defaultShelfDays: number | null;
  trackExpiry: boolean;
  units: { unitName: string; factor: number }[];
  lots: IngredientLot[]; // 잔량 > 0, 유통기한 오름차순 (null은 마지막)
}

export const IngredientUnitInput = z.object({
  unitName: z
    .string()
    .trim()
    .min(1, "단위 이름을 입력해 주세요")
    .max(10, "10자 이내로 입력해 주세요")
    .refine((u) => !RESERVED_UNITS.includes(u.toLowerCase()), "기본 단위는 환산 단위로 쓸 수 없어요"),
  factor: z.number().positive("0보다 큰 값을 입력해 주세요"),
});

export const IngredientInput = z
  .object({
    id: Id.optional(), // 수정 시
    name: z.string().trim().min(1, "재료 이름을 입력해 주세요").max(30, "30자 이내로 입력해 주세요"),
    category: z.string().trim().max(20).optional(),
    unit: Unit,
    minStock: z.number().min(0, "0 이상으로 입력해 주세요"),
    targetStock: z.number().min(0).optional(),
    storage: StorageType,
    defaultShelfDays: z.number().int().min(1).max(3650).optional(),
    trackExpiry: z.boolean(),
    units: z.array(IngredientUnitInput).max(10).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.targetStock !== undefined && v.targetStock < v.minStock) {
      ctx.addIssue({ code: "custom", path: ["targetStock"], message: "적정 재고는 최소 재고 이상이어야 해요" });
    }
    if (v.trackExpiry && v.defaultShelfDays === undefined) {
      ctx.addIssue({ code: "custom", path: ["defaultShelfDays"], message: "기본 보관일수를 입력해 주세요" });
    }
    const names = (v.units ?? []).map((u) => u.unitName);
    names.forEach((n, i) => {
      if (names.indexOf(n) !== i) {
        ctx.addIssue({ code: "custom", path: ["units", i, "unitName"], message: "같은 단위 이름이 있어요" });
      }
    });
  });
export type IngredientInput = z.infer<typeof IngredientInput>;

export const IdInput = z.object({ id: Id });
export type IdInput = z.infer<typeof IdInput>;

export type IdOutput = { id: UUID };

// ── 4. 메뉴·레시피 (서버 액션은 actions/menus.ts, 3.2b) ─────────

export interface MenuSummary {
  id: UUID;
  name: string;
  price: number;
  isActive: boolean;
  isSpecial: boolean;
  cost?: number; // 확장 FR-MENU-03
  costRate?: number; // 확장 FR-MENU-03
}

export interface MenuDetail extends MenuSummary {
  recipe: { ingredientId: UUID; name: string; unit: Unit; qty: number }[];
}

const RecipeItems = z
  .array(z.object({ ingredientId: Id, qty: Qty })) // qty는 1인분, 기본 단위
  .superRefine((items, ctx) => {
    const ids = items.map((r) => r.ingredientId);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: "custom", path: [i, "ingredientId"], message: "같은 재료가 두 번 있어요" });
    });
  });

export const MenuInput = z.object({
  id: Id.optional(),
  name: z.string().trim().min(1, "메뉴 이름을 입력해 주세요").max(30, "30자 이내로 입력해 주세요"),
  price: z.number().int().min(0, "0 이상으로 입력해 주세요"),
  recipe: RecipeItems,
});
export type MenuInput = z.infer<typeof MenuInput>;

// ── 5. 입고 ───────────────────────────────────────────────────

export const ReceiveStockInput = z
  .object({
    receivedOn: DateStr,
    items: z
      .array(
        z.object({
          ingredientId: Id,
          qty: Qty,
          unit: InputUnit,
          totalPrice: z.number().int().min(0).optional(),
          expiresAt: DateStr.optional(),
        }),
      )
      .min(1, "품목을 1개 이상 입력해 주세요")
      .max(30, "한 번에 30품목까지 입고할 수 있어요"),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((item, i) => {
      if (item.expiresAt && item.expiresAt < v.receivedOn) {
        ctx.addIssue({ code: "custom", path: ["items", i, "expiresAt"], message: "유통기한이 입고일보다 빨라요" });
      }
    });
  });
export type ReceiveStockInput = z.infer<typeof ReceiveStockInput>;

export interface ReceivedLot {
  lotId: UUID;
  ingredientId: UUID;
  name: string;
  quantity: number; // 기본 단위
  unit: Unit;
  expiresAt: ISODate | null;
  expirySource: ExpirySource | null;
  basis: string | null; // 계산 근거 문구 (FR-STK-02)
}
export type ReceiveStockOutput = { lots: ReceivedLot[] };

// ── 6. 판매 마감 ──────────────────────────────────────────────

export interface SalesDay {
  soldOn: ISODate;
  closed: boolean;
  items: { menuId: UUID; name: string; qty: number }[]; // 활성 메뉴 전체, 최근 7일 판매량 순
  shortages: Shortage[];
}

export const RecordDailySalesInput = z.object({
  soldOn: DateStr,
  sales: z
    .array(z.object({ menuId: Id, qty: z.number().int().min(0) }))
    .refine((s) => s.some((x) => x.qty > 0), "판매 수량을 1개 이상 입력해 주세요"),
});
export type RecordDailySalesInput = z.infer<typeof RecordDailySalesInput>;

export type RecordDailySalesOutput = {
  salesDayId: UUID;
  consumed: { ingredientId: UUID; qty: number }[];
  shortages: Shortage[];
};

// ── 7. 사용·폐기 ──────────────────────────────────────────────

export const RecordUsageInput = z.object({
  usedOn: DateStr,
  items: z
    .array(
      z.object({
        ingredientId: Id,
        qty: Qty,
        unit: InputUnit.optional(), // 생략 시 기본 단위
        memo: Memo(100),
      }),
    )
    .min(1, "품목을 1개 이상 입력해 주세요"),
});
export type RecordUsageInput = z.infer<typeof RecordUsageInput>;

export type RecordUsageOutput = { recordIds: UUID[]; shortages: Shortage[] };

export const RecordWasteInput = z.object({
  lotId: Id,
  qty: Qty, // ≤ 잔량은 서버가 확인
  reason: WasteReason,
  memo: Memo(100),
});
export type RecordWasteInput = z.infer<typeof RecordWasteInput>;

export type RecordWasteOutput = { lotId: UUID; remaining: number };

export const StockHistoryFilter = z.object({
  from: DateStr,
  to: DateStr, // 기간 최대 31일
  type: z.enum(["usage", "waste"]).optional(),
});
export type StockHistoryFilter = z.infer<typeof StockHistoryFilter>;

export interface StockHistoryItem {
  date: ISODate;
  type: "usage" | "waste";
  ingredientId: UUID;
  name: string;
  qty: number;
  unit: Unit;
  reason: WasteReason | null;
  memo: string | null;
  shortQty: number;
}

// 확장 FR-USE-07
export const AdjustLotInput = z.object({
  lotId: Id,
  newRemaining: z.number().min(0), // ≤ quantity는 서버가 확인
  memo: Memo(100),
});
export type AdjustLotInput = z.infer<typeof AdjustLotInput>;

export type AdjustLotOutput = { lotId: UUID; delta: number };

// ── 8. 대시보드 ───────────────────────────────────────────────

export interface DashboardLot {
  lotId: UUID;
  ingredientId: UUID;
  name: string;
  remaining: number;
  unit: Unit;
  expiresAt: ISODate;
  daysLeft: number;
}

export interface Dashboard {
  today: ISODate;
  expiringLots: DashboardLot[]; // 0 ≤ daysLeft ≤ 3, 기한 순
  expiredLots: DashboardLot[]; // daysLeft < 0
  lowStock: { ingredientId: UUID; name: string; unit: Unit; availableRemaining: number; minStock: number }[]; // BR-05
  weeklyWaste?: { thisWeek: number; lastWeek: number; daily: { date: ISODate; amount: number }[] }; // 원, 확장 FR-DASH-05
}

// ── 9. AI 메뉴 추천 ───────────────────────────────────────────

export const RecommendRequest = z.object({ basis: RecommendBasis.default("expiry") });
export type RecommendRequest = z.input<typeof RecommendRequest>;

export interface RecIngredient {
  ingredientId: UUID | null; // 매장 재료와 연결되지 않으면 null
  name: string;
  qty: number; // 기본 단위 (연결 안 된 재료는 AI가 준 값 그대로, 단위 미상)
  unit: Unit | null;
  status: "have" | "short" | "unregistered"; // FR-REC-03
  availableQty: number | null; // DB의 사용 가능 재고. unregistered면 null
}

export interface RecommendationView {
  id: UUID;
  basis: RecommendBasis;
  fallback: boolean; // true면 "규칙 기반" 표시 (FR-REC-04·05)
  pushMenus: { menuId: UUID; name: string; reason: string; consumes: RecIngredient[] }[];
  newIdeas: {
    index: number;
    name: string;
    ingredients: RecIngredient[];
    steps: string[];
    estCost: number;
    suggestedPrice: number | null;
  }[];
  droppedCount: number;
  shortCount: number;
  unregisteredCount: number;
}

export type SavedRecommendation = RecommendationView & { accepted: boolean };

export const AcceptRecommendationInput = z.object({
  recommendationId: Id,
  ideaIndex: z.number().int().min(0),
  name: MenuInput.shape.name,
  price: MenuInput.shape.price,
  ingredients: RecipeItems.refine((r) => r.length > 0, "재료를 1개 이상 연결해 주세요"),
});
export type AcceptRecommendationInput = z.infer<typeof AcceptRecommendationInput>;

export type AcceptRecommendationOutput = { menuId: UUID };

// ── 10. 발주 목록 ─────────────────────────────────────────────

export interface OrderDraftItem {
  ingredientId: UUID;
  name: string;
  unit: Unit;
  availableQty: number;
  targetQty: number;
  pendingQty: number; // 미입고 발주량 (status = ordered)
  suggestedQty: number; // 정수 올림 (BR-06)
}
export type OrderDraft = { items: OrderDraftItem[] };

export const SaveOrderInput = z.object({
  id: Id.optional(),
  orderDate: DateStr,
  memo: Memo(200),
  items: z
    .array(z.object({ ingredientId: Id, qty: z.number().max(1_000_000) })) // qty ≤ 0 품목은 저장하지 않음 (UC-09 3a)
    .superRefine((items, ctx) => {
      const ids = items.map((r) => r.ingredientId);
      ids.forEach((id, i) => {
        if (ids.indexOf(id) !== i) ctx.addIssue({ code: "custom", path: [i, "ingredientId"], message: "같은 재료가 두 번 있어요" });
      });
    }),
});
export type SaveOrderInput = z.infer<typeof SaveOrderInput>;

export const SetOrderStatusInput = z.object({ id: Id, status: OrderStatus });
export type SetOrderStatusInput = z.infer<typeof SetOrderStatusInput>;

export type SetOrderStatusOutput = { id: UUID; status: OrderStatus };

export const OrderFilter = z.object({ from: DateStr.optional(), to: DateStr.optional() });
export type OrderFilter = z.infer<typeof OrderFilter>;

export interface OrderSummary {
  id: UUID;
  orderDate: ISODate;
  status: OrderStatus;
  itemCount: number;
  memo: string | null;
}

export interface OrderDetail {
  id: UUID;
  orderDate: ISODate;
  status: OrderStatus;
  memo: string | null;
  items: { ingredientId: UUID; name: string; unit: Unit; qty: number }[];
}
