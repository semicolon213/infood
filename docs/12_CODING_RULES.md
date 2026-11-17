# 팀 코딩 규칙

**시스템:** 재고콕
**버전:** v0.1 / 2026-11-10 (WBS 3.8)
**관련 문서:** `06_ARCHITECTURE.md`(계층·폴더·날짜·숫자 규칙), `07_DB.md`, `08_API_SPEC.md`, `09_DESIGN.md`(문구·토큰), `10_TEST_PLAN.md`, `04_WBS.md` 3장(병렬 작업 규칙)

> 사람과 코딩 에이전트가 함께 따르는 규칙이다. 에이전트용 요약은 `AGENTS.md`이고, 둘이 다르면 이 문서를 고친 뒤 `AGENTS.md`를 맞춘다.
> 규칙마다 근거가 된 결정(리뷰·PR)을 괄호로 남긴다. 근거 없는 취향은 적지 않는다.

---

## 1. 도구와 형식

| 항목 | 규칙 |
|---|---|
| 언어 | TypeScript `strict`. `any` 대신 생성 타입(`types/database.ts`)·계약 타입(`types/contracts.ts`)을 쓴다. 불가피한 캐스팅(`as unknown as`)은 이유를 주석으로 남긴다 |
| 검사 | `pnpm lint`(ESLint, next core-web-vitals + typescript) · `pnpm typecheck` · `pnpm test`가 모두 통과해야 PR을 올린다. CI도 같은 단계를 돈다 (WBS 1.1) |
| 형식 | 포맷터는 두지 않는다. 고치는 파일의 기존 스타일(들여쓰기·따옴표·줄 길이)을 따른다 |
| import | 경로 별칭 `@/`(= `src/`)를 쓴다. 같은 폴더 안은 상대 경로(`./store`) |
| 패키지 | pnpm. 의존성 추가는 꼭 필요할 때만, 이유를 PR에 적는다 |

## 2. 계층과 폴더

구조는 `06_ARCHITECTURE.md` 3·4장을 따른다. 어디에 무엇을 두는지만 요약한다.

| 폴더 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `app/` | 화면(서버 컴포넌트)·라우트. 조회 함수를 불러 화면에 넘김 | 테이블 직접 변경, 계산 로직 |
| `components/` | 화면 조각(클라이언트 포함). 입력 파싱·화면 검증 | 재고·날짜 계산(서버의 `lib/stock`에 맡김) |
| `actions/` | Server Action — 변경의 유일한 입구 | 계산 로직 직접 구현 |
| `lib/queries/` | 조회 (서버 전용) | 변경 |
| `lib/stock/` | 날짜·단위·원가·FEFO·판정 순수 함수 | DB·네트워크·시계 접근 |
| `lib/ai/` | 모델 ID·프롬프트·어댑터·전략·후처리 | 다른 폴더에서 AI SDK import |
| `types/contracts.ts` | 화면↔서버 입력 Zod 스키마·출력 타입 (계약) | 계약 문서 없이 바꾸기 |

- 파일은 소유자만 고친다 (`04_WBS.md` 3.1). 다른 소유자의 파일을 바꿔야 하면 PR 리뷰나 코멘트로 부탁한다.

## 3. 이름

| 대상 | 규칙 | 예 |
|---|---|---|
| 파일 | kebab-case. 테스트는 같은 폴더에 `*.test.ts` | `receive-form.tsx`, `fefo.test.ts` |
| 컴포넌트·타입 | PascalCase | `ReceiveForm`, `StockHistoryItem` |
| 함수·변수 | camelCase. 동사로 시작 | `planConsumption`, `getSalesDay` |
| 모듈 상수 | UPPER_SNAKE | `SAVE_FAILED`, `SOON_DAYS` |
| DB | snake_case. TS로 넘길 때 `lib/queries`·`actions`에서 camelCase로 바꾼다 | `expires_at` → `expiresAt` |

## 4. Server Action (`actions/`)

1. 파일 첫 줄 `"use server"`. 입구에서 계약 스키마로 `safeParse` → 실패면 `validationFail` (AGENTS 9).
2. 예외를 밖으로 던지지 않고 `ActionResult`를 돌려준다. 에러 코드는 `08_API_SPEC.md` 1.2 목록만 쓴다.
3. 매장은 `getSessionStore()`로 세션에서 구한다. 없으면 `UNAUTHORIZED` (AGENTS 6).
4. 오늘 날짜는 `todayKST()`. 미래 날짜 검사처럼 오늘이 필요한 검증은 액션에서 한다 (계약은 형식만).
5. 행별 오류는 모아서 한 번에 돌려준다. `fields` 키는 입력 경로 그대로 `items.N.qty` (08 1.1). 하나라도 실패하면 아무것도 저장하지 않는다.
6. 재고 변경은 RPC 한 번으로 한다(트랜잭션). RPC 오류는 `rpcErrorCode`·`rpcFail`(`lib/result.ts`)로 코드를 바꾼다. 메시지 문자열을 직접 비교하지 않는다 (PR #32 리뷰).
7. 계획 이후 재고가 바뀌어 `STOCK_CONFLICT`가 나면 최신 재고로 **1회만** 다시 계획한다 (08 6·7장).
8. 성공하면 영향을 받는 화면을 `revalidatePath`로 갱신한다.
9. 사용자 문구는 `09_DESIGN.md` 7장을 따르고, 같은 오류를 화면이 이미 보여 준다면 **화면과 같은 문구**를 쓴다 (PR #42, `StockHistoryFilter`).

## 5. 조회 (`lib/queries/`)

- `import "server-only"`. 매장이 없으면 빈 값(`[]`, `null`)을 돌려준다.
- 조회 실패는 throw한다(화면의 오류 상태·Next 오류 화면). 조회 함수는 `ActionResult`를 쓰지 않는다.
- 서로 독립인 조회는 `Promise.all`로 묶는다. 목록마다 상세를 다시 부르는 N+1을 만들지 않는다 (PR #24 리뷰).

## 6. 도메인 계산 (`lib/stock/`)

- 순수 함수만. DB·네트워크·시계에 의존하지 않고, 오늘 날짜는 인자로 받는다.
- 실패는 예외 대신 값(`Calc<T>`)으로 돌려주고, 액션이 `VALIDATION`으로 바꾼다.
- 수량은 소수 3자리(`round3`), 기본 단위당 단가만 소수 4자리 (SRS BR-03, 06 10장). 권장 발주량은 정수 올림 (BR-06).
- 바꾸면 `10_TEST_PLAN.md` ID가 붙은 테스트를 함께 바꾼다 (AGENTS 13).

## 7. 계약 (`types/contracts.ts`)

- 계약을 바꾸려면 `08_API_SPEC.md`를 먼저 고치고 상대 담당자와 합의한다 (`04_WBS.md` 3.2). 필드 추가처럼 화면이 깨지지 않는 변경도 PR에 적는다.
- 수량 입력은 0 초과 1,000,000 이하, 소수 셋째 자리까지. 판매가는 DB `int` 범위 (08 1.4·4장).
- 사용자에게 그대로 보일 수 있는 메시지는 한국어로 쓴다. 화면이 따로 문구를 정하는 범위 오류는 비워 둔다.

## 8. DB (`supabase/migrations/`)

- 스키마 변경은 새 마이그레이션 파일로만. 기존 파일은 고치지 않는다. 이후 `supabase db reset` → 타입 재생성 → `07_DB.md` 갱신 (AGENTS 15).
- 새 테이블에는 RLS 정책을 함께 만든다. 함수는 `security invoker`(호출자의 RLS 적용).
- `stock_lots.remaining`은 RPC로만 바꾸고, `stock_movements`는 추가만 한다 (AGENTS 3·4).
- 다른 RPC 안에서만 부르는 내부 함수는 `private` 스키마에 둬서 REST(`/rest/v1/rpc`)로 직접 호출되지 않게 한다 (PR #3 리뷰, 0004).
- 함수 안에서 `now()`·`current_date`로 오늘을 구하지 않는다. 날짜는 서버가 인자로 넘긴다.
- 클라우드 DB 반영(`supabase db push`)은 팀에서 시점을 정하고 dry-run을 본 뒤 한다. 시드는 클라우드에 넣지 않는다.

## 9. AI (`lib/ai/`)

- AI 출력은 사용자 확인 없이 DB에 반영하지 않는다 (BR-04). 수량·원가·보유 여부는 DB와 `lib/stock`으로 다시 계산한다.
- 모델 ID·프롬프트는 `lib/ai` 안에만. AI SDK는 `lib/ai/adapters`에서만 import하고 나머지는 `AiClient`를 쓴다 (Adapter, 06 7.1).
- 추천 기준 분기는 `RecommendStrategy` 구현으로만 추가한다 (Strategy, 06 7.2).

## 10. 주석

- 한국어로, **왜** 그렇게 했는지와 근거 문서를 짧게 적는다. 예: `// 경과 묶음은 차감하지 않는다 (BR-02)`, `// 08_API_SPEC 5장 — WBS 3.3b`.
- 코드만 봐도 아는 내용(무엇을 하는지)은 적지 않는다.
- 알면서 남겨 둔 지름길은 `shortcut:`으로 시작해 이유와 갚을 조건을 적는다. 예: `// shortcut: 두 문장이 한 트랜잭션이 아니다 …`

## 11. 테스트

| 수준 | 규칙 |
|---|---|
| 이름 | `10_TEST_PLAN.md` ID를 붙인다 (`UT-FEFO-05: 부족분 반환`). 계획에 없는 보조 테스트는 `… 보조:`로 구분 |
| AI | 실제 모델을 부르지 않는다 (`AI_MOCK=1`, 장애는 `AI_MOCK=fail`) |
| DB·통합 | 로컬 Supabase에서 일반 사용자로 가입해 실제 RLS·RPC 경로를 지난다(service role 금지). 로컬 Supabase가 없으면 건너뛰되 **CI에서는 실패**하게 한다 (`describe.skipIf(!up)` + `if (!up && process.env.CI) throw`) |
| 독립성 | 케이스마다 새 매장·재료를 만든다. 날짜는 서버의 `todayKST()` 기준 상대값으로 준비한다 (10_TEST_PLAN 2.3) |
| 동시성 | 충돌 테스트를 위해 앱 코드에 테스트용 장치를 넣지 않는다. 테스트가 RPC 호출 직전을 가로채 다른 요청의 변경을 실제 DB에 커밋한다 (IT-USE-05·10, PR #27 리뷰) |
| 실패 경로 | 실패한 호출은 응답 코드뿐 아니라 묶음·이력·업무 기록이 그대로인지도 확인한다 |
| 화면 | UI를 바꾸면 375×812에서 실제로 확인한다. 클라우드(데모) DB 대신 로컬 Supabase로 확인한다 |

## 12. Git·PR

- Git Flow (`AGENTS.md` "브랜치"). `feature/<작업ID>-<설명>`을 `develop`에서 따고, 작업 ID 하나에 브랜치·PR 하나.
- 커밋 메시지: `feat(receive): 입고 서버 액션 실제 구현 (FR-STK-01~04, WBS 3.3b)` — 범위·요구사항 ID·WBS. 본문에 바꾼 이유를 적는다.
- 커밋에 AI 공동작업자 줄(`Co-Authored-By: Claude …`)을 넣지 않는다 (팀장 요청, `logs/ai-usage.md` W11 폐기·수정 요약).
- PR은 템플릿을 채운다: 변경 이유, 관련 요구사항, 테스트 ID, 검증 결과(로컬/CI 구분), 리뷰 시 확인할 점.
- 다른 PR 위에 쌓은 브랜치면 본문 첫머리에 적는다 ("#40 위에 쌓음, #40 먼저 병합").
- 리뷰 1명 승인 후 병합. 성윤우 PR은 지정 리뷰어(화면 김형균, 서버·테스트 임지섭)가 승인 (`04_WBS.md` 3.3). 병합은 merge commit.
- 리뷰 코멘트는 "병합 전 꼭 / 고치면 좋은 것 / 참고"로 나누고, 지적마다 실패하는 구체적 상황을 적는다.

## 13. 보안

- 비밀 키를 쓰는 모듈은 `import "server-only"`. service role 클라이언트는 쓰지 않는다.
- `.env*`는 커밋하지 않는다. 로컬 확인용 설정은 `.env.local`(무시됨)에 두고 끝나면 지운다.
- 클라이언트가 보낸 `storeId`를 믿지 않는다. 다른 매장 데이터는 `NOT_FOUND`처럼 없는 것으로 다룬다.

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-11-10 | 초안 (WBS 3.8): 현재 코드 관례와 PR #3·#24·#27·#32·#42 리뷰 결정을 정리 |
