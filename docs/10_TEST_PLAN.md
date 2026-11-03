# 테스트 계획서

**시스템:** 재고콕
**버전:** v0.3 / 2026-11-03 (요구사항 정의서 v0.4 범위로 개정)
**관련 문서:** `03_SRS.md`, `07_DB.md`, `08_API_SPEC.md`, `04_WBS.md`(3.9 테스트 계획, 4.4 테스트 실행)

---

## 1. 목적과 범위

- **목적:** 재고 수량과 유통기한이 정확하게 계산·반영되는지, AI 추천이 재고 DB와 어긋나지 않는지, AI가 실패해도 재고 관리가 계속 동작하는지 검증한다.
- **범위:** SRS의 P0·P1 요구사항(F-01~F-05와 재료·메뉴·로그인), 비즈니스 규칙 BR-01~06, 비기능 요구사항 NFR-01~12
- **확장 범위:** 실사 보정(FR-USE-07), 주간 폐기 금액(FR-DASH-05), 메뉴 원가(FR-MENU-03), AI 보관일수 추천(FR-ING-04), 명세서 사진 입고(FR-RCP-01~03). 해당 작업(WBS 4.5~4.7)을 착수할 때만 9장 테스트를 실행한다.
- **범위 밖:** 부하 테스트, Claude API 자체의 정확성, 바코드·공공 API·라벨 날짜 인식·축산물 이력·PWA(요구사항에서 제외됨)

## 2. 테스트 수준과 도구

| 수준 | 대상 | 도구 | 실행 시점 |
|---|---|---|---|
| 단위 | `lib/stock/*` 계산 함수, `lib/ai/*` 후처리·Adapter·Strategy | Vitest | 커밋 전, PR CI |
| DB | RLS 정책, RPC 함수, 제약 조건 | Vitest + 로컬 Supabase (`supabase start`) | PR CI |
| 통합 | Server Action, Route Handler (AI는 `AI_MOCK=1`) | Vitest | PR CI |
| E2E | 필수 사용자 흐름 | Playwright (모바일 뷰포트 375×812) | 주간 점검, 기능 동결 전 |
| AI 평가 | 추천 결과의 재고 대조 일치율·유효율 | `pnpm eval:recommend` (실제 모델 호출, 비용 발생) | 프롬프트 변경 시, 13주 측정 |
| 사용성·실기기 | 과업 시간, 한 손 조작 | iPhone, Android 실기기 | 13주, 14주 |

### 2.1 원칙
- **도메인 로직은 실제 DB 없이 테스트한다.** 오늘 날짜(`today`)와 기준일은 항상 인자로 주입한다. 테스트에서 시스템 시계를 쓰지 않는다.
- AI는 `AI_MOCK=1`의 `MockAdapter` 고정 응답으로 테스트한다. 실제 모델 호출은 AI 평가(7장)에서만 한다.
- 테스트 이름에 이 문서의 ID를 붙인다 (예: `UT-FEFO-05: 부족분 반환`).
- 아래 표의 날짜는 모두 2026년이며, 별도 표시가 없으면 오늘 = 11/03이다.

## 3. 단위 테스트

### 3.1 유통기한 결정 `lib/stock/expiry.ts` (BR-01)

| ID | 입력 | 기대 결과 |
|---|---|---|
| UT-EXP-01 | 사용자 입력 11/05, 입고일 11/03, 기본 보관일수 3 | 11/05, source=manual (입력값 우선) |
| UT-EXP-02 | 입력 없음, 입고일 10/28, 기본 보관일수 30 | 11/27, source=default |
| UT-EXP-03 | 입력 없음, 입고일 11/03, 기본 보관일수 1 | 11/04, source=default |
| UT-EXP-04 | 입력 11/01, 입고일 11/03 (입고일보다 이름) | 오류 `VALIDATION` (UC-04 6a) |
| UT-EXP-05 | 월 경계: 입고일 10/30 + 3일 | 11/02 |
| UT-EXP-06 | `track_expiry = false` | null, source 없음 |
| UT-EXP-07 | 윤년 경계: 입고일 2028-02-27 + 2일 | 2028-02-29 |
| UT-EXP-08 | 연 경계: 입고일 12/30 + 5일 | 2027-01-04 |
| UT-EXP-09 | `daysLeft`: 오늘 10/28, 기한 10/27 | -1 |
| UT-EXP-10 | `daysLeft`: 오늘 11/03, 기한 11/03 | 0 |
| UT-EXP-11 | 계산 근거 문자열: 입고일 11/03 + 기본 5일 | "입고일 + 기본 보관일수 5일" (FR-STK-02) |

### 3.2 FEFO 계획 `lib/stock/fefo.ts` (BR-02)

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-FEFO-01 | 기준일 10/31, 묶음 A(기한 11/01, 500g), B(11/05, 500g), 필요 300g | A에서 300g |
| UT-FEFO-02 | 같은 조건, 필요 700g | A 500g + B 200g |
| UT-FEFO-03 | 기한 같음, 입고일 다름 | 입고일 빠른 것부터 |
| UT-FEFO-04 | 기한 null 묶음 포함 | null 묶음은 마지막 |
| UT-FEFO-05 | 사용 가능 총잔량 800g, 필요 1000g | 800g 차감 + 부족 200g |
| UT-FEFO-06 | 같은 날 재입력: 기존 차감 A 300g 되돌림 반영 (확장 FR-USE-06) | A 잔량을 +300으로 보고 다시 계획 |
| UT-FEFO-07 | 여러 재료 동시 | 재료별로 독립 계획, 결과는 lot_id 오름차순 |
| UT-FEFO-08 | 소수 수량 (0.1 + 0.2) | 부동소수 오차 없음 (소수 3자리 반올림) |
| UT-FEFO-09 | 기준일 11/03, 묶음 A(기한 11/02, 500g), B(11/05, 500g), 필요 300g | A 제외, B에서 300g |
| UT-FEFO-10 | 기준일 11/03, 경과 묶음 A(11/02, 500g)만 있음, 필요 300g | 차감 없음 + 부족 300g |
| UT-FEFO-11 | 기준일 11/03, 기한이 기준일과 같은 묶음(11/03) | 차감 대상에 포함 |

### 3.3 단위 환산 `lib/stock/unit.ts` (BR-03)

| ID | 입력 | 기대 결과 |
|---|---|---|
| UT-UNIT-01 | 10 kg → g | 10000 |
| UT-UNIT-02 | 1.5 L → ml | 1500 |
| UT-UNIT-03 | 대파 2 "단", `ingredient_units` 계수 1000 (g) | 2000 g |
| UT-UNIT-04 | 재료 단위 ea에 kg 입력 | 오류 `VALIDATION` |
| UT-UNIT-05 | 10kg 15,000원 → 기본 단위(g)당 단가 | 1.5 |
| UT-UNIT-06 | 3 "박스" 입력, 해당 재료에 "박스" 환산 단위 없음 | 오류 `VALIDATION`, `fields["items.0.unit"] = "환산 계수를 입력해 주세요"` |
| UT-UNIT-07 | 1.2345 kg → g | 1234.5 (소수 3자리 반올림) |

### 3.4 임박·경과·부족 판정 `lib/stock/status.ts` (BR-05)

| ID | 입력 (오늘 11/03) | 기대 결과 |
|---|---|---|
| UT-STAT-01 | 기한 11/02 | 경과 (expired) |
| UT-STAT-02 | 기한 11/03 | 임박, D-0 |
| UT-STAT-03 | 기한 11/06 | 임박, D-3 |
| UT-STAT-04 | 기한 11/07 | 정상 (D-4) |
| UT-STAT-05 | 기한 null (추적 제외) | 정상, 임박·경과 판정 안 함 |
| UT-STAT-06 | 묶음 A(경과, 500g) + B(11/05, 300g) + C(null, 200g) | 사용 가능 재고 500g, 경과 재고 500g |
| UT-STAT-07 | 최소 재고 0, 사용 가능 재고 0 | 부족 아님 (판정 안 함) |
| UT-STAT-08 | 최소 재고 1000g, 사용 가능 재고 999g | 부족 |
| UT-STAT-09 | 최소 재고 1000g, 사용 가능 재고 1000g | 부족 아님 (같으면 부족 아님) |
| UT-STAT-10 | 최소 재고 1000g, 총잔량 1500g 중 경과 800g | 사용 가능 700g → 부족 |

### 3.5 권장 발주량·복사 텍스트 `lib/stock/order.ts` (BR-06, FR-ORD-04)

| ID | 입력 | 기대 결과 |
|---|---|---|
| UT-ORD-01 | 적정 재고 10000g, 사용 가능 3000g, 미입고 0 | 7000g |
| UT-ORD-02 | 적정 재고 미입력, 최소 재고 4000g, 사용 가능 3000g | 적정 8000g 사용 → 5000g |
| UT-ORD-03 | 적정 10000g, 사용 가능 3000g, `ordered` 발주 목록에 같은 재료 5000g | 2000g |
| UT-ORD-04 | 적정 10000g, 사용 가능 6000g, 미입고 5000g | 0 이하 → 초안에서 제외 |
| UT-ORD-05 | 단위 ea, 적정 10, 사용 가능 7.4 | 3 (정수 올림) |
| UT-ORD-06 | 단위 g, 적정 5000, 사용 가능 2499.5 | 2501 (정수 올림, 소수 3자리 반올림 규칙과 별개) |
| UT-ORD-07 | `draft`·`received` 상태 발주 수량 | 미입고 발주량에 포함하지 않음 |
| UT-ORD-08 | `formatOrderText`: 양파 2500g, 계란 30ea, 우유 800ml | "양파 2.5kg", "계란 30개", "우유 800ml" 줄바꿈 텍스트 |
| UT-ORD-09 | `formatOrderText`: 간장 1000ml, 소금 999g | "간장 1L", "소금 999g" (1000 이상만 kg·L) |
| UT-ORD-10 | `formatOrderText`: 빈 목록 | 빈 문자열 |

### 3.6 AI 추천 후처리·Adapter·Strategy `lib/ai/*` (BR-04, FR-REC)

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-AI-03 | 스키마 불일치 응답 | 1회 재시도 후 `AI_INVALID_OUTPUT` |
| UT-AI-04 | 추천에 없는 메뉴 ID | 해당 항목 제외, droppedCount +1 (FR-REC-04) |
| UT-AI-05 | 소진량 > 사용 가능 재고 | 항목 유지, 해당 재료 `status = "short"`, shortCount +1 (제거하지 않음) |
| UT-AI-06 | 신규 아이디어 원가 | AI 값 무시, 서버가 묶음 단가로 계산한 `estCost` 사용 |
| UT-AI-09 | `AI_MOCK=1`에서 `getAiClient()` | `MockAdapter`, 같은 task면 같은 고정 응답 (Adapter) |
| UT-AI-10 | `ClaudeAdapter`, SDK가 타임아웃·오류 (SDK 목) | `AI_FAILED`로 변환, SDK 오류 타입이 밖으로 나가지 않음 |
| UT-AI-11 | `ExpiryFirst.rankIngredients` | 남은 일수 오름차순, 경과 묶음 제외 (Strategy) |
| UT-AI-12 | `CostFirst.rankIngredients`: 양파 3kg×1.5원/g, 두부 10모×900원 | 두부(9,000원) → 양파(4,500원) |
| UT-AI-13 | `PopularityFirst.rankIngredients` | 최근 7일 판매량 많은 메뉴의 재료가 앞 |
| UT-AI-14 | 같은 AI 응답을 세 기준으로 후처리 | 재고 대조·제외 결과가 기준과 상관없이 동일 |
| UT-AI-15 | 재료 `ingredientId = null`, name "바질" (매장에 없음) | `status = "unregistered"`, `availableQty = null`, unregisteredCount +1 |
| UT-AI-16 | 다른 매장 재료 ID, name " 양 파 " (매장에 "양파" 있음) | 이름 정규화(공백 제거·소문자)로 매장 "양파"에 연결, status는 재고로 판정 |
| UT-AI-17 | `ingredientId = null`, name "Tofu" / 매장 "tofu" | 대소문자 무시로 연결 |
| UT-AI-18 | 소진량 ≤ 사용 가능 재고 | `status = "have"`, `availableQty`는 AI 값이 아닌 DB 값 |
| UT-AI-19 | 같은 재료가 경과 묶음만 보유 | 사용 가능 재고 0 → `short` |
| UT-AI-20 | 규칙 기반 대체 추천: 임박 재료 두부(D-1)가 든 메뉴 2개, 안 든 메뉴 3개 | 두부 메뉴 2개만 pushMenus, newIdeas 빈 배열, `fallback = true` (UC-08 3a) |
| UT-AI-21 | 대체 추천: 임박 재료 없음 | pushMenus 빈 배열, `fallback = true`, 오류 아님 |

> **폐기된 ID:** UT-AI-01·02(명세서 인식 후처리 → 9.5 UT-RCP로 이동), UT-AI-07·08(라벨 날짜·기간 문구, 범위 밖). 번호는 재사용하지 않는다.

## 4. DB 테스트 (RLS, RPC, 제약)

| ID | 대상 | 시나리오 | 기대 결과 |
|---|---|---|---|
| DB-01 | RLS | 사용자 B가 A 매장 재료 조회 | 0건 |
| DB-02 | RLS | 사용자 B가 A 매장 store_id로 재료 insert | 거부 |
| DB-03 | RLS | `stock_movements` update/delete | 거부 (추가만) |
| DB-04 | RLS | 사용자 B가 A 매장 `purchase_orders`·`purchase_order_items` 조회·수정 | 0건 / 거부 |
| DB-05 | RLS | 사용자 B가 A 매장 `usage_records`·`ingredient_units`·`recommendations` 조회 | 0건 |
| DB-06 | `receive_stock` | 묶음 2개 입고 | 묶음 2 + `in` 이력 2, 잔량 = 수량 |
| DB-07 | `receive_stock` | 다른 매장 재료 ID 포함 | 전체 롤백, `NOT_FOUND` |
| DB-08 | `record_usage` | 사용 2품목, 그중 1품목 부족 | `usage_records` 2건(부족분 `short_qty` 기록), `use` 이동 이력, ref_type=usage |
| DB-09 | `record_usage` | 계획 이후 잔량이 바뀜 | `STOCK_CONFLICT`, 전체 롤백 |
| DB-10 | `record_daily_sales` | 정상 마감 | 판매·차감·이력이 한 트랜잭션, `sales_days.shortages` 저장 |
| DB-11 | `record_daily_sales` | 두 세션에서 동시에 같은 묶음 차감 | 한쪽 `STOCK_CONFLICT`, 잔량 음수 없음 |
| DB-12 | `record_waste` | 묶음 지정 폐기 300g (잔량 500g) | 잔량 200g, `waste` 이력, reason 저장 |
| DB-13 | `record_waste` | 잔량보다 큰 폐기 (서버 확인 이후 다른 기기에서 잔량이 줄어든 경우) | `STOCK_CONFLICT`, 롤백 |
| DB-14 | 제약 | `remaining > quantity` 또는 음수 잔량 직접 update | 거부 |
| DB-15 | 제약 | `target_stock < min_stock` insert | 거부 |
| DB-16 | `get_ingredient_stock(p_store_id, p_today)` | 시드 데이터, `p_today = 11/03` | 사용 가능·경과 잔량, `is_low`가 UT-STAT 계산과 일치. 함수 안에서 `now()`를 쓰지 않음(다른 `p_today`로 결과가 바뀜) |
| DB-17 | `increment_ai_usage` | 한도 초과 | `RATE_LIMITED` |

## 5. 통합 테스트 (Server Action, Route Handler)

| ID | 대상 | 시나리오 | 기대 결과 | 관련 FR |
|---|---|---|---|---|
| IT-AUTH-01 | 모든 Action | 미로그인 호출 | `UNAUTHORIZED` | AUTH-01 |
| IT-AUTH-02 | 매장 생성 | 첫 로그인 후 매장 이름 입력 | 매장 생성, 이후 Action에서 `NO_STORE` 없음 | AUTH-02 |
| IT-AUTH-03 | 모든 Action | 요청 본문에 다른 매장 `storeId` 포함 | 무시하고 세션 매장 기준 처리 | AUTH-03 |
| IT-ING-01 | `createIngredient` | 같은 이름 중복 | `CONFLICT` | ING-01 |
| IT-ING-02 | `createIngredient` | `trackExpiry=true`, 기본 보관일수 없음 | `VALIDATION` | ING-01 |
| IT-ING-03 | `createIngredient` | `targetStock < minStock` | `VALIDATION` | ING-01 |
| IT-ING-04 | `updateIngredient` | 환산 단위 `{unitName:"단", factor:1000}` 추가 | `ingredient_units` 저장, 입고 시 사용 가능 | ING-05 |
| IT-ING-05 | `deactivateIngredient` | 잔량(경과 포함) > 0 | `CONFLICT` | ING-01 |
| IT-ING-06 | `getIngredient` | 묶음 3개 | 묶음이 유통기한 순 (null 마지막) | ING-02 |
| IT-ING-07 | `getIngredients` | `status: "soon" / "expired" / "low"`, 이름 검색 | 각 조건에 맞는 재료만 | ING-03 |
| IT-MENU-01 | `saveMenu` | 이름·판매가·레시피 2개 | 메뉴 + `recipe_items` 저장 | MENU-01~02 |
| IT-MENU-02 | `saveMenu` | 소요량 0 | `VALIDATION` | MENU-02 |
| IT-MENU-03 | `deactivateMenu` | 비활성화 | 판매 마감·추천 대상에서 빠짐 | MENU-01 |
| IT-STK-01 | `receiveStock` | 3품목, 하나는 유통기한 입력·둘은 비움 | 묶음 3, 비운 품목은 BR-01 계산값과 근거 문자열 반환 | STK-01~02, 04 |
| IT-STK-02 | `receiveStock` | 2kg, 15,000원 (재료 단위 g) | 잔량 2000g, `unit_price` 7.5 | STK-01, 03 |
| IT-STK-03 | `receiveStock` | 환산 단위 없는 "박스" | `VALIDATION`, `fields["items.N.unit"]` | STK-03 |
| IT-STK-04 | `receiveStock` | 수량 0 또는 유통기한 < 입고일 | `VALIDATION`, 해당 행 표시 | STK-01 |
| IT-USE-01 | `recordDailySales` | 재고 부족 | 가능한 만큼 차감 + `shortages` 반환 | USE-01~02, 05 |
| IT-USE-02 | `recordDailySales` | 미래 날짜 | `VALIDATION` | USE-01 |
| IT-USE-03 | `recordDailySales` | 이미 마감한 날짜 다시 저장 (FR-USE-06 미구현 상태) | `CONFLICT` | USE-01, 06 |
| IT-USE-04 | `recordDailySales` | 경과 묶음만 남은 재료 | 차감 없음, 부족으로 기록 | USE-02, 05 |
| IT-USE-05 | `recordDailySales` | `STOCK_CONFLICT` 1회 발생 (목) | 서버가 다시 계획해 1회 재시도 후 성공 | USE-02 |
| IT-USE-06 | `recordUsage` | 직원 식사 2품목, 메모 | FEFO 차감, `usage_records` 저장 | USE-03 |
| IT-USE-07 | `recordUsage` | 사용량 > 사용 가능 재고 | 차감 + `shortages` 반환, `short_qty` 저장 | USE-03, 05 |
| IT-USE-08 | `recordWaste` | 경과 묶음 전량 폐기, reason=expired | 잔량 0, 대시보드 경과 목록에서 사라짐 | USE-04 |
| IT-USE-09 | `recordWaste` | 폐기량 > 현재 잔량 (입력 실수) | `VALIDATION`, `fields.qty`, RPC 호출 없음 | USE-04 |
| IT-DASH-01 | `getDashboard` | 시드 데이터, 오늘 11/03 | `expiringLots`는 D-0~D-3만 기한 순, `expiredLots`는 따로 | DASH-01~02 |
| IT-DASH-02 | `getDashboard` | 경과 재고가 많은 재료 | `lowStock`은 사용 가능 재고 기준 (총잔량 아님) | DASH-03 |
| IT-DASH-03 | `getDashboard` | 응답 | 추천·발주 바로가기 경로 포함 | DASH-04 |
| IT-REC-01 | `POST /api/recommendations` | 메뉴 0개 | `VALIDATION` | REC-01 |
| IT-REC-02 | `POST /api/recommendations` | AI 목 정상, `basis` 생략 | `basis = "expiry"`, 재료마다 status·availableQty, DB 저장 | REC-01~03, 06, 08 |
| IT-REC-03 | `POST /api/recommendations` | AI 목 응답에 없는 메뉴 1개·미등록 재료 1개·부족 재료 1개 | droppedCount 1, unregisteredCount 1, shortCount 1이 응답과 `recommendations`에 저장 | REC-03~04, 08 |
| IT-REC-04 | `POST /api/recommendations` | AI 목이 2회 연속 형식 오류 | `ok: true, fallback: true`, 규칙 기반 pushMenus, `recommendations.fallback = true` | REC-01, NFR-08 |
| IT-REC-05 | `POST /api/recommendations` | `basis: "cost"`, `"popularity"` | 입력 스냅샷의 재료 순서가 각 Strategy 결과와 같음 | REC-06 |
| IT-REC-06 | `POST /api/recommendations` | 일일 한도 초과 | `RATE_LIMITED`, AI 호출 0회 | NFR-12 |
| IT-REC-07 | 응답 | 정상 / 대체 | 정상은 `fallback=false`(화면 "AI 추천"), 대체는 `fallback=true`(화면 "규칙 기반") | REC-05 |
| IT-REC-08 | `acceptRecommendation` | 사용자가 이름·가격·재료 수량을 고쳐 등록 | 고친 값으로 `is_special` 메뉴 + 레시피, `accepted = true` | REC-07 |
| IT-REC-09 | `acceptRecommendation` | `unregistered` 재료가 남은 아이디어 | `VALIDATION` | REC-07, BR-04 |
| IT-REC-10 | 추천 후 | 추천만 받고 등록 안 함 | 메뉴·재고 변화 없음 | BR-04 |
| IT-ORD-01 | `getOrderDraft` | 부족 재료 3개, 그중 1개는 미입고 발주로 충분 | 2개만, `suggestedQty`는 UT-ORD 계산과 일치 | ORD-01 |
| IT-ORD-02 | `saveOrder` | 초안에서 1개 삭제·1개 추가·수량 수정 | 수정한 그대로 `draft` 저장, 수량 0 품목은 제외 | ORD-02~03 |
| IT-ORD-03 | `saveOrder` | `ordered` 상태 목록 수정 | `CONFLICT` | ORD-03, 05 |
| IT-ORD-04 | `setOrderStatus` | draft→ordered, ordered→draft, ordered→received | 모두 성공, `ordered_at`·`received_at` 기록 | ORD-03, 05 |
| IT-ORD-05 | `setOrderStatus` | draft→received, received→draft, received→ordered | `CONFLICT` | ORD-05 |
| IT-ORD-06 | `deleteOrder` | `ordered` 상태 삭제 | `CONFLICT` (draft만 삭제 가능) | ORD-05 |
| IT-ORD-07 | `getOrders` / `getOrder` | 같은 날 목록 2개, 기간 조회 | 날짜별로 둘 다 조회 | ORD-03 |
| IT-ORD-08 | `getOrder` + `formatOrderText` | 저장된 목록 | 복사 텍스트가 UT-ORD-08 형식 | ORD-04 |
| IT-ORD-09 | `getOrderDraft` | 부족 재료 없음 | 빈 items (화면은 "부족한 재료가 없어요") | ORD-01 |
| IT-STK-05 | 입고 화면 불러오기 | `ordered` 목록을 불러와 입고 | 품목·수량이 미리 채워짐 (P1) | STK-05 |

## 6. E2E 테스트 (Playwright, 모바일 뷰포트 375×812)

| ID | 시나리오 | 확인 사항 | 관련 |
|---|---|---|---|
| E2E-01 | 첫 사용자: 로그인 → 매장 생성 → 빈 대시보드 | 빈 상태 문구와 [입고하기] 버튼 | UC-01 |
| E2E-02 | 재료 등록(적정 재고·환산 단위 "단") → 메뉴·레시피 등록 | 재료 목록·메뉴 상세에 표시 | UC-02, UC-03 |
| E2E-03 | 입고 3품목(하나는 "단" 단위, 하나는 유통기한 비움) → 판매 마감 → 대시보드 | 계산된 유통기한·근거 표시, 차감 후 잔량, 부족 재료가 대시보드에 표시 | UC-04, UC-05, UC-07 |
| E2E-04 | 사용 기록(직원 식사) → 대시보드 경과 묶음 [폐기 처리] | 잔량 감소, 경과 목록에서 사라짐 | UC-06, UC-07 |
| E2E-05 | 추천: 기준 "원가 우선" 선택 → 추천 받기(AI 목) → 특선 수정 후 등록 | 보유/부족/미등록 표시, "AI 추천" 표시, 메뉴 목록에 특선 | UC-08 |
| E2E-06 | 추천 실패 경로: AI 목 실패 | "추천을 만들지 못했어요" 안내 + 규칙 기반 메뉴, 막다른 화면 없음 | UC-08 3a, NFR-08 |
| E2E-07 | 발주: 초안 확인 → 수량 수정 → 저장 → 복사 → 발주완료 → 입고완료 | 클립보드 텍스트 형식, 상태 변화 | UC-09 |
| E2E-08 | 다른 계정 격리: 계정 B로 로그인해 A 매장 재료 URL 직접 접근 | A 데이터 보이지 않음 (404 또는 빈 화면) | NFR-09 |

## 7. AI 평가 (`pnpm eval:recommend`)

### 7.1 데이터
- `eval/recommend/`: 가상 데이터(재료 30종, 메뉴 15개, 판매 14일)로 만든 재고 상황 시나리오 5개. 각 시나리오에 임박·경과·부족 재료와 정답(보유/부족 여부)이 들어 있다.
- 기준 3개(expiry·cost·popularity)를 섞어 시나리오당 4회, **총 20회** 실행한다.

### 7.2 지표

| 지표 | 계산 | 목표 | 관련 |
|---|---|---|---|
| 재고 대조 일치율 | 추천에 나온 재료 중 status(have/short/unregistered)가 DB 정답과 같은 비율 | **100%** | NFR-03 |
| 추천 유효율 | 1 − droppedCount / 전체 추천 항목 | ≥ 90% | FR-REC-04 |
| 임박 재료 활용률 | expiry 기준 추천 중 D-3 이내 재료를 하나 이상 소진하는 비율 | ≥ 80% | FR-REC-01 |
| 미등록 재료 비율 | unregisteredCount / 전체 재료 언급 | 기록만 (프롬프트 개선 지표) | FR-REC-03 |
| 응답 시간 | 추천 요청 P95 (서버 수신 → 응답) | ≤ 15초 | NFR-06 |
| 대체 추천 발생률 | fallback = true 비율 | 기록만 | NFR-08 |

### 7.3 실행
- 실제 모델을 호출하므로 비용이 든다. 프롬프트·스키마·Strategy를 바꿀 때와 13주 측정(WBS 4.4) 때만 실행한다.
- 결과는 `eval/results/{날짜}-recommend.md`로 저장하고, 결과 표를 PR과 AI 활용 검증 보고서(12.3)에 첨부한다.

## 8. 비기능 테스트

| ID | NFR | 방법 | 기준 |
|---|---|---|---|
| NFT-01 | NFR-01 | `lib/stock` 단위 테스트(3.1~3.5) 전체 실행 | 전부 통과 (손계산 기대값과 100% 일치) |
| NFT-02 | NFR-02, 07 | DB-09·DB-11, IT-USE-05 | 잔량 음수 0건, 부분 반영 0건 |
| NFT-03 | NFR-03 | 7장 `pnpm eval:recommend` 20회 | 재고 대조 일치율 100% |
| NFT-04 | NFR-04 | 8.1 사용성 측정 절차 | 입고 1품목 30초 이내, 판매 마감(메뉴 10개) 2분 이내 (3명 모두) |
| NFT-05 | NFR-05 | 375×812 화면 점검표 + axe (Playwright) | 주요 버튼 높이 44px 이상, 유통기한 "D-2"+날짜+색 표시, 심각 접근성 위반 0건 |
| NFT-06 | NFR-06 | Vercel 분석 / Playwright 측정 (각 5회) | 일반 화면 응답 1초 이내, AI 추천 15초 이내·진행 상태 표시 |
| NFT-07 | NFR-08 | `AI_MOCK=fail` 모의 장애에서 E2E-03·E2E-06 | 재고 기능 정상, 대체 추천과 실패 안내 표시 |
| NFT-08 | NFR-09 | DB-01~05, IT-AUTH-03, E2E-08 | 다른 매장 데이터 0건 |
| NFT-09 | NFR-10 | 빌드 결과물(`.next/static`)에서 `ANTHROPIC`, `SERVICE_ROLE` 검색 | 0건 |
| NFT-10 | NFR-11 | `pnpm test --coverage` (`lib/stock`) | 라인 커버리지 80% 이상 |
| NFT-11 | NFR-12 | 설정 점검 + IT-REC-06 | 매장별 일일 한도 동작, CI에서 `AI_MOCK=1` |
| NFT-12 | 호환성 (C-01) | 실기기: iOS Safari, Android Chrome 최신 2개 버전 | E2E-03·05·07 수동 확인 통과 |

### 8.1 사용성 과업 시간 측정 절차 (NFR-04)
1. **대상:** 팀원이 아닌 사용자 3명 (같은 수업 다른 팀 학생 가능). 사전 연습 없이 1분 화면 소개만 한다.
2. **준비:** 시드 데이터가 들어간 매장, 실기기(스마트폰) 사용, 화면 녹화 켬.
3. **과업 A:** 입고 화면 진입 후 지정 재료 1품목(수량·단위·금액) 입고 완료까지 시간.
4. **과업 B:** 판매 마감 화면 진입 후 메뉴 10개 수량 입력·저장까지 시간.
5. **기록:** 사람별 시간, 실수·도움 요청 횟수, 한 줄 의견을 12.1 결과표 형식으로 남긴다.
6. **판정:** 3명 모두 기준 이내면 통과. 1명이라도 넘으면 결함(심각도 3)으로 등록하고 화면을 고친 뒤 다시 측정한다.

## 9. 확장 기능 테스트 (WBS 4.5~4.7 착수 시에만)

### 9.1 판매 재입력 (FR-USE-06)

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-FEFO-06 | (3.2 참고) 기존 차감 되돌림 반영 계획 | 3.2와 같음 |
| DB-X01 | `record_daily_sales` 같은 날 2회 저장 (23 → 20) | 최종 잔량이 20 기준과 같음, 이력에 되돌림 존재 |
| IT-X01 | `recordDailySales` 이미 마감한 날짜 | IT-USE-03 대신: 기존 수량 불러오기 후 재계산 |

### 9.2 실사 보정 (FR-USE-07)

| ID | 상황 | 기대 결과 |
|---|---|---|
| DB-X02 | `adjust_lot` 잔량을 수량보다 크게 | `VALIDATION` |
| IT-X02 | 실사 수량 입력 (시스템 500g, 실사 450g) | 잔량 450g, `adjust` 이력 −50 |

### 9.3 주간 폐기 금액 (FR-DASH-05)

| ID | 상황 | 기대 결과 |
|---|---|---|
| IT-X03 | `getDashboard` 이번 주·지난주 폐기 | `weeklyWaste` 금액과 증감이 시드 기대값과 일치 (주 시작은 KST 월요일) |

### 9.4 메뉴 원가 (FR-MENU-03)

| ID | 입력 | 기대 결과 |
|---|---|---|
| UT-COST-01 | 레시피 원가 (두부 1모 900원 × 1 + 양파 100g × 1.5원/g) | 1,050원 |
| UT-COST-02 | 판매가 7,000원, 원가 1,050원 | 원가율 15.0% |
| UT-COST-03 | 단가 없는 묶음만 있는 재료 | 원가 "알 수 없음" (0으로 계산하지 않음) |

### 9.5 AI 보관일수 추천 (FR-ING-04)·명세서 사진 입고 (FR-RCP-01~03)

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-STO-01 | 보관일수 추천 응답 storage=fridge, days=7 | 화면에 "AI 추천" 표시로 채움, 저장은 사용자 확정 후 |
| UT-RCP-01 | 명세서 응답의 `matchedIngredientId`가 다른 매장 재료 | null로 변경 |
| UT-RCP-02 | `unit = other`, `unitText = "박스"` | 환산 단위 확인 필요 표시 |
| IT-RCP-01 | 명세서 인식 AI 목 정상 | 확인 화면용 행 목록, 확정 전 재고 변화 없음 |
| IT-RCP-02 | 명세서 인식 AI 목 실패 | 수동 입고 화면으로 전환 안내 |
| E2E-X01 | 명세서 사진 → 확인 화면 1행 수정 → 입고 | 재료 상세에 묶음 |

명세서 인식 정확도 평가(`pnpm eval:receipts`)는 4.7 착수 시 지표(품목 재현율 ≥ 90%, 품목·수량 정확도 ≥ 85%)를 정해 실행한다.

## 10. 진입·종료 기준

| 시점 | 기준 |
|---|---|
| 각 PR 머지 | lint·typecheck·단위·DB·통합 테스트 통과, 바꾼 `lib/stock`·`lib/ai`에 테스트 ID가 붙은 테스트 추가 |
| M2 설계 (11/09) | 이 문서의 단위 테스트 표(3장) 검토 완료 |
| M3 중간 산출물 (11/16) | 3.1~3.5 단위 테스트, DB-01~DB-12, IT-ING·IT-MENU·IT-STK·IT-USE 통과, E2E-01~04 통과 |
| M4 필수 기능 완료 (11/23) | 모든 IT, E2E-01~08 통과, AI 평가 20회 완료(재고 대조 일치율 100%), 사용성 측정 완료 |
| 기능 동결 (11/24) | 심각도 1·2 결함 0건, NFT-10 커버리지 80% 이상 |
| M5 최종 산출물 (11/30) | 8장 비기능 테스트 전부 판정, 테스트 결과표·AI 활용 검증 보고서 완성 |

## 11. 결함 관리

| 심각도 | 정의 | 처리 기한 |
|---|---|---|
| 1 치명 | 재고 수량·유통기한이 틀리게 저장, 다른 매장 데이터 노출, AI 결과가 확인 없이 반영 | 즉시 |
| 2 높음 | 필수 흐름(입고·마감·사용·추천·발주) 진행 불가 | 1일 |
| 3 보통 | 우회 가능한 기능 오류, 사용성 기준 미달 | 해당 주 |
| 4 낮음 | 화면·문구 | 14주 기능 동결 전 |

결함은 GitHub Issue에 `bug`, `sev-1`~`sev-4` 라벨로 등록하고 12.2 양식으로 적는다.

## 12. 산출물 양식

### 12.1 테스트 결과표 (⑥, WBS 4.4)

| 테스트 ID | 요구사항 | 실행일 | 실행자 | 기대 결과 | 실제 결과 | 판정 (통과/실패/보류) | 결함 ID |
|---|---|---|---|---|---|---|---|
| UT-FEFO-09 | BR-02 | 2026-11-12 | 성윤우 | A 제외, B에서 300g | (작성) | (작성) | - |

결과표 아래에 수준별 요약(전체·통과·실패·보류 개수)과 미통과 항목의 조치 계획을 적는다.

### 12.2 결함 기록

| 항목 | 내용 |
|---|---|
| 결함 ID | GitHub Issue 번호 |
| 발견 테스트 ID | 예: IT-USE-04 |
| 심각도 | 1~4 (11장) |
| 재현 절차 | 번호 목록 |
| 기대 결과 / 실제 결과 | |
| 원인 | 수정 후 작성 |
| 조치·확인 | 수정 PR, 재실행 테스트 ID와 결과 |

### 12.3 AI 활용 검증 보고서 목차 (WBS 5.4)

1. **개요:** AI 기능(메뉴 추천, 확장 기능 사용 시 포함)과 검증 목적
2. **검증 장치:** 출력 스키마 강제, 재고 DB 대조(보유/부족/미등록), 서버 계산 덮어쓰기, 사용자 확인 후 반영(BR-04), 대체 추천
3. **평가 방법:** 7장 데이터·실행 횟수·기준별 분포
4. **결과:** 7.2 지표 표 (재고 대조 일치율, 유효율, 임박 재료 활용률, 미등록 비율, 응답 시간 P95, 대체 추천 발생률), 기준별 비교
5. **오류 사례:** 미등록·부족·제외된 추천의 대표 사례와 원인 분석
6. **개선 이력:** 프롬프트·Strategy 변경 전후 지표
7. **개발 과정의 AI 도구 활용:** `docs/logs/ai-usage.md` 요약 (단계·도구·채택 여부·검증 방법)
8. **한계와 향후 과제**

## 13. 요구사항 → 테스트 추적표

| 요구사항 | 테스트 ID |
|---|---|
| FR-AUTH-01 | IT-AUTH-01, E2E-01 |
| FR-AUTH-02 | IT-AUTH-02, E2E-01 |
| FR-AUTH-03 | IT-AUTH-03, DB-01~05, E2E-08 |
| FR-ING-01 | IT-ING-01~03, IT-ING-05, E2E-02 |
| FR-ING-02 | IT-ING-06 |
| FR-ING-03 | IT-ING-07 |
| FR-ING-04 (확장) | UT-STO-01 |
| FR-ING-05 | IT-ING-04, UT-UNIT-03, UT-UNIT-06 |
| FR-STK-01 | IT-STK-01~02, IT-STK-04, E2E-03 |
| FR-STK-02 | UT-EXP-01~11, IT-STK-01 |
| FR-STK-03 | UT-UNIT-01~07, IT-STK-02~03 |
| FR-STK-04 | DB-06~07, IT-STK-01 |
| FR-STK-05 | IT-STK-05 |
| FR-MENU-01 | IT-MENU-01, IT-MENU-03, E2E-02 |
| FR-MENU-02 | IT-MENU-01~02 |
| FR-MENU-03 (확장) | UT-COST-01~03 |
| FR-USE-01 | IT-USE-01~03, E2E-03 |
| FR-USE-02 | UT-FEFO-01~11, DB-10~11, IT-USE-04~05 |
| FR-USE-03 | DB-08~09, IT-USE-06~07, E2E-04 |
| FR-USE-04 | DB-12~13, IT-USE-08~09, E2E-04 |
| FR-USE-05 | UT-FEFO-05, UT-FEFO-10, IT-USE-01, IT-USE-07 |
| FR-USE-06 (P1) | IT-USE-03(미구현 시), 9.1 |
| FR-USE-07 (확장) | DB-X02, IT-X02 |
| FR-DASH-01 | UT-STAT-02~04, IT-DASH-01, E2E-03 |
| FR-DASH-02 | UT-STAT-01, IT-DASH-01, IT-USE-08, E2E-04 |
| FR-DASH-03 | UT-STAT-06~10, DB-16, IT-DASH-02 |
| FR-DASH-04 | IT-DASH-03 |
| FR-DASH-05 (확장) | IT-X03 |
| FR-REC-01 | UT-AI-11, IT-REC-01~02, IT-REC-04 |
| FR-REC-02 | IT-REC-02, E2E-05 |
| FR-REC-03 | UT-AI-05, UT-AI-15~19, IT-REC-03, NFT-03 |
| FR-REC-04 | UT-AI-03~04, IT-REC-03 |
| FR-REC-05 | IT-REC-07, E2E-05 |
| FR-REC-06 | UT-AI-11~14, IT-REC-05, E2E-05 |
| FR-REC-07 | IT-REC-08~09, E2E-05 |
| FR-REC-08 | IT-REC-02~04 |
| FR-ORD-01 | UT-ORD-01~07, IT-ORD-01, IT-ORD-09 |
| FR-ORD-02 | IT-ORD-02, E2E-07 |
| FR-ORD-03 | IT-ORD-02~04, IT-ORD-07 |
| FR-ORD-04 | UT-ORD-08~10, IT-ORD-08, E2E-07 |
| FR-ORD-05 | IT-ORD-03~06 |
| FR-RCP-01~03 (확장) | UT-RCP-01~02, IT-RCP-01~02, E2E-X01 |
| BR-01 | UT-EXP-01~11 |
| BR-02 | UT-FEFO-01~11 |
| BR-03 | UT-UNIT-01~07 |
| BR-04 | UT-AI-06, UT-AI-18, IT-REC-09~10 |
| BR-05 | UT-STAT-01~10, DB-16 |
| BR-06 | UT-ORD-01~07 |
| NFR-01~12 | 8장 NFT-01~11 |
