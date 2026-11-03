## 작업
<!-- docs/11_TASK.md 작업 ID 하나. 예: 3.4 FEFO 차감 -->
WBS **

## 변경
<!-- 바꾼 파일과 이유. 다른 소유자의 파일을 바꿨다면 이유와 합의 여부 (docs/04_WBS.md 3.1) -->
-

관련 요구사항: <!-- FR-, NFR-, BR- -->
테스트: <!-- docs/10_TEST_PLAN.md ID. 예: UT-FEFO-01~11, DB-10 -->

## 검증
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` 통과 (CI)
- [ ] (UI 변경) 375×812 화면에서 확인, 스크린샷 첨부
- [ ] (스키마 변경) 새 마이그레이션 → `supabase db reset` → 타입 재생성 → `docs/07_DB.md` 갱신
- [ ] (계약 변경) `docs/08_API_SPEC.md`를 먼저 고치고 상대 담당자와 합의 (docs/04_WBS.md 3.2)
- [ ] (AI 도구 사용) `docs/logs/ai-usage.md`에 기록

## 리뷰 시 확인 부탁
<!-- 범위 밖이라 고치지 않은 문제, 문서 불일치, 결정이 필요한 점 -->
-
