# AGENTS.md

코딩 에이전트(Codex, Claude Code 등)용 작업 규칙. 작업 전에 끝까지 읽는다.

## 프로젝트
**재고콕** — 소형 식당·카페용 식자재 재고 관리 및 AI 메뉴 추천 웹 서비스 (모바일 우선).
문서 목록과 각 문서가 담당하는 내용은 `README.md`를 본다. 구조와 폴더는 `docs/06_ARCHITECTURE.md` 3·4장.

**스택:** Next.js (App Router) · TypeScript strict · Tailwind · shadcn/ui · Zod · Supabase · Vercel AI SDK(`@ai-sdk/anthropic`) · Vitest · Playwright · MSW · pnpm

## 명령어
```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test                # Vitest (단위·DB·통합)
pnpm test:e2e            # Playwright
pnpm eval:recommend      # AI 추천 평가 (NFR-03) — 실제 모델 호출, 비용 발생
pnpm eval:receipts       # (확장 4.7) 명세서 인식 평가 — 실제 모델 호출, 비용 발생
supabase start           # 로컬 Supabase
supabase db reset        # 마이그레이션 + 시드 재적용
supabase gen types typescript --local > src/types/database.ts
```

## 반드시 지킬 규칙

**데이터·도메인**
1. AI 출력은 사용자 확인 없이 DB에 반영하지 않는다 (SRS BR-04).
2. 날짜·단위·원가·FEFO 계산은 `lib/stock` 순수 함수로만 한다. AI가 계산한 값은 쓰지 않는다.
3. 재고 변경은 RPC(`receive_stock`, `record_daily_sales`, `record_usage`, `record_waste`, 확장 `adjust_lot` — `docs/07_DB.md`)로만 한다. `stock_lots.remaining`을 직접 update하지 않는다. 발주 목록 저장은 `save_order` RPC, 상태 변경은 서버 액션으로 한다.
4. `stock_movements`는 추가만 한다. 되돌리기는 반대 방향 `adjust` 이력으로 한다.
5. 날짜·수량·금액 규칙은 `docs/06_ARCHITECTURE.md`의 날짜·숫자 규칙을 따른다 (오늘 = `todayKST()`, DB에서 `now()`·`current_date`로 오늘을 구하지 않는다).

**보안**
6. 클라이언트가 보낸 `storeId`를 믿지 않는다. 세션에서 매장을 구한다.
7. 비밀 키를 쓰는 모듈은 `import "server-only"`. service role 클라이언트는 쓰지 않는다 (필요하면 이유와 함께 보고).
8. 새 테이블에는 RLS 정책을 함께 추가한다.

**코드**
9. Server Action·Route Handler는 입구에서 Zod로 검증하고, 예외 대신 `ActionResult`를 돌려준다. 에러 코드는 `docs/08_API_SPEC.md` 1.2 목록만 쓴다.
10. 조회는 서버 컴포넌트에서 `lib/queries`로, 변경은 Server Action으로 한다. 클라이언트에서 테이블을 직접 변경하지 않는다 (Storage 업로드만 예외).
11. 모델 ID와 프롬프트는 `lib/ai` 안에서만 정의한다. AI SDK(`ai`, `@ai-sdk/anthropic`)는 `lib/ai/adapters` 밖에서 import하지 않고 `AiClient`만 쓴다 (Adapter, `docs/06_ARCHITECTURE.md` 7.1). 추천 기준 분기는 `RecommendStrategy` 구현으로만 추가한다 (Strategy, 7.2).
12. UI는 shadcn/ui와 `docs/09_DESIGN.md` 토큰을 쓴다. 컴포넌트에 색상 hex를 직접 쓰지 않는다. 사용자 문구는 `docs/09_DESIGN.md` 7장을 따른다.

**테스트·DB 변경**
13. `lib/stock`, `lib/ai` 후처리·전략·어댑터를 바꾸면 테스트도 함께 바꾼다. 테스트 이름에 `docs/10_TEST_PLAN.md` ID를 붙인다 (예: `UT-FEFO-05: 부족분 반환`).
14. 테스트에서 실제 AI를 호출하지 않는다 (`AI_MOCK=1` → `MockAdapter`, 장애 모의는 `AI_MOCK=fail`, MSW).
15. 스키마 변경은 새 마이그레이션 파일로만 한다. 이후 `supabase db reset` → 타입 재생성 → `docs/07_DB.md` 갱신.

## 작업 방식
- `docs/11_TASK.md`에서 작업 ID 하나를 골라 그 범위만 처리하고 DoD를 확인한다.
- 범위의 기준은 `docs/03_SRS.md`다. 바코드·식약처 API·라벨 인식·축산물 이력·PWA는 범위 밖이다. 다른 문서가 SRS와 다르면 SRS를 따르고 보고한다.
- 파일은 소유자만 고친다 (`docs/04_WBS.md` 3.1 코드 소유권). 다른 소유자의 파일을 바꿔야 하면 고치지 말고 보고한다.
- 화면↔서버 입출력은 `types/contracts.ts`와 서버 액션 시그니처(계약)를 따른다. 계약을 바꿔야 하면 `docs/08_API_SPEC.md`를 먼저 고치고 상대 담당자와 합의한다 (`docs/04_WBS.md` 3.2).
- 범위 밖 문제는 고치지 말고 보고한다. 요구사항이 모호하면 추측하지 말고 선택지와 추천안을 보고한다.
- 커밋 메시지: `feat(order): 발주 목록 초안 생성 (FR-ORD-01)` — 범위와 요구사항 ID 포함. 브랜치 규칙은 아래 "브랜치 (Git Flow)".
- 의존성 추가는 꼭 필요할 때만, 이유와 함께 보고한다.

## 브랜치 (Git Flow)

| 브랜치 | 만드는 곳 → 합치는 곳 | 용도 |
|---|---|---|
| `main` | - | 제출·시연 기준. Vercel 운영 배포. **직접 커밋·푸시 금지** (release·hotfix 병합만) |
| `develop` | `main`에서 한 번 생성 | 기능 통합. **직접 커밋 금지** (feature 병합만) |
| `feature/<작업ID>-<설명>` | `develop` → `develop` | `docs/11_TASK.md` 작업 하나. 예: `feature/3.1a-ingredients-ui`, `feature/2.7-migrations` |
| `release/<마일스톤>` | `develop` → `main`·`develop` | 마일스톤 제출·시연 직전 안정화(버그 수정·문서만). 예: `release/m3` (11/16 중간 산출물 제출) |
| `hotfix/<설명>` | `main` → `main`·`develop` | 제출본·운영의 급한 수정 |

- 작업을 시작하면 `develop`을 최신으로 받고 `feature/<작업ID>-<설명>` 브랜치를 만든다. 작업 ID 하나에 브랜치 하나.
- feature는 PR로 `develop`에 합친다. 리뷰 1명 필수, 성윤우의 PR은 지정 리뷰어(화면 김형균, 서버·테스트 임지섭)가 승인 (`docs/04_WBS.md` 3.3).
- 병합은 merge commit(`--no-ff`)으로 해서 작업 단위가 이력에 남게 한다. feature 브랜치는 병합 후 지운다.
- release는 `main`에 병합한 뒤 태그를 붙인다 (`m3`, `m4`, `m5`). 같은 내용을 `develop`에도 병합한다.
- 에이전트는 `main`·`develop`에 직접 커밋하지 않는다. 병합·푸시·태그·브랜치 삭제는 사용자가 요청할 때만 한다.

## 완료 보고 형식
```text
작업: 4.2 AI 메뉴 추천 API
변경: src/app/api/recommendations/route.ts, src/lib/ai/recommend.ts
검증: lint ✓ / typecheck ✓ / test ✓ (UT-AI-04~06, IT-13~14 추가)
남은 일·주의: 추천 기준 선택(FR-REC-06)은 4.2b에서 처리
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
