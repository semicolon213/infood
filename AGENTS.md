# AGENTS.md

코딩 에이전트(Codex, Claude Code 등)용 작업 규칙. 작업 전에 끝까지 읽는다.

## 프로젝트
**재고콕** — 소형 식당·카페용 식자재 재고 관리 및 AI 메뉴 추천 웹 서비스 (모바일 우선).
문서 목록과 각 문서가 담당하는 내용은 `README.md`를 본다. 구조와 폴더는 `docs/06_ARCHITECTURE.md` 3·4장.

**스택:** Next.js (App Router) · TypeScript strict · Tailwind · shadcn/ui · Zod · Supabase · Vercel AI SDK(`@ai-sdk/anthropic`) · @zxing/browser · Vitest · Playwright · MSW · pnpm

## 명령어
```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test                # Vitest (단위·DB·통합)
pnpm test:e2e            # Playwright
pnpm eval:receipts       # AI 인식 평가 — 실제 모델 호출, 비용 발생
supabase start           # 로컬 Supabase
supabase db reset        # 마이그레이션 + 시드 재적용
supabase gen types typescript --local > src/types/database.ts
```

## 반드시 지킬 규칙

**데이터·도메인**
1. AI 출력은 사용자 확인 없이 DB에 반영하지 않는다 (SRS BR-04).
2. 날짜·단위·원가·FEFO 계산은 `lib/stock` 순수 함수로만 한다. AI가 계산한 값은 쓰지 않는다.
3. 재고 변경은 RPC(`receive_stock`, `apply_consumption`, `record_daily_sales`, `adjust_lot`)로만 한다. `stock_lots.remaining`을 직접 update하지 않는다.
4. `stock_movements`는 추가만 한다. 되돌리기는 반대 방향 `adjust` 이력으로 한다.
5. 날짜·수량·금액 규칙은 `docs/06_ARCHITECTURE.md` 10장을 따른다 (오늘 = `todayKST()`).

**보안**
6. 클라이언트가 보낸 `storeId`를 믿지 않는다. 세션에서 매장을 구한다.
7. 비밀 키를 쓰는 모듈은 `import "server-only"`. service role 클라이언트는 `products` 캐시 쓰기에만 쓴다.
8. 새 테이블에는 RLS 정책을 함께 추가한다.

**코드**
9. Server Action·Route Handler는 입구에서 Zod로 검증하고, 예외 대신 `ActionResult`를 돌려준다. 에러 코드는 `docs/08_API_SPEC.md` 1.2 목록만 쓴다.
10. 조회는 서버 컴포넌트에서 `lib/queries`로, 변경은 Server Action으로 한다. 클라이언트에서 테이블을 직접 변경하지 않는다 (Storage 업로드만 예외).
11. 모델 ID와 프롬프트는 `lib/ai` 안에서만 정의한다. 외부 API 필드명은 `lib/external` 밖으로 내보내지 않는다.
12. UI는 shadcn/ui와 `docs/09_DESIGN.md` 토큰을 쓴다. 컴포넌트에 색상 hex를 직접 쓰지 않는다. 사용자 문구는 `docs/09_DESIGN.md` 7장을 따른다.

**테스트·DB 변경**
13. `lib/stock`, `lib/ai` 후처리, `lib/external`을 바꾸면 테스트도 함께 바꾼다. 테스트 이름에 `docs/10_TEST_PLAN.md` ID를 붙인다 (예: `UT-FEFO-05: 부족분 반환`).
14. 테스트에서 실제 AI·외부 API를 호출하지 않는다 (`AI_MOCK=1`, MSW).
15. 스키마 변경은 새 마이그레이션 파일로만 한다. 이후 `supabase db reset` → 타입 재생성 → `docs/07_DB.md` 갱신.

## 작업 방식
- `docs/11_TASK.md`에서 작업 ID 하나를 골라 그 범위만 처리하고 DoD를 확인한다.
- 범위 밖 문제는 고치지 말고 보고한다. 요구사항이 모호하면 추측하지 말고 선택지와 추천안을 보고한다.
- 커밋 메시지: `feat(receive): 명세서 확인 화면 (FR-RCP-04)` — 범위와 요구사항 ID 포함.
- 의존성 추가는 꼭 필요할 때만, 이유와 함께 보고한다.

## 완료 보고 형식
```text
작업: 4.1.3 명세서 인식 Route Handler
변경: src/app/api/receipts/[id]/parse/route.ts, src/lib/ai/receipt.ts
검증: lint ✓ / typecheck ✓ / test ✓ (UT-AI-01~03, IT-04~05 추가)
남은 일·주의: 식약처 필드명 미확정 (API_SPEC 9.1)
```
