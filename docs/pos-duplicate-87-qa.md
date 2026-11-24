# #87 POS 동시 중복 주문 QA

2026-11-24 · WBS 5.2 · 기준 develop `da2c285079548816eec261976cc8049fb1654bbf` · 브랜치 `feature/5.2-pos-duplicate-qa`

[이슈 #87](https://github.com/semicolon213/infood/issues/87)의 수정 전 결함과 수정 후 검증을 함께 보존한다. [수정 PR #99](https://github.com/semicolon213/infood/pull/99)는 develop에 병합됐고, Node **24.19.0**에서 정확한 #99 커밋과 최신 develop 통합본 모두 **7/7 PASS**를 확인했다. 아래 초기 5 PASS/2 FAIL은 수정 전 develop da2c285의 기록이다.

## 수정 후 재검증 — 임지섭 리뷰 반영

| 대상 | 커밋 | 전용 QA |
|---|---|---|
| #99의 정확한 브랜치 HEAD | e98e3a4 | **7 PASS / 0 FAIL / 0 SKIP**, exit 0 |
| 최신 develop을 반영한 #100 | 23195d1 (develop 부모 a90f20c) | **7 PASS / 0 FAIL / 0 SKIP**, exit 0 |

같은 스크립트를 변경 없이 사용했다. 재고 충분·부족 두 동시 중복 조건에서 실제 RPC 대기 2건을 확인하고 잠금을 풀었으며, 양쪽 200·동일 orderId·duplicate false/true·주문 1건·재고 1회 차감을 확인했다. 마감 날짜 거부·매장 격리·주문번호 없는 별도 판매·source 분리도 모두 통과했다. 각 실행은 별도 버전의 결과이므로 합산하지 않는다.

임지섭 PC의 Node 22.14 대신 기존 요구사항인 Node 22.15+를 만족하는 24.19.0을 사용했다. 앱·로더·재현 스크립트·의존성은 변경하지 않았다. #100 전용 작업 폴더에 최신 develop을 merge commit으로 반영하고, AI 활용 로그 충돌은 양쪽 기록을 모두 보존해 해결했다.

공통 검사는 lint·typecheck PASS, 실제 로컬 DB 연결의 Vitest **365 PASS / 0 FAIL / 0 SKIP**(45파일, maxWorkers=4, CI=true), 도구 회귀 **30 PASS**다. 이전 작업 폴더의 issue85 산출물 오류가 없는 별도 작업 폴더에서 실행했다. 새 QA는 일반 사용자 경로이며, 전체 테스트의 기존 대시보드 과거 시각 fixture에는 기존 service role 예외가 있다. 실제 AI 호출은 0회다.

증거: [#99 원본 결과](logs/pos-duplicate-87-20261124/followup/check-99.json), [통합본 원본 결과](logs/pos-duplicate-87-20261124/followup/check-integrated.json), [후속 검증·해시·검사 로그](logs/pos-duplicate-87-20261124/followup/verification.json).

## 수정 전 결과

케이스마다 일반 사용자와 새 매장, 양파 100g 레시피를 준비했다. 입고는 `receive_stock` RPC로 가까운 기한 A 150g, 먼 기한 B 500g이다. 날짜는 앱의 `todayKST()`와 `addDays()`를 사용했다.

| 검사 | 기대 | 실제 | 판정 |
|---|---|---|---|
| #87-01 순차 재전송 | 200 두 번, 동일 orderId, duplicate false/true | 기대와 같음. A=0/B=450, 주문 1건·차감 이력 2건 | PASS |
| #87-02 같은 번호 2인분 동시 전송 | 200 두 번, 동일 orderId, duplicate false/true | **200 + 409(CONFLICT)**. A=0/B=450, 주문 1건·차감 이력 2건·총 −200g | **FAIL** |
| #87-03 같은 번호 7인분 동시 전송, 재고 부족 | 200 두 번, 동일 orderId, duplicate false/true | **200 + 409(CONFLICT)**. A=0/B=0, 주문 1건·차감 이력 2건·총 −650g·부족 50g 1건 | **FAIL** |
| #87-04 마감 날짜에 신규 주문, 주문번호 유/무 | 둘 다 409, 주문·재고·이력·마감 불변 | 기대와 같음 | PASS |
| #87-05 다른 매장의 같은 주문번호 | 각자 신규 주문 200, 상대 주문 조회 0건 | 기대와 같음 | PASS |
| #87-06 주문번호 없는 두 동시 판매 | 별도 주문 2건, 충돌 후 최신 재고로 재계획 | 200 두 번, duplicate false 두 번, A=0/B=250, 총 −400g | PASS |
| #87-07 같은 번호·다른 source(web/pos) | 각각 신규 주문, orderId가 다름 | 기대와 같음. A=0/B=250 | PASS |

동시 중복 2건 모두 실패 응답을 받은 뒤 같은 주문을 다시 보내면 `200 / duplicate: true`와 기존 orderId를 반환하며 DB는 불변이다. 실패한 동시 호출이 별도 `sales_days`·`sales`를 남기지 않고, 모든 차감 이력의 ref_id가 저장된 주문 1건을 가리키는 것도 확인했다. 부족량은 DB에 50g 한 번만 남는다. 기존 순차 중복 응답의 `shortages: []` 정책을 이번 QA의 변경 요구로 확장하지 않았다.

검사는 실제 `POST` Route Handler를 `Request`로 호출하고 `Response.status`·JSON을 검사한다. 인증·조회·변경은 실제 로컬 Supabase Auth·REST·RLS·RPC를 지난다. Next HTTP 서버·프록시·브라우저를 통과하는 E2E나 UI 검사는 포함하지 않는다. #87-07의 web 경로는 공통 함수 `recordSaleOrderFor`를 직접 호출한다.

## 수정 전 원인과 담당자 수정 기준 (초기 기록)

`src/lib/sales/record-order.ts`의 사전 중복 조회(28행)는 두 요청 모두 주문을 저장하기 전에 끝날 수 있다. `0012_sales_revision_net.sql`의 매장+판매일 잠금으로 RPC는 순서대로 처리되지만, 늦은 INSERT의 unique 위반은 여전히 `CONFLICT`로 변환된다(171행). 공통 함수의 `CONFLICT` 처리(86행)는 DB를 재조회하지 않고 곧바로 실패를 반환한다.

김형균 담당 서버 수정에서는 다음 조건으로 이슈 제안을 적용하는 것을 추천한다. 명세는 이슈 작성자 임지섭과 합의해 `08_API_SPEC.md` 6.1의 “같은 주문번호 동시 전송 → CONFLICT”를 갱신해야 한다.

1. `CONFLICT`이고 externalId가 있으면 세션에서 확인한 storeId, source, external_id로 주문을 다시 조회한다. unique 범위에 판매일은 포함되지 않는다.
2. 기존 주문이 있으면 해당 orderId로 `ok / duplicate: true`를 반환한다. 주문을 추가하거나 재고를 다시 차감하지 않는다.
3. 주문이 없으면 기존 마감 날짜 `CONFLICT`를 유지한다. 재조회 자체가 실패한 경우의 오류 처리도 확인한다.
4. #87-02·03을 포함한 7건이 모두 통과해야 한다. 현재 스크립트는 이 두 결함을 예상 실패로 숨기지 않고 종료 코드 1로 보고한다.

서버·RPC·계약·API 명세는 소유권 규칙에 따라 이번 QA에서 수정하지 않았다. SRS 1.2의 POS 제외와 `11_TASK.md` 4.8의 팀장 요청 POS 추가가 문서상 불일치하므로 범위 확정 담당자의 문서 정리가 필요하다. 이번 검증 대상은 사용자가 지정한 기존 POS API의 #87이다.

## 재현 방법

[재현 스크립트](../tests/e2e/pos/check-87.mjs)는 추가 의존성 없이 Node 22.15+의 기존 TS 로더를 사용한다. 먼저 프로젝트의 마이그레이션·시드를 적용한 로컬 Supabase가 필요하다. 기본 API는 57321, DB 컨테이너는 `supabase_db_infood-pos-qa87`이며 환경 변수로 바꿀 수 있다.

이번 검증에서는 `test-results/pos-duplicate-87/supabase-project/supabase/`에 `config.toml`, migrations, seed.sql을 복사했다. config의 project_id를 `infood-pos-qa87`, API/DB/shadow 포트를 57321/57322/57320으로 지정했다. 저장소 원본 설정은 변경하지 않았다.

```powershell
corepack pnpm exec supabase start --workdir test-results/pos-duplicate-87/supabase-project -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
node --conditions=react-server --import ./eval/recommend/loader.mjs tests/e2e/pos/check-87.mjs
```

다른 로컬 프로젝트라면 `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `POS_QA_DB_CONTAINER`를 해당 프로젝트 값으로 함께 지정한다. `POS_QA_OUTPUT`으로 JSON 출력 경로를 바꾼다. 로컬 URL만 허용하며 service role 키는 거부한다. 이 스크립트는 일반 사용자·매장 fixture를 생성하므로 QA 전용 DB에서 실행한다.

동시성은 외부 psql 세션이 해당 매장+판매일의 advisory lock을 먼저 잡아 제어한다. 두 요청이 사전 조회를 지나 실제 RPC에서 대기하는 것을 `pg_locks`로 확인한 뒤 잠금을 푼다. 따라서 스케줄링 운에 의존하지 않는다. 관리 연결은 로컬 테스트 잠금과 감시에만 사용하며 업무 데이터 준비·조회·변경은 일반 사용자 경로로 한다. 앱·RPC 안에 테스트 장치는 추가하지 않는다. 트랜잭션은 finally에서 종료하고 세션 대기 제한도 둔다.

## 수정 전 공통 검증과 증거

| 검사 | 결과·한계 |
|---|---|
| 전용 QA | **5 PASS / 2 FAIL / 0 SKIP**, 종료 코드 1. 두 FAIL은 위 #87-02·03 |
| `corepack pnpm lint` | PASS |
| 작업 폴더 `corepack pnpm typecheck` | FAIL. 기존 무시된 `test-results/issue85-qa-20261124/issue85-sdk-qa.test.ts`의 상대 import 4개를 찾지 못함 |
| 격리 소스 `corepack pnpm typecheck` | PASS. 추적 파일 369개를 복사·SHA-256 대조한 뒤 무시된 기존 test-results 없이 실행 |
| 기본 병렬 `corepack pnpm test` | 350 PASS / 6 FAIL. 44 worker 실행에서 5초 timeout 4건·추가 실패 2건. 4-worker에서 모두 통과해 자원 경합과 timeout 후 fixture 간섭으로 추정 |
| `corepack pnpm test --maxWorkers=4` | **356 PASS / 0 FAIL / 0 SKIP**, 44파일. CI=true, 로컬 Supabase 연결 |

전체 테스트의 기존 `queries/dashboard.test.ts`는 과거 시각의 fixture 작성에 로컬 service role을 사용한다. 이 기존 예외는 그대로 실행했으며, #87 전용 검사에서는 service role 클라이언트를 사용하지 않는다. 실제 AI 호출은 0회이고 클라우드 DB에는 접속하지 않았다. 검증 후 이번 QA용 Supabase를 종료했다.

원본 응답·DB 검산은 [check.json](logs/pos-duplicate-87-20261124/check.json), 환경·검사 결과·파일 해시는 [verification.json](logs/pos-duplicate-87-20261124/verification.json)에 보존한다. 초기 실패와 재검증 로그도 같은 폴더에 둔다. 작업표의 5.2 전체 완료를 의미하지 않는다.
