# API 명세서

**시스템:** 재고콕
**버전:** v0.2 / 2026-10-27
**관련 문서:** `06_ARCHITECTURE.md`, `07_DB.md`, `03_SRS.md`

---

## 0. 구성

| 종류 | 용도 | 위치 |
|---|---|---|
| **조회 (Query)** | 서버 컴포넌트에서 직접 호출하는 읽기 함수 | `src/lib/queries/*` |
| **Server Action** | 화면에서 일어나는 데이터 변경 | `src/actions/*` |
| **Route Handler** | AI·외부 API 호출 (긴 실행시간, 클라이언트 fetch) | `src/app/api/*` |
| **RPC** | 재고를 바꾸는 원자적 DB 작업 | `07_DB.md` 5장 |

모든 Server Action과 Route Handler는 로그인 사용자의 매장(`storeId`)을 세션에서 구한다. **클라이언트가 보낸 storeId는 받지 않는다.**

## 1. 공통 규칙

### 1.1 결과 형식
```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
```
- Route Handler도 같은 JSON을 본문으로 돌려준다. HTTP 상태 코드는 아래 표를 따른다.

### 1.2 에러 코드

| 코드 | HTTP | 의미 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 로그인 필요 |
| `FORBIDDEN` | 403 | 다른 매장 데이터 접근 |
| `NO_STORE` | 409 | 매장 생성 전 |
| `VALIDATION` | 400 | 입력 검증 실패 (`fields`에 항목별 메시지) |
| `NOT_FOUND` | 404 | 대상 없음 |
| `CONFLICT` | 409 | 중복 이름, 잘못된 상태 전이 (예: 이미 확정된 명세서) |
| `STOCK_CONFLICT` | 409 | 계획 이후 재고가 바뀜 (서버가 1회 재시도 후에도 실패) |
| `AI_FAILED` | 502 | AI 호출 실패·타임아웃 |
| `AI_INVALID_OUTPUT` | 502 | AI 출력이 스키마에 맞지 않음 (재시도 후) |
| `EXTERNAL_API_FAILED` | 502 | 식약처·축산물 API 실패 |
| `RATE_LIMITED` | 429 | AI 일일 호출 한도 초과 |
| `INTERNAL` | 500 | 기타 서버 오류 |

### 1.3 공통 타입
```ts
type UUID = string;
type ISODate = string;           // "2026-10-28" (Asia/Seoul 기준 날짜)
type Unit = "g" | "ml" | "ea";
type InputUnit = Unit | "kg" | "L" | "custom";
type StorageType = "fridge" | "freezer" | "room";
type BaseDateType = "expiry" | "manufactured" | "laid" | "packed" | "slaughtered" | "received";
type ExpirySource = "default" | "label" | "api" | "manual";
type WasteReason = "expired" | "spoiled" | "mistake" | "other";
type Period = { value: number; unit: "day" | "month" | "year" };  // 계산 규칙: SRS BR-01
```

### 1.4 공통 입력 타입
```ts
// 입고할 묶음 1개 (명세서·바코드·수동 공통)
interface LotInput {
  ingredientId: UUID;
  quantity: number;              // 입력 단위 기준
  inputUnit: InputUnit;
  customFactor?: number;         // inputUnit = "custom"일 때 1단위당 기본 단위 양
  totalPrice?: number;           // 원, 정수
  receivedAt: ISODate;
  expiry: {
    baseDate?: ISODate;
    baseDateType?: BaseDateType;
    period?: Period;             // 라벨·API 기간
    manualExpiresAt?: ISODate;   // 사용자가 직접 지정
  };
}
```
서버는 `lib/stock/unit.ts`로 기본 단위 수량과 단가를, `lib/stock/expiry.ts`로 `expiresAt`·`expirySource`를 계산해 RPC에 넘긴다.

---

## 2. 매장·인증

### `createStore` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ name: string }` (1~50자) |
| 출력 | `{ storeId: UUID }` |
| 에러 | `UNAUTHORIZED`, `VALIDATION`, `CONFLICT`(이미 매장 있음) |
| 관련 | FR-AUTH-02 |

## 3. 재료

### 조회
| 함수 | 반환 |
|---|---|
| `getIngredients({ q?, storage?, status?: "soon" \| "low" })` | `IngredientSummary[]` |
| `getIngredient(id)` | `IngredientDetail` (묶음 목록 포함) |

```ts
interface IngredientSummary {
  id: UUID; name: string; category: string | null; unit: Unit; storage: StorageType;
  totalRemaining: number; minStock: number; isLow: boolean;
  nearestExpiresAt: ISODate | null; daysLeft: number | null;
}
interface IngredientDetail extends IngredientSummary {
  aliases: string[]; defaultShelfDays: number | null; trackExpiry: boolean;
  lots: {
    id: UUID; quantity: number; remaining: number; unitPrice: number | null;
    receivedAt: ISODate; baseDate: ISODate | null; baseDateType: BaseDateType | null;
    expiresAt: ISODate | null; expirySource: ExpirySource | null;
  }[];
}
```

### `createIngredient` / `updateIngredient` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ id?(수정 시), name, aliases?, category?, unit, minStock, storage, defaultShelfDays?, trackExpiry }` |
| 출력 | `{ id: UUID }` |
| 검증 | name 1~30자, minStock ≥ 0, defaultShelfDays 1~3650, `trackExpiry=true`이면 defaultShelfDays 필수 |
| 에러 | `VALIDATION`, `CONFLICT`(같은 이름) |
| 관련 | FR-ING-01 |

### `deactivateIngredient` (Server Action)
| 입력 | `{ id }` → 출력 `{ id }` / 잔량이 있으면 `CONFLICT` |

### `suggestStorage` (Server Action, AI)
| 항목 | 내용 |
|---|---|
| 입력 | `{ name: string }` |
| 출력 | `StorageSuggestion` (7장) |
| 에러 | `AI_FAILED`, `RATE_LIMITED` (실패해도 화면은 빈 값으로 진행) |
| 관련 | FR-ING-02 |

## 4. 메뉴·레시피

| 함수 | 종류 | 입력 | 출력 | 관련 |
|---|---|---|---|---|
| `getMenus()` | 조회 | - | `{ id, name, price, isActive, isSpecial, cost, costRate }[]` | FR-MENU-03 |
| `getMenu(id)` | 조회 | - | 메뉴 + `recipe: { ingredientId, name, unit, qty }[]` | |
| `upsertMenu` | Action | `{ id?, name, price, isActive }` | `{ id }` | FR-MENU-01 |
| `setRecipe` | Action | `{ menuId, items: { ingredientId, qty }[] }` (qty는 기본 단위) | `{ menuId }` | FR-MENU-02 |

`setRecipe`는 기존 레시피를 통째로 교체한다. 재료 중복, qty ≤ 0이면 `VALIDATION`.

## 5. 입고

### 5.1 명세서

#### `createReceipt` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ contentType: "image/jpeg" \| "image/png" \| "image/webp" }` |
| 출력 | `{ receiptId: UUID, uploadPath: string }` — 클라이언트는 Supabase Storage `receipts` 버킷의 `uploadPath`로 업로드 |
| 관련 | FR-RCP-01 |

#### `POST /api/receipts/{id}/parse` (Route Handler, AI)
| 항목 | 내용 |
|---|---|
| 요청 본문 | 없음 |
| 전제 | 이미지 업로드 완료, `status = pending` 또는 `failed` |
| 처리 | 이미지 + 재료 목록 → AI → 검증 → 단위 환산·기한 계산 → `parsed_json` 저장, `status = parsed` |
| 응답 200 | `ActionResult<ParsedReceipt>` |
| 에러 | `NOT_FOUND`, `CONFLICT`(이미 확정), `AI_FAILED`, `AI_INVALID_OUTPUT`, `RATE_LIMITED` (실패 시 `status = failed`) |
| 제한 | `maxDuration = 60` |
| 관련 | FR-RCP-02, 03 |

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
    quantity: number;
    inputUnit: InputUnit;
    totalPrice: number | null;
    confidence: "high" | "low";
    expiryPreview: { expiresAt: ISODate | null; source: ExpirySource; baseDate: ISODate | null; baseDateType: BaseDateType | null };
  }[];
}
```

#### `confirmReceipt` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ receiptId: UUID, lots: LotInput[], aliasLinks?: { ingredientId: UUID, alias: string }[] }` |
| 처리 | 단위 환산·기한 계산 → `rpc receive_stock` → 별칭 추가 |
| 출력 | `{ lotIds: UUID[] }` |
| 에러 | `VALIDATION`, `CONFLICT`(상태가 parsed가 아님), `FORBIDDEN` |
| 관련 | FR-RCP-04~06, FR-ING-05 |

### 5.2 바코드

#### `GET /api/barcode/{code}` (Route Handler)
| 항목 | 내용 |
|---|---|
| 경로 변수 | `code`: 숫자 8~14자리 (그 외 `VALIDATION`) |
| 처리 | 매장 매핑 → `products` 캐시(30일) → 식약처 API → 캐시 저장 |
| 응답 200 | `ActionResult<BarcodeLookup>` |
| 에러 | `EXTERNAL_API_FAILED` (이 경우에도 화면은 수동 등록 진행) |
| 관련 | FR-BAR-02, 03, 05 |

```ts
interface BarcodeLookup {
  barcode: string;
  source: "store" | "cache" | "api" | "none";
  ingredientId: UUID | null;        // source = "store"일 때
  product: {
    name: string; maker: string | null; foodType: string | null;
    shelfLifeText: string | null; shelfLifePeriod: Period | null;  // 서버가 문구를 기간으로 변환
  } | null;
  suggestedIngredients: { id: UUID; name: string }[];           // 이름 유사도 상위 3개
}
```

#### `linkBarcode` (Server Action)
| 입력 | `{ barcode: string, ingredientId: UUID }` |
|---|---|
| 출력 | `{ barcode, ingredientId }` (이미 있으면 덮어씀) |
| 관련 | FR-BAR-04 |

#### `receiveManual` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ source: "barcode" \| "manual", lots: LotInput[] }` |
| 처리 | 단위 환산·기한 계산 → `rpc receive_stock` |
| 출력 | `{ lotIds: UUID[] }` |
| 관련 | FR-BAR-06, 수동 입고 |

### 5.3 라벨 날짜 (P1)

#### `POST /api/labels/parse` (Route Handler, AI)
| 항목 | 내용 |
|---|---|
| 요청 | `multipart/form-data`: `image` (≤5MB) |
| 응답 200 | `ActionResult<LabelDate>` (7장) |
| 에러 | `VALIDATION`, `AI_FAILED`, `AI_INVALID_OUTPUT`, `RATE_LIMITED` |
| 관련 | FR-EXP-05 |

### 5.4 축산물 이력 (P2)

#### `GET /api/livestock/{traceNo}` (Route Handler)
| 항목 | 내용 |
|---|---|
| 경로 변수 | `traceNo`: 숫자 12자리 |
| 응답 200 | `ActionResult<{ traceNo: string; slaughteredAt: ISODate \| null; species: string \| null }>` |
| 관련 | FR-EXP-06 |

## 6. 판매·폐기·대시보드

### `getSalesDay(soldOn)` (조회)
`{ soldOn, items: { menuId, name, qty }[], shortages: Shortage[] }` — 메뉴는 최근 7일 판매량 순

### `recordDailySales` (Server Action)
| 항목 | 내용 |
|---|---|
| 입력 | `{ soldOn: ISODate, items: { menuId: UUID, qty: number(정수 ≥ 0) }[] }` |
| 처리 | 레시피 × 수량 = 필요량 → 기존 같은 날 차감을 되돌린 가상 재고로 `planConsumption()` → `rpc record_daily_sales` |
| 출력 | `{ salesDayId: UUID, consumed: { ingredientId, qty }[], shortages: Shortage[] }` |
| 에러 | `VALIDATION`(미래 날짜, 음수), `STOCK_CONFLICT` |
| 관련 | FR-SALE-01~04 |

```ts
interface Shortage { ingredientId: UUID; name: string; unit: Unit; requiredQty: number; shortQty: number }
```

### `recordWaste` (Server Action)
| 입력 | `{ lotId: UUID, qty: number(> 0, ≤ 잔량), reason: WasteReason, memo?: string }` |
|---|---|
| 처리 | `rpc apply_consumption(type = 'waste')` |
| 출력 | `{ movementId: UUID }` |
| 관련 | FR-WST-01, 03 |

### `adjustLot` (Server Action)
| 입력 | `{ lotId: UUID, newRemaining: number(≥ 0, ≤ quantity), memo?: string }` |
|---|---|
| 처리 | `rpc adjust_lot` |
| 출력 | `{ lotId, delta: number }` |
| 관련 | FR-WST-02 |

### `getDashboard()` (조회)
```ts
interface Dashboard {
  today: ISODate;
  expiring: { lotId: UUID; ingredientId: UUID; name: string; remaining: number; unit: Unit; expiresAt: ISODate; daysLeft: number }[]; // daysLeft ≤ 3, 지난 것 포함
  lowStock: { ingredientId: UUID; name: string; totalRemaining: number; minStock: number; unit: Unit }[];
  waste: { thisWeek: number; lastWeek: number; daily: { date: ISODate; amount: number }[] };  // 원
}
```
관련: FR-DASH-01~03

## 7. AI 메뉴 추천

### `POST /api/recommendations` (Route Handler, AI)
| 항목 | 내용 |
|---|---|
| 요청 본문 | `{ focus?: "expiring" \| "all" }` (기본 expiring) |
| 처리 | 입력 스냅샷 구성 → AI → 검증(ID, 재고) → 원가 계산 → `recommendations` 저장 |
| 응답 200 | `ActionResult<RecommendationView>` |
| 에러 | `AI_FAILED`, `AI_INVALID_OUTPUT`, `RATE_LIMITED`, `VALIDATION`(메뉴 0개) |
| 제한 | `maxDuration = 60` |
| 관련 | FR-REC-01~04, 06 |

```ts
interface RecommendationView {
  id: UUID;
  pushMenus: { menuId: UUID; name: string; reason: string; consumes: { ingredientId: UUID; name: string; qty: number; unit: Unit }[] }[];
  newIdeas: { index: number; name: string; ingredients: { ingredientId: UUID; name: string; qty: number; unit: Unit }[]; steps: string[]; estCost: number; suggestedPrice: number | null }[];
  droppedCount: number;   // 검증에서 제거된 항목 수 (디버그·평가용)
}
```

### `acceptRecommendation` (Server Action)
| 입력 | `{ recommendationId: UUID, ideaIndex: number, price: number }` |
|---|---|
| 처리 | 메뉴 생성(`is_special = true`) + 레시피 저장 + `accepted = true` |
| 출력 | `{ menuId: UUID }` |
| 관련 | FR-REC-05 |

---

## 8. AI 출력 스키마 (모델 ↔ 서버 계약)

> 모델에게 보내는 스키마. 서버는 이 결과를 그대로 쓰지 않고 검증·변환해 위의 응답 타입을 만든다.

```ts
// lib/ai/schemas.ts
import { z } from "zod";

export const ReceiptParse = z.object({
  vendor: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  items: z.array(z.object({
    rawName: z.string().min(1),
    matchedIngredientId: z.string().uuid().nullable(),
    quantity: z.number().positive(),
    unit: z.enum(["g", "kg", "ml", "L", "ea", "other"]),
    unitText: z.string().nullable(),          // "단", "박스" 등 원문
    totalPrice: z.number().int().nonnegative().nullable(),
    confidence: z.enum(["high", "low"]),
  })).max(60),
});

export const LabelDate = z.object({
  dateType: z.enum(["expiry", "manufactured", "packed", "laid", "none"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  periodText: z.string().nullable(),          // "제조일로부터 12개월"
  period: z.object({
    value: z.number().int().positive(),
    unit: z.enum(["day", "month", "year"]),
  }).nullable(),
  confidence: z.enum(["high", "low"]),
});

export const StorageSuggestion = z.object({
  storage: z.enum(["fridge", "freezer", "room"]),
  defaultShelfDays: z.number().int().min(1).max(3650),
  category: z.enum(["vegetable", "meat", "seafood", "dairy", "sauce", "grain", "etc"]),
  unit: z.enum(["g", "ml", "ea"]),
  note: z.string().max(80),
});

export const Recommendation = z.object({
  pushMenus: z.array(z.object({
    menuId: z.string().uuid(),
    reason: z.string().max(80),
    consumes: z.array(z.object({ ingredientId: z.string().uuid(), qty: z.number().positive() })),
  })).max(3),
  newIdeas: z.array(z.object({
    name: z.string().max(30),
    ingredients: z.array(z.object({ ingredientId: z.string().uuid(), qty: z.number().positive() })).min(1),
    steps: z.array(z.string().max(120)).min(1).max(8),
    suggestedPrice: z.number().int().positive().nullable(),
  })).max(3),
});
```

**서버 후처리 규칙**
| 대상 | 규칙 |
|---|---|
| ReceiptParse | `matchedIngredientId`가 매장 재료가 아니면 `null`로, `unit = other`면 `custom` + 확인 필요, 날짜 계산은 서버 |
| LabelDate | `date`가 오늘 기준 ±5년 밖이면 `confidence = low` |
| Recommendation | 없는 메뉴·재료 ID 항목 제거, 소진량 > 잔량인 항목 제거, `estCost`는 서버가 묶음 단가로 계산 |

## 9. 외부 API 어댑터 명세

### 9.1 식약처 바코드연계제품정보
| 항목 | 내용 |
|---|---|
| 호출 위치 | `lib/external/foodsafety.ts` (서버 전용) |
| 인증 | `FOODSAFETY_API_KEY` |
| 요청 형태 (예상) | `GET {BASE}/api/{KEY}/{SERVICE_ID}/json/1/5/BAR_CD={barcode}` |
| 타임아웃 | 5초 |
| 정규화 | 응답 → `ProductInfo { barcode, name, maker, foodType, shelfLifeText }` |

> 서비스 ID, URL 형식, 필드명은 **인증키 발급 후 실제 응답으로 확정**하고 이 표를 갱신한다 (WBS 2.8).

### 9.2 축산물 이력제 (선택)
| 항목 | 내용 |
|---|---|
| 호출 위치 | `lib/external/livestock.ts` |
| 정규화 | `{ traceNo, slaughteredAt, species }` |

> 엔드포인트·필드는 공공데이터포털 문서 확인 후 확정.

## 10. 변경 이력
| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-10-27 | 초안 |
| v0.2 | 2026-10-27 | 기간을 일수(`periodDays`)에서 `Period`(일·월·년)로 변경 |
