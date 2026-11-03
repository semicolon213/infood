# 아키텍처 설계서

> ⚠️ **개정 예정 (2026-10-28):** 10주차 피드백으로 범위를 줄였다(요구사항 정의서 v0.3). 바코드·식약처 API·라벨 날짜 인식·축산물 이력 관련 내용은 범위에서 빠졌고, 명세서 인식은 확장(선택) 기능이 되었다. 사용 기록·발주 목록(F-05)이 추가되었다. 이 문서는 11주차 시스템 설계서 작성 때 개정한다. 그 전까지 범위는 `03_SRS.md`가 기준이다.

**시스템:** 재고콕 — 소상공인용 식자재 재고 관리 및 AI 메뉴 추천 시스템
**버전:** v0.2 / 2026-10-27
**관련 문서:** `03_SRS.md`, `08_API_SPEC.md`, `07_DB.md`, `09_DESIGN.md`

---

## 1. 설계 원칙

| 원칙 | 내용 |
|---|---|
| **AI는 제안만 한다** | AI 출력은 사용자 확인 없이 재고·재료·메뉴에 반영하지 않는다 (SRS BR-04) |
| **계산은 코드가 한다** | 날짜 계산, 단위 환산, 원가 계산, FEFO 차감은 AI가 아니라 순수 함수가 한다 |
| **재고 변경은 원자적으로** | 재고를 바꾸는 작업은 Postgres 함수(RPC) 하나로 처리해 부분 반영을 막는다 |
| **이력은 지우지 않는다** | `stock_movements`는 추가만 한다. 되돌리기는 반대 방향 이력을 추가한다 |
| **비밀은 서버에만** | Claude·식약처 API 키는 서버 환경변수로만 쓴다 |
| **외부 의존은 감싼다** | AI·외부 API는 `lib/ai`, `lib/external` 뒤에 숨겨 교체·목(mock) 처리가 쉽게 한다 |

## 2. 시스템 구성도

```text
┌───────────────────────────── 휴대폰 브라우저 ─────────────────────────────┐
│  Next.js 클라이언트 컴포넌트 (shadcn/ui, Tailwind)                          │
│  - ZXing 바코드 스캐너       - 이미지 압축 후 업로드                          │
│  - 확인 화면 편집            - 기한 미리보기 (lib/stock 순수 함수 공유)        │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ HTTPS (Server Actions / Route Handlers / Supabase Storage 업로드)
┌───────────────▼──────────────── Vercel (Next.js 서버) ────────────────────┐
│  app/ (RSC 페이지)  ──▶  lib/queries (조회)                                 │
│  actions/ (Server Actions: 변경)                                           │
│  app/api/ (Route Handlers: AI·외부 API, maxDuration 60s)                    │
│        │                    │                        │                     │
│        ▼                    ▼                        ▼                     │
│  lib/stock (도메인 순수 함수)  lib/ai (프롬프트·스키마·검증)  lib/external (어댑터) │
└────────┬───────────────────────┬──────────────────────────┬───────────────┘
         ▼                       ▼                          ▼
 ┌──────────────┐       ┌─────────────────┐     ┌─────────────────────────┐
 │  Supabase     │       │  Claude API      │     │ 식약처 바코드 API         │
 │  Postgres+RLS │       │  Sonnet 5.5      │     │ 축산물 이력제 API (선택)   │
 │  RPC 함수     │       │  Haiku 5.5       │     └─────────────────────────┘
 │  Auth         │       └─────────────────┘
 │  Storage      │
 └──────────────┘
```

## 3. 계층 구조

| 계층 | 위치 | 책임 | 의존 가능 대상 |
|---|---|---|---|
| 표현 (UI) | `src/app`, `src/components` | 화면, 폼, 상태 표시 | actions, queries, lib/stock(순수 함수) |
| 진입점 | `src/actions`, `src/app/api` | 인증 확인, 입력 검증(Zod), 유스케이스 조합, 결과 변환 | lib/* |
| 도메인 | `src/lib/stock` | FEFO 계획, 기한 계산, 단위 환산, 원가 계산 | **없음 (순수 함수)** |
| AI | `src/lib/ai` | 프롬프트, 출력 스키마, 후처리 검증 | lib/stock (검증용) |
| 외부 연동 | `src/lib/external` | 식약처·축산물 API 어댑터, 응답 정규화 | - |
| 데이터 | `src/lib/supabase`, `src/lib/queries`, `supabase/migrations` | 클라이언트 생성, 조회 쿼리, 스키마·RLS·RPC | - |

**규칙:** 도메인 계층(`lib/stock`)은 DB·네트워크·`Date.now()`에 의존하지 않는다. 오늘 날짜도 인자로 받는다. 그래야 단위 테스트가 쉽다.

## 4. 폴더 구조

```text
src/
  app/
    (auth)/login/  (auth)/onboarding/
    (main)/
      page.tsx                     # 대시보드
      ingredients/  [id]/
      receive/  receipt/[id]/  barcode/
      sales/  menus/  [id]/  recommend/  waste/
      layout.tsx                   # 하단 탭
    api/
      receipts/[id]/parse/route.ts
      labels/parse/route.ts
      barcode/[code]/route.ts
      livestock/[traceNo]/route.ts
      recommendations/route.ts
  actions/
    store.ts  ingredients.ts  menus.ts  receive.ts  sales.ts  waste.ts  recommend.ts
  lib/
    stock/       expiry.ts  fefo.ts  unit.ts  cost.ts  normalize.ts  *.test.ts
    ai/          client.ts  receipt.ts  label.ts  storage.ts  recommend.ts  schemas.ts
      adapters/    claude.ts  mock.ts                    # 7.1 Adapter
      strategies/  types.ts  expiry.ts  cost.ts  popularity.ts  # 7.2 Strategy
    external/    foodsafety.ts  livestock.ts
    supabase/    server.ts  client.ts  admin.ts
    queries/     dashboard.ts  ingredients.ts  menus.ts  sales.ts
    result.ts    # ActionResult, 에러 코드
    date.ts      # KST 기준 오늘 날짜
  components/
    ui/  receive/  dashboard/  common/
  types/database.ts                # supabase gen types 결과
supabase/
  migrations/  seed.sql
tests/e2e/                         # Playwright
```

## 5. 주요 흐름

### 5.1 명세서 입고

```mermaid
sequenceDiagram
    actor U as 사장님
    participant C as 브라우저
    participant S as Next.js 서버
    participant ST as Supabase Storage
    participant AI as Claude API
    participant DB as Postgres

    U->>C: 명세서 촬영
    C->>C: 이미지 압축 (≤1600px, JPEG)
    C->>S: createReceipt() (Server Action)
    S->>DB: receipts insert (pending)
    S-->>C: receiptId, 업로드 경로
    C->>ST: 이미지 업로드 ({storeId}/{receiptId}.jpg)
    C->>S: POST /api/receipts/{id}/parse
    S->>DB: 재료 목록(이름·별칭) 조회
    S->>AI: 이미지 + 재료 목록 (generateObject, Zod 스키마)
    AI-->>S: 품목 JSON
    S->>S: 스키마 검증, 단위 환산, 재료 ID 검증, 기한 계산
    S->>DB: receipts.parsed_json 저장 (parsed)
    S-->>C: 확인용 행 목록
    U->>C: 수정 후 입고 확정
    C->>S: confirmReceipt() (Server Action)
    S->>DB: rpc receive_stock() — 묶음·이력·상태를 한 트랜잭션으로
    S->>DB: 수정된 연결을 재료 별칭에 추가
    S-->>C: 완료 → 대시보드 갱신
```

### 5.2 바코드 입고

```mermaid
sequenceDiagram
    actor U as 사장님
    participant C as 브라우저 (ZXing)
    participant S as Next.js 서버
    participant DB as Postgres
    participant F as 식약처 API

    U->>C: 바코드 스캔
    C->>S: GET /api/barcode/{code}
    S->>DB: ingredient_barcodes (매장 매핑) 조회
    alt 매장에 등록됨
        S-->>C: source=store, ingredientId
    else 미등록
        S->>DB: products 캐시 조회
        alt 캐시 없음 (또는 30일 경과)
            S->>F: 바코드 조회
            F-->>S: 제품 정보
            S->>DB: products upsert (service role)
        end
        S-->>C: source=cache|api|none, product
        U->>C: 기존 재료 연결 또는 새 재료 등록
        C->>S: linkBarcode()
    end
    U->>C: 수량 입력 (선택: 라벨 촬영)
    C->>S: receiveManual()
    S->>DB: rpc receive_stock()
```

### 5.3 판매 마감 (FEFO 차감)

![판매 마감 FEFO 차감 시퀀스](diagrams/seq-sales-fefo.svg)

[크게 보기 (HTML)](diagrams/seq-sales-fefo.html)

<details>
<summary>Mermaid 원본</summary>

```mermaid
sequenceDiagram
    participant C as 브라우저
    participant S as Next.js 서버
    participant D as lib/stock/fefo
    participant DB as Postgres

    C->>S: recordDailySales(soldOn, [{menuId, qty}])
    S->>DB: 레시피, 해당 재료의 잔량>0·경과하지 않은 묶음, 같은 날짜 기존 차감량 조회
    S->>D: planConsumption(필요량, 묶음(기존 차감 되돌린 상태))
    D-->>S: 차감 계획 [{lotId, qty}], 부족분
    S->>DB: rpc record_daily_sales(계획) — 기존 차감 되돌리기 + 새 차감, 묶음 잠금(FOR UPDATE)·잔량 재검증
    alt 동시 변경으로 STOCK_CONFLICT
        S->>S: 최신 상태로 다시 계획 (최대 1회 재시도)
    end
    S-->>C: 결과, 부족 재료 경고
```

</details>

## 6. 트랜잭션 전략

Supabase JS 클라이언트는 여러 쿼리를 하나의 트랜잭션으로 묶을 수 없다. 그래서 다음과 같이 나눈다.

| 단계 | 담당 | 이유 |
|---|---|---|
| **계획** (무엇을 얼마나 바꿀지) | TypeScript 순수 함수 (`lib/stock`) | 단위 테스트가 쉽고 로직이 한 곳에 있음 |
| **적용** (잠금, 재검증, 반영, 이력) | Postgres 함수 (RPC) | 원자성 보장. 계획 이후 재고가 바뀌었으면 `STOCK_CONFLICT`로 거부 |

- 교착 방지: 계획의 묶음 목록은 `lot_id` 순으로 정렬해 전달한다.
- RPC는 `security invoker`로 만들어 RLS가 그대로 적용된다.
- 함수 목록과 SQL은 `07_DB.md` 참고.

## 7. AI 계층

| 기능 | 모델 | 진입점 | 출력 스키마 |
|---|---|---|---|
| 명세서 인식 | `claude-sonnet-5-5` | `POST /api/receipts/[id]/parse` | `ReceiptParse` |
| 라벨 날짜 인식 | `claude-sonnet-5-5` | `POST /api/labels/parse` | `LabelDate` |
| 보관일수 추천 | `claude-haiku-5-5` | `suggestStorage()` | `StorageSuggestion` |
| 메뉴 추천 | `claude-sonnet-5-5` | `POST /api/recommendations` | `Recommendation` |

**공통 처리 순서**
1. 입력 구성 (매장 데이터를 ID와 함께 전달)
2. `generateObject({ model, schema, messages })`로 호출, 타임아웃 45초
3. 스키마 검증 실패 시 1회 재시도, 다시 실패하면 `AI_INVALID_OUTPUT`
4. **후처리 검증:** ID 존재 확인, 재고 충분 여부, 날짜 형식, 단위 허용값
5. 서버 계산으로 덮어쓰기: 단위 환산, 기한, 원가

- 모델 ID와 프롬프트는 `lib/ai` 안에서만 관리한다.
- 개발·테스트 환경에서는 `AI_MOCK=1`이면 `lib/ai/__fixtures__`의 고정 응답을 돌려준다 (7.1 `MockAdapter`).

### 7.1 디자인 패턴 — Adapter: AI 클라이언트

**무엇이 자주 바뀌는가:** AI 공급자·모델·SDK 버전, 그리고 실행 환경(개발·테스트는 고정 응답, 운영은 실제 모델).

| 역할 | 위치 | 내용 |
|---|---|---|
| Target (우리 인터페이스) | `lib/ai/client.ts` `AiClient` | 앱 코드가 아는 유일한 AI 호출 형태 |
| Adaptee (외부 SDK) | Vercel AI SDK `generateObject` + `@ai-sdk/anthropic` | 외부 라이브러리 인터페이스 |
| Adapter | `lib/ai/adapters/claude.ts` `ClaudeAdapter` | SDK 호출로 변환, 모델 ID 선택, 타임아웃·재시도, SDK 오류를 `AI_FAILED`·`AI_INVALID_OUTPUT`으로 변환 |
| Adapter | `lib/ai/adapters/mock.ts` `MockAdapter` | `lib/ai/__fixtures__/<task>.json` 고정 응답 반환 |

```ts
// lib/ai/client.ts
export type AiTask = "recommend" | "storage" | "receipt";
export interface AiClient {
  generate<T>(req: {
    task: AiTask;
    schema: z.ZodType<T>;
    system: string;
    messages: AiMessage[];
  }): Promise<T>;
}
export function getAiClient(): AiClient; // AI_MOCK=1이면 MockAdapter, 아니면 ClaudeAdapter
```

- `recommend()`·`suggestStorage()` 같은 기능 코드는 `AiClient`만 의존하고 SDK를 직접 import하지 않는다 (의존성 역전).
- 모델 ID는 `ClaudeAdapter` 안에만 둔다 (AGENTS 규칙 11). 공급자를 바꿀 때는 어댑터 하나만 추가한다.
- 테스트는 `MockAdapter`로 실제 AI를 호출하지 않는다 (AGENTS 규칙 14).

### 7.2 디자인 패턴 — Strategy: 추천 기준

**무엇이 자주 바뀌는가:** 추천 기준 (FR-REC-06). 매장·시기마다 "기한 임박 소진", "재고 금액 줄이기", "잘 팔리는 메뉴 밀기" 중 우선순위가 다르고, 기준은 앞으로 더 늘어날 수 있다.

| 역할 | 위치 | 내용 |
|---|---|---|
| Strategy | `lib/ai/strategies/types.ts` `RecommendStrategy` | 후보 재료 정렬 + 프롬프트용 기준 설명 |
| Concrete Strategy | `strategies/expiry.ts` `ExpiryFirst` (기본값) | 사용 가능 묶음을 남은 일수 오름차순 |
| Concrete Strategy | `strategies/cost.ts` `CostFirst` | 남은 재고 금액(단가 × 잔량) 내림차순 |
| Concrete Strategy | `strategies/popularity.ts` `PopularityFirst` | 최근 7일 판매량이 많은 메뉴에 쓰이는 재료 순 |
| Context | `lib/ai/recommend.ts` `recommend()` | 선택된 전략으로 입력 구성 → `AiClient` 호출 → 공통 검증 |

```ts
// lib/ai/strategies/types.ts
export type RecommendBasis = "expiry" | "cost" | "popularity";
export interface RecommendStrategy {
  basis: RecommendBasis;
  /** 후보 재료를 우선순위대로 정렬한다. 일수·금액 계산은 lib/stock 순수 함수로만 한다. */
  rankIngredients(snapshot: RecommendSnapshot, today: ISODate): RankedIngredient[];
  /** 프롬프트에 넣을 기준 설명 */
  promptGuide(): string;
}
export function getStrategy(basis: RecommendBasis): RecommendStrategy;
```

- 전략은 **입력 우선순위와 프롬프트만** 바꾼다. 출력 검증(재고 대조, 제외, 원가 계산, FR-REC-03~04)은 기준과 상관없이 `recommend()`에서 똑같이 한다.
- 새 기준은 `RecommendStrategy` 구현 하나와 `getStrategy` 등록 한 줄로 추가한다 (개방-폐쇄 원칙). `if (basis === ...)` 분기를 기능 코드에 흩어 두지 않는다.

## 8. 외부 API 어댑터

```ts
// lib/external/foodsafety.ts
export interface ProductInfo {
  barcode: string;
  name: string;
  maker: string | null;
  foodType: string | null;
  shelfLifeText: string | null; // 예: "제조일로부터 12개월"
}
export async function lookupBarcode(barcode: string): Promise<ProductInfo | null>;
```
- 응답 필드명은 어댑터 안에서만 다루고, 밖으로는 `ProductInfo`만 노출한다.
- 조회 결과는 `products`에 캐시한다. **조회 실패(없음)도 `found=false`로 캐시**해서 같은 바코드로 반복 호출하지 않는다.
- 타임아웃 5초, 실패 시 `EXTERNAL_API_FAILED`를 돌려주고 화면은 수동 등록으로 진행한다.

## 9. 보안

| 항목 | 방식 |
|---|---|
| 인증 | Supabase Auth (매직링크/소셜), `@supabase/ssr`로 쿠키 세션 |
| 인가 | 모든 매장 테이블에 RLS `is_my_store(store_id)` |
| 공용 캐시 | `products`는 인증 사용자 읽기만 가능, 쓰기는 서버의 service role 클라이언트만 |
| service role 키 | `lib/supabase/admin.ts`에서만 사용, `import 'server-only'` 강제 |
| 파일 | Storage `receipts` 비공개 버킷, 경로 첫 폴더가 본인 매장 ID일 때만 접근 |
| 입력 검증 | 모든 Server Action과 Route Handler 입구에서 Zod 검증 |
| 업로드 제한 | 이미지 MIME(jpeg/png/webp)만, 압축 후 5MB 이하 |
| AI 비용 | 매장당 AI 호출 일일 한도(기본 100회), 초과 시 `RATE_LIMITED` |

## 10. 날짜·숫자 규칙

- **기준 시간대는 Asia/Seoul.** "오늘"은 서버의 `lib/date.ts`의 `todayKST()`로만 구한다. DB의 `current_date`(UTC)에 의존하지 않는다.
- 날짜만 필요한 값(입고일, 기한, 판매일)은 Postgres `date` 타입, ISO `YYYY-MM-DD` 문자열로 주고받는다.
- 수량은 `numeric(12,3)`, 기본 단위(g/ml/ea)로 저장한다.
- 금액은 원 단위 정수. 기본 단위당 단가만 `numeric(12,4)`.
- 소수 연산 결과는 소수 3자리로 반올림한다.
- 기간(일·월·년) 계산은 SRS BR-01의 달력 규칙을 따른다.
- 재료 별칭은 소문자·공백 제거 형태로 저장·비교한다 (`lib/stock/normalize.ts`).

## 11. 배포·환경

| 환경 | 용도 | DB |
|---|---|---|
| local | 개발 | Supabase CLI 로컬 (`supabase start`) |
| preview | PR마다 Vercel 미리보기 | Supabase 개발 프로젝트 |
| production | 시연 | Supabase 운영 프로젝트 |

**환경변수**

| 이름 | 범위 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 | anon 키 (RLS로 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 | products 캐시 쓰기 전용 |
| `ANTHROPIC_API_KEY` | 서버 | Claude API |
| `FOODSAFETY_API_KEY` | 서버 | 식약처 API |
| `LIVESTOCK_API_KEY` | 서버 | 축산물 이력제 API (선택) |
| `AI_MOCK` | 서버 | `1`이면 AI 고정 응답 사용 |
| `AI_DAILY_LIMIT` | 서버 | 매장당 AI 일일 호출 한도 |

- AI를 호출하는 Route Handler는 `export const maxDuration = 60`을 설정한다.

## 12. 에러 처리

- Server Action과 Route Handler는 예외를 밖으로 던지지 않고 `ActionResult`로 돌려준다 (`08_API_SPEC.md` 1장).
- RPC 예외 메시지(`STOCK_CONFLICT`, `FORBIDDEN` 등)는 `lib/result.ts`에서 에러 코드로 변환한다.
- 화면은 에러 코드별 안내 문구를 보여주고, AI·외부 API 실패 시 항상 **수동 입력으로 진행할 길**을 제공한다.

## 13. 주요 설계 결정 (ADR 요약)

| # | 결정 | 대안 | 이유 |
|---|---|---|---|
| 1 | Next.js 풀스택 (별도 백엔드 없음) | Spring/FastAPI 분리 | 3명·5주, 배포·인증 연동 비용 절감 |
| 2 | Supabase | Firebase | 재고·레시피는 관계형 데이터, RLS로 매장 격리 |
| 3 | 재고를 묶음 단위로 관리 | 재료별 총량 | 기한 추적과 FEFO에 필수 |
| 4 | 계획은 TS, 적용은 RPC | 전부 SQL / 전부 TS | 테스트 용이성 + 원자성 |
| 5 | 이력 추가 전용 | 수정·삭제 허용 | 감사 추적, 되돌리기 단순화 |
| 6 | AI 출력은 Zod 스키마로 강제 + 서버 재검증 | 자유 텍스트 파싱 | 환각·형식 오류 차단 |
| 7 | 외부 API 실패도 캐시 | 매번 호출 | 비용·속도, 조회율 통계 확보 |
| 8 | AI 호출을 Adapter로 감쌈 (7.1) | 기능 코드에서 SDK 직접 호출 | 모델·공급자 교체와 mock 테스트를 한 곳에서 처리 |
| 9 | 추천 기준을 Strategy로 분리 (7.2) | 기준별 if 분기 | 기준 추가 시 기존 코드 수정 없음, 기준별 단위 테스트 |
| - | (검토 후 제외) Observer: 부족 발생 통지 | - | 부족은 조회 시 뷰(`is_low`)로 계산하고 서버는 요청마다 새로 계산해 통지 대상이 없음 |
