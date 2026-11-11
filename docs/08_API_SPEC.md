# API 명세서

**시스템:** 재고콕
**버전:** v0.3.2 / 2026-11-10
**관련 문서:** `03_SRS.md`(요구사항 v0.4), `06_ARCHITECTURE.md`, `07_DB.md`

> 범위는 SRS v0.4를 따른다. 확장 기능 전용 API는 12장에 따로 둔다.

---

## 0. 구성

| 종류 | 용도 | 위치 |
|---|---|---|
| **조회 (Query)** | 서버 컴포넌트에서 직접 호출하는 읽기 함수 | `src/lib/queries/*` |
| **Server Action** | 화면에서 일어나는 데이터 변경 | `src/actions/*` |
| **Route Handler** | AI 호출 (긴 실행시간, 클라이언트 fetch) | `src/app/api/*` |
| **RPC** | 재고를 바꾸는 원자적 DB 작업 | `07_DB.md` 5장 |

모든 Server Action과 Route Handler는 로그인 사용자의 매장(`storeId`)을 세션에서 구한다. **클라이언트가 보낸 storeId는 받지 않는다.**
"오늘"은 서버가 `todayKST()`로 구한다. 클라이언트가 보낸 날짜는 입력값(입고일·판매일 등)으로만 쓰고, 미래 날짜는 `VALIDATION`이다.

## 1. 공통 규칙

### 1.1 결과 형식
```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
```
- Route Handler도 같은 JSON을 본문으로 돌려준다. HTTP 상태 코드는 아래 표를 따른다.
- `fields`의 키는 입력 경로다. 배열은 `items.0.qty`처럼 점과 인덱스로 쓴다.

### 1.2 에러 코드

| 코드 | HTTP | 의미 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 로그인 필요 |
| `FORBIDDEN` | 403 | 다른 매장 데이터 접근 |
| `NO_STORE` | 409 | 매장 생성 전 |
| `VALIDATION` | 400 | 입력 검증 실패 (`fields`에 항목별 메시지) |
| `NOT_FOUND` | 404 | 대상 없음 |
| `CONFLICT` | 409 | 중복 이름, 잘못된 상태 전이, 잔량이 남은 재료 비활성화, 이미 마감한 날짜 |
| `STOCK_CONFLICT` | 409 | 계획 이후 재고가 바뀜 (서버가 1회 재시도 후에도 실패) |
| `AI_FAILED` | 502 | AI 호출 실패·타임아웃 (대체 결과도 만들 수 없을 때) |
| `AI_INVALID_OUTPUT` | 502 | AI 출력이 스키마에 맞지 않음 (재시도 후, 대체 결과도 만들 수 없을 때) |
| `RATE_LIMITED` | 429 | AI 일일 호출 한도 초과 |
| `INTERNAL` | 500 | 기타 서버 오류 |

### 1.3 공통 타입
```ts
type UUID = string;
type ISODate = string;           // "2026-11-03" (Asia/Seoul 기준 날짜)
type Unit = "g" | "ml" | "ea";   // 재료 기본 단위
type InputUnit = string;         // "g" | "ml" | "ea" | "kg" | "L" 또는 재료에 등록한 환산 단위 이름 ("단", "판")
type StorageType = "fridge" | "freezer" | "room";
type ExpirySource = "manual" | "default";       // SRS BR-01
type WasteReason = "expired" | "spoiled" | "mistake" | "other";
type RecommendBasis = "expiry" | "cost" | "popularity";
type OrderStatus = "draft" | "ordered" | "received";   // 작성중 / 발주완료 / 입고완료

// 차감하지 못한 양 (FR-USE-05)
interface Shortage { ingredientId: UUID; name: string; unit: Unit; requiredQty: number; shortQty: number }
```

### 1.4 단위 환산 규칙 (BR-03)
- `kg → g ×1000`, `L → ml ×1000`, 기본 단위는 그대로.
- 그 외 단위는 재료의 환산 단위(`ingredient_units`)에서 계수를 찾는다. 없으면 `VALIDATION`, `fields["items.N.unit"] = "환산 계수를 입력해 주세요"`.
- 환산은 서버의 `lib/stock/unit.ts`로만 한다. 결과는 소수 3자리 반올림.

---

## 2. 매장·인증

| 항목 | 내용 |
|---|---|
| 로그인 | Supabase Auth 이메일 매직링크. 서버 액션 없이 클라이언트 SDK로 요청하고 콜백에서 세션을 만든다 (FR-AUTH-01) |
| 미로그인 접근 | 모든 Server Action·Route Handler는 `UNAUTHORIZED`, 화면은 `/login`으로 이동 |

### `createStore` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ name: string }` (1~50자) |
| 출력 | `{ storeId: UUID }` |
| 에러 | `UNAUTHORIZED`, `VALIDATION`, `CONFLICT`(이미 매장 있음) |
| 관련 | FR-AUTH-02 |

## 3. 재료

### 조회
| 함수 | 반환 | 관련 |
|---|---|---|
| `getIngredients({ q?, status?: "soon" \| "expired" \| "low" })` | `IngredientSummary[]` (이름 순) | FR-ING-03 |
| `getIngredient(id)` | `IngredientDetail` (묶음 목록 포함) | FR-ING-02 |

- `status`: `soon` = 임박 묶음(D-0~D-3, 잔량 > 0) 있음, `expired` = 경과 묶음 있음, `low` = 부족 (BR-05). 재고 수치는 `07_DB.md` 3.4 `get_ingredient_stock`으로 구한다. `nearestExpiresAt`은 경과 묶음을 포함한 가장 빠른 기한이라 `soon` 판정에 쓰지 않는다.
- `q`: 이름 부분 일치, 대소문자 무시. 비활성 재료는 목록·상세 모두에서 빠진다.
- 기한 설정·환산 단위(`defaultShelfDays`, `trackExpiry`, `units`)는 목록에도 포함한다. 입고 화면이 재료마다 상세를 부르지 않게 하기 위해서다 (PR #17 제안, v0.3.1).

```ts
interface IngredientSummary {
  id: UUID; name: string; category: string | null; unit: Unit; storage: StorageType;
  totalRemaining: number;      // 경과 포함 잔량 합
  availableRemaining: number;  // 사용 가능 재고 (BR-05)
  expiredRemaining: number;    // 경과 묶음 잔량 합
  minStock: number; targetStock: number | null; isLow: boolean;
  nearestExpiresAt: ISODate | null; daysLeft: number | null;  // 음수면 경과
  defaultShelfDays: number | null; trackExpiry: boolean;
  units: { unitName: string; factor: number }[];               // 환산 단위 이름 순
}
interface IngredientDetail extends IngredientSummary {
  lots: {                       // 잔량 > 0, 유통기한 오름차순 (null은 마지막)
    id: UUID; quantity: number; remaining: number; unitPrice: number | null;
    receivedAt: ISODate; expiresAt: ISODate | null; expirySource: ExpirySource | null; daysLeft: number | null;
  }[];
}
```

### `createIngredient` / `updateIngredient` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ id?(수정 시), name, category?, unit: Unit, minStock, targetStock?, storage, defaultShelfDays?, trackExpiry, units?: { unitName, factor }[] }` |
| 출력 | `{ id: UUID }` |
| 검증 | name 1~30자, minStock ≥ 0, targetStock ≥ minStock(입력 시), defaultShelfDays 1~3650, `trackExpiry=true`이면 defaultShelfDays 필수, unitName 1~10자·중복 없음(대소문자 무시)·`g/ml/ea/kg/L` 금지, factor > 0. 수정 시 `unit`은 묶음이 없을 때만 바꿀 수 있다 (잔량이 0인 과거 묶음도 묶음으로 본다 — 이력·단가가 옛 단위로 남아 있어서) |
| 처리 | `units`는 통째로 교체한다 |
| 에러 | `VALIDATION`, `CONFLICT`(같은 이름 — 비활성 재료 포함, 묶음이 있는데 기본 단위 변경), `NOT_FOUND`(없음·다른 매장·비활성) |
| 관련 | FR-ING-01, FR-ING-05(`units`), BR-03 |

### `deactivateIngredient` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ id: UUID }` |
| 출력 | `{ id: UUID }` |
| 에러 | `CONFLICT` — 잔량(사용 가능 + 경과)이 남아 있으면. 화면은 "남은 재고를 먼저 사용·폐기 처리해 주세요"를 보여 준다 |
| 관련 | FR-ING-01 |

## 4. 메뉴·레시피

| 함수 | 종류 | 입력 | 출력 | 관련 |
|---|---|---|---|---|
| `getMenus()` | 조회 | - | `{ id, name, price, isActive, isSpecial, cost?, costRate? }[]` (cost·costRate는 확장) | FR-MENU-01, 03 |
| `getMenu(id)` | 조회 | - | 메뉴 + `recipe: { ingredientId, name, unit, qty }[]` | FR-MENU-02 |
| `saveMenu` | Action | `{ id?, name, price, recipe: { ingredientId, qty }[] }` (qty는 1인분, 기본 단위) | `{ id }` | FR-MENU-01~02 |
| `deactivateMenu` | Action | `{ id }` | `{ id }` | FR-MENU-01 |

- `saveMenu`는 메뉴와 레시피를 함께 저장하고 레시피는 통째로 교체한다. 이름 1~30자, price ≥ 0 정수, 재료 중복·qty ≤ 0·다른 매장 재료면 `VALIDATION`, 같은 이름이면 `CONFLICT`.

## 5. 입고

### `receiveStock` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ receivedOn: ISODate, items: { ingredientId: UUID, qty: number, unit: InputUnit, totalPrice?: number, expiresAt?: ISODate }[] }` (1~30품목) |
| 처리 | 품목마다 단위 환산(1.4) → 기본 단위당 단가 = `totalPrice ÷ 기본 단위 수량` → 유통기한 결정(BR-01: `expiresAt` 있으면 manual, 없고 기한 추적 재료면 입고일 + 기본 보관일수로 default, 추적 제외면 null) → `rpc receive_stock` |
| 출력 | `{ lots: { lotId: UUID, ingredientId: UUID, name: string, quantity: number, unit: Unit, expiresAt: ISODate \| null, expirySource: ExpirySource \| null, basis: string \| null }[] }` |
| 검증 | qty > 0, totalPrice ≥ 0 정수, receivedOn ≤ 오늘, expiresAt ≥ receivedOn (UC-04 6a), 같은 재료 여러 줄 허용(묶음이 따로 생김), 비활성 재료 불가 |
| 에러 | `VALIDATION`, `NOT_FOUND` |
| 관련 | FR-STK-01~04, BR-01, BR-03 |

- `basis`는 계산 근거 문구다 (FR-STK-02). 예: default → `"입고일 + 기본 보관일수 3일"`, manual → `"직접 입력"`, 추적 제외 → `null`.
- 발주 목록 불러오기(FR-STK-05)는 화면이 `getOrder(id)`로 품목·수량을 채운 뒤 같은 `receiveStock`을 호출한다. 입고가 끝나면 사용자가 `setOrderStatus`로 입고완료를 표시한다.

## 6. 판매 마감

### `getSalesDay(soldOn)` (조회)
`{ soldOn, closed: boolean, items: { menuId, name, qty }[], shortages: Shortage[] }` — 활성 메뉴 전체, 최근 7일 판매량 순. 마감 전이면 `qty = 0`.

### `recordDailySales` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ soldOn: ISODate, sales: { menuId: UUID, qty: number(정수 ≥ 0) }[] }` |
| 처리 | 레시피 × 수량을 재료별로 합산 → FEFO 입력 조회(기준일 = 판매일, 경과 묶음 제외, `07_DB.md` 6장) → `planConsumption()` → `rpc record_daily_sales`. `STOCK_CONFLICT`면 최신 재고로 1회 다시 계획 |
| 출력 | `{ salesDayId: UUID, consumed: { ingredientId: UUID, qty: number }[], shortages: Shortage[] }` |
| 검증 | soldOn ≤ 오늘, qty 정수 ≥ 0, 수량 합계 > 0, 비활성 메뉴 불가 |
| 에러 | `VALIDATION`, `CONFLICT`(이미 마감한 날짜 — FR-USE-06 구현 전), `STOCK_CONFLICT` |
| 관련 | FR-USE-01, 02, 05, BR-02 (재입력 FR-USE-06은 확장, `07_DB.md` 10.2) |

## 7. 사용·폐기

### `recordUsage` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ usedOn: ISODate, items: { ingredientId: UUID, qty: number, unit?: InputUnit, memo?: string }[] }` (unit 생략 시 기본 단위, memo ≤ 100자) |
| 처리 | 단위 환산 → 같은 재료는 합침 → FEFO 계획(기준일 = 사용일, 경과 묶음 제외) → `rpc record_usage` (부족분은 `short_qty`로 기록). `STOCK_CONFLICT`면 1회 다시 계획 |
| 출력 | `{ recordIds: UUID[], shortages: Shortage[] }` |
| 검증 | usedOn ≤ 오늘, qty > 0 |
| 에러 | `VALIDATION`, `NOT_FOUND`, `STOCK_CONFLICT` |
| 관련 | FR-USE-03, 05, BR-02 |

### `recordWaste` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ lotId: UUID, qty: number(> 0, ≤ 잔량), reason: WasteReason, memo?: string }` |
| 처리 | `rpc record_waste` (경과 묶음도 폐기 가능) |
| 출력 | `{ lotId: UUID, remaining: number }` |
| 에러 | `VALIDATION`(폐기량 > 현재 잔량: 서버 액션이 RPC 전에 확인, `fields.qty`), `NOT_FOUND`, `STOCK_CONFLICT`(확인 이후 다른 기기에서 잔량이 줄어 RPC가 거부) |
| 관련 | FR-USE-04 |

### `getStockHistory({ from, to, type? })` (조회)
`{ date, type: "usage" | "waste", ingredientId, name, qty, unit, reason: WasteReason | null, memo: string | null, shortQty: number }[]` — 사용·폐기 기록 화면 목록 (최신순, 기간 최대 31일).

### `adjustLot` (Server Action, 확장)
| 항목 | 내용 |
|---|---|
| 입력 | `{ lotId: UUID, newRemaining: number(≥ 0, ≤ quantity), memo?: string }` |
| 처리 | `rpc adjust_lot` |
| 출력 | `{ lotId: UUID, delta: number }` |
| 관련 | FR-USE-07 |

## 8. 대시보드

### `getDashboard()` (조회)
```ts
interface Dashboard {
  today: ISODate;
  expiringLots: { lotId: UUID; ingredientId: UUID; name: string; remaining: number; unit: Unit; expiresAt: ISODate; daysLeft: number }[]; // 0 ≤ daysLeft ≤ 3, 기한 순
  expiredLots:  { lotId: UUID; ingredientId: UUID; name: string; remaining: number; unit: Unit; expiresAt: ISODate; daysLeft: number }[]; // daysLeft < 0, 따로 표시
  lowStock: { ingredientId: UUID; name: string; unit: Unit; availableRemaining: number; minStock: number }[];  // 사용 가능 재고 기준 (BR-05)
  weeklyWaste?: { thisWeek: number; lastWeek: number; daily: { date: ISODate; amount: number }[] };          // 원, 확장 FR-DASH-05
}
```
관련: FR-DASH-01~04 (AI 추천·발주 목록 바로가기는 화면 링크), 쿼리는 `07_DB.md` 6장

## 9. AI 메뉴 추천

### `POST /api/recommendations` (Route Handler, AI)
| 항목 | 내용 |
|---|---|
| 요청 본문 | `{ basis?: RecommendBasis }` (기본 `"expiry"`) |
| 처리 | ① `increment_ai_usage`로 한도 확인 ② 입력 스냅샷 구성: 사용 가능 묶음·임박 묶음, 메뉴·레시피, 최근 7일 판매량 ③ `getStrategy(basis).rankIngredients()`로 후보 재료 정렬 ④ `AiClient.generate(Recommendation)` — 스키마 불일치면 1회 재시도 ⑤ 후처리(11장) ⑥ `estCost` 계산 ⑦ `recommendations` 저장 |
| 응답 200 | `ActionResult<RecommendationView>` |
| 대체 동작 | ④가 재시도 후에도 실패하면 `ok: true, fallback: true`로 임박 재료가 들어간 기존 활성 메뉴를 규칙 기반으로 돌려준다(`newIdeas`는 빈 배열, UC-08 3a). 대체 대상 메뉴도 없으면 원래 에러를 돌려준다 |
| 에러 | `VALIDATION`(활성 메뉴 0개, basis 값 오류), `RATE_LIMITED`, `AI_FAILED`, `AI_INVALID_OUTPUT` |
| 제한 | `maxDuration = 60`, AI 타임아웃 45초 |
| 관련 | FR-REC-01~06, 08, BR-04, NFR-03, NFR-08 |

```ts
interface RecIngredient {
  ingredientId: UUID | null;          // 매장 재료와 연결되지 않으면 null
  name: string;
  qty: number;                        // 기본 단위 (연결 안 된 재료는 AI가 준 값 그대로, 단위 미상)
  unit: Unit | null;
  status: "have" | "short" | "unregistered";   // FR-REC-03
  availableQty: number | null;        // DB의 사용 가능 재고. unregistered면 null
}
interface RecommendationView {
  id: UUID;
  basis: RecommendBasis;
  fallback: boolean;     // true면 화면은 "AI 추천" 대신 "규칙 기반" 표시 (FR-REC-04·05)
  pushMenus: { menuId: UUID; name: string; reason: string; consumes: RecIngredient[] }[];  // consumes: 1인분 전체 레시피 (서버가 DB에서 채움)
  newIdeas: { index: number; name: string; ingredients: RecIngredient[]; steps: string[]; estCost: number; suggestedPrice: number | null }[];
  droppedCount: number;       // 없는 메뉴·형식 오류로 제외한 항목 수 (FR-REC-04)
  shortCount: number;         // status = short 재료 수
  unregisteredCount: number;  // status = unregistered 재료 수
}
```

- `estCost`는 연결된 재료만 최근 묶음 단가로 계산한 원 단위 정수다. `unregistered` 재료는 원가에서 빠지므로 화면에 "등록되지 않은 재료는 원가에 포함되지 않아요"를 함께 보여 준다.

### `getRecommendation(id)` (조회)
저장된 `RecommendationView`와 `accepted`를 돌려준다 (FR-REC-08).

### `acceptRecommendation` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ recommendationId: UUID, ideaIndex: number, name: string, price: number, ingredients: { ingredientId: UUID, qty: number }[] }` — 사용자가 검토·수정한 값 |
| 처리 | `saveMenu`와 같은 검증으로 메뉴(`is_special = true`)와 레시피 저장 → `recommendations.accepted = true` |
| 출력 | `{ menuId: UUID }` |
| 에러 | `VALIDATION`(연결되지 않은 재료가 남음, qty ≤ 0, 이름·가격 오류), `CONFLICT`(같은 이름 메뉴), `NOT_FOUND`(추천·아이디어 없음) |
| 관련 | FR-REC-07, BR-04 |

## 10. 발주 목록

### `getOrderDraft()` (조회)
| 항목 | 내용 |
|---|---|
| 처리 | 부족 재료(BR-05)마다 권장 발주량 = 적정 재고(없으면 최소 재고 × 2) − 사용 가능 재고 − 미입고 발주량(상태 `ordered`)을 계산해 정수로 올림, 0 이하는 제외 (BR-06, `lib/stock/order.ts`) |
| 출력 | `{ items: { ingredientId, name, unit, availableQty, targetQty, pendingQty, suggestedQty }[] }` |
| 관련 | FR-ORD-01, BR-06 |

### `saveOrder` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ id?: UUID, orderDate: ISODate, memo?: string, items: { ingredientId: UUID, qty: number }[] }` |
| 처리 | `rpc save_order` — 품목 통째 교체, qty ≤ 0 품목은 제외(UC-09 3a) |
| 출력 | `{ id: UUID }` |
| 검증 | 품목 재료 중복 없음, memo ≤ 200자 |
| 에러 | `VALIDATION`, `NOT_FOUND`, `CONFLICT`(작성중이 아닌 목록 수정) |
| 관련 | FR-ORD-02, 03 |

### `setOrderStatus` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ id: UUID, status: OrderStatus }` |
| 처리 | 허용 전이만: `draft → ordered`, `ordered → draft`(보내기 전 실수 되돌리기), `ordered → received`. 입고완료는 사용자가 직접 표시한다(부분 입고 포함) |
| 출력 | `{ id: UUID, status: OrderStatus }` |
| 에러 | `CONFLICT`(그 외 전이), `NOT_FOUND` |
| 관련 | FR-ORD-05 |

### `deleteOrder` (Server Action)
`{ id }` → `{ id }`. 작성중(draft)만 삭제할 수 있고, 아니면 `CONFLICT`. 관련: FR-ORD-03

### 조회
| 함수 | 반환 | 관련 |
|---|---|---|
| `getOrders({ from?, to? })` | `{ id, orderDate, status, itemCount, memo }[]` (날짜 내림차순, 같은 날 여러 목록 허용) | FR-ORD-03 |
| `getOrder(id)` | `{ id, orderDate, status, memo, items: { ingredientId, name, unit, qty }[] }` | FR-ORD-03, FR-STK-05 |

### 복사 텍스트
```ts
// lib/stock/order.ts — 순수 함수, 클라이언트에서 호출해 클립보드에 넣는다
export function formatOrderText(items: { name: string; qty: number; unit: Unit }[]): string;
// 한 줄에 "품목 수량단위". 기본 단위 기준으로, 1000 이상인 g·ml는 kg·L로 바꿔 소수 1자리 ("양파 2.5kg"), 그 외는 그대로 ("계란 30ea")
```
관련: FR-ORD-04, BR-06

---

## 11. AI 출력 스키마 (모델 ↔ 서버 계약)

> 모델에게 보내는 스키마. 서버는 이 결과를 그대로 쓰지 않고 검증·변환해 위의 응답 타입을 만든다. 호출은 `lib/ai`의 `AiClient`로만 한다 (`06_ARCHITECTURE.md` 7.1).

```ts
// lib/ai/schemas.ts
import { z } from "zod";

const RecIngredientOut = z.object({
  ingredientId: z.string().uuid().nullable(),   // 매장 재료 목록에 없으면 null
  name: z.string().min(1).max(30),
  qty: z.number().positive(),                   // 기본 단위
});

export const Recommendation = z.object({
  pushMenus: z.array(z.object({
    menuId: z.string().uuid(),
    reason: z.string().max(80),                 // 재료·수량은 받지 않는다. consumes는 서버가 레시피로 채움
  })).max(3),
  newIdeas: z.array(z.object({
    name: z.string().max(30),
    ingredients: z.array(RecIngredientOut).min(1),
    steps: z.array(z.string().max(120)).min(1).max(8),
    suggestedPrice: z.number().int().positive().nullable(),
  })).max(3),
});

// 확장 FR-ING-04 (AI 보관일수 추천)
export const StorageSuggestion = z.object({
  storage: z.enum(["fridge", "freezer", "room"]),   // SRS 1.3 온도 기준으로 판단
  defaultShelfDays: z.number().int().min(1).max(3650),
  category: z.enum(["vegetable", "meat", "seafood", "dairy", "sauce", "grain", "etc"]),
  unit: z.enum(["g", "ml", "ea"]),
  note: z.string().max(80),
});
```

**서버 후처리 규칙**
| 대상 | 규칙 |
|---|---|
| Recommendation — 메뉴 | 매장의 활성 메뉴가 아닌 `menuId` 항목은 제외하고 `droppedCount`에 더한다 (FR-REC-04) |
| Recommendation — 기존 메뉴 재료 | `pushMenus[].consumes`는 AI 출력이 아니라 그 메뉴의 **1인분 전체 레시피**(`recipe_items`)로 서버가 채운다. 임박 재료만 넣으면 다른 필수 재료의 부족을 놓치기 때문이다. 재료는 사용 가능 묶음의 가까운 기한 순(기한 없음은 마지막)으로 정렬해 임박 재료가 앞에 오게 한다. 화면은 "1인분 기준"으로 표시하고 총소진량·예상 판매량으로 표현하지 않는다. 규칙 기반 대체(UC-08 3a)도 같은 방식이다 |
| Recommendation — 재료 연결 | `ingredientId`가 매장 재료면 그대로 쓴다. 아니면(null 또는 다른 매장 ID) 이름을 정규화(공백 제거·소문자)해 매장 재료 이름과 정확히 일치하면 연결하고, 없으면 `unregistered` |
| Recommendation — 재고 대조 | 연결된 재료는 `qty > 사용 가능 재고`면 `short`, 아니면 `have` (기존 메뉴는 1인분 수량 기준). 항목을 **제거하지 않고** 표시만 한다. `availableQty`는 DB 값 (FR-REC-03, BR-04) |
| Recommendation — 원가 | `estCost`는 AI 값이 아니라 서버가 묶음 단가로 계산 |
| StorageSuggestion | 추천값은 입력 폼에 채우기만 하고, 사용자가 저장해야 반영된다 (BR-04) |

## 12. 확장 — 명세서 사진 입고 (WBS 4.7, FR-RCP-01~03)

필수 기능을 마친 뒤 착수한다. 스키마는 `07_DB.md` 10.1.

### `createReceipt` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ contentType: "image/jpeg" \| "image/png" \| "image/webp" }` |
| 출력 | `{ receiptId: UUID, uploadPath: string }` — 클라이언트는 Supabase Storage `receipts` 버킷의 `uploadPath`로 업로드 |
| 관련 | FR-RCP-01 |

### `POST /api/receipts/{id}/parse` (Route Handler, AI)
| 항목 | 내용 |
|---|---|
| 요청 본문 | 없음 |
| 전제 | 이미지 업로드 완료, `status = pending` 또는 `failed` |
| 처리 | 이미지 + 재료 목록 → `AiClient.generate(ReceiptParse)` → 검증 → 단위 환산·유통기한 미리보기 → `parsed_json` 저장, `status = parsed` |
| 응답 200 | `ActionResult<ParsedReceipt>` |
| 에러 | `NOT_FOUND`, `CONFLICT`(이미 확정), `AI_FAILED`, `AI_INVALID_OUTPUT`, `RATE_LIMITED` (실패 시 `status = failed`, 화면은 수동 입고로 전환 — FR-RCP-03) |
| 제한 | `maxDuration = 60` |
| 관련 | FR-RCP-01, 03 |

```ts
interface ParsedReceipt {
  receiptId: UUID;
  vendor: string | null;
  date: ISODate | null;
  lines: {
    lineNo: number;
    rawName: string;
    ingredientId: UUID | null;      // 서버가 존재 확인한 ID만
    ingredientName: string | null;
    qty: number;
    unit: InputUnit | null;         // 환산할 수 없는 단위면 null + 확인 필요
    totalPrice: number | null;
    confidence: "high" | "low";
    expiryPreview: { expiresAt: ISODate | null; source: ExpirySource | null };
  }[];
}
```

### `confirmReceipt` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ receiptId: UUID, receivedOn: ISODate, items: receiveStock의 items와 같은 형식 }` |
| 처리 | `receiveStock`과 같은 환산·기한 계산 → `rpc confirm_receipt`(입고 + 상태 `parsed → confirmed`, `07_DB.md` 10.1) |
| 출력 | `{ lotIds: UUID[] }` |
| 에러 | `VALIDATION`, `CONFLICT`(상태가 parsed가 아님), `NOT_FOUND` |
| 관련 | FR-RCP-02, BR-01, BR-04 |

```ts
// 확장 전용 AI 출력 스키마
export const ReceiptParse = z.object({
  vendor: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  items: z.array(z.object({
    rawName: z.string().min(1),
    matchedIngredientId: z.string().uuid().nullable(),
    quantity: z.number().positive(),
    unitText: z.string().nullable(),          // "kg", "단", "박스" 등 원문
    totalPrice: z.number().int().nonnegative().nullable(),
    confidence: z.enum(["high", "low"]),
  })).max(60),
});
```
후처리: `matchedIngredientId`가 매장 재료가 아니면 `null`, `unitText`가 1.4 규칙으로 환산되지 않으면 `unit = null`·`confidence = "low"`, 날짜(유통기한)는 서버가 BR-01로 계산하고 명세서에서 읽은 날짜는 사용자가 확인한 입력값으로만 쓴다.

## 13. 변경 이력
| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-10-27 | 초안 |
| v0.2 | 2026-10-27 | 기간을 일수에서 `Period`(일·월·년)로 변경 |
| v0.3 | 2026-11-03 | SRS v0.4 범위로 개정: 바코드·라벨·축산물·외부 API 어댑터와 `Period`·`EXTERNAL_API_FAILED` 삭제, 명세서 입고를 확장 절로 이동, 사용 기록·발주 목록 API 추가, AI 추천 계약을 보유/부족/미등록 표시·추천 기준·대체 결과 기준으로 변경, 요구사항 ID를 SRS v0.4로 정리 |
| v0.3.1 | 2026-11-10 | 3장 재료: `IngredientSummary`에 `defaultShelfDays`·`trackExpiry`·`units` 추가(Detail에서 이동, PR #17), `soon` 판정 기준·검색·비활성 처리 명시, 환산 단위 중복은 대소문자 무시, 기본 단위 잠금은 과거 묶음 포함 (PR #21) |
| v0.3.2 | 2026-11-10 | 9·11장 추천: `pushMenus[].consumes`를 1인분 전체 레시피로 정의하고 서버가 DB 레시피로 채움(임박 재료 앞으로 정렬), AI 출력 스키마에서 `pushMenus[].consumes` 삭제 (성윤우 3.10b 제안, 김형균 동의 · 임지섭 확인은 PR #33 리뷰) |
