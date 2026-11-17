# 4.4 테스트 실행 결과 — 진행 중

2026-11-17 KST · 성윤우 / Codex · `10_TEST_PLAN.md` v0.4 기준. **종합 판정: BLOCKED.** 실제 AI 20건·전체 E2E·실기기·사용성 증거가 없으므로 4.4 완료나 M4 종료 기준 충족으로 판정하지 않는다. 독립 QA의 도구·증거 결함을 수정한 결과는 [QA 대응 기록](logs/qa-4.4-response.md)에 있다.

## 대상과 환경

| 항목 | 내용 |
|---|---|
| 앱 기준 소스 | develop `7bfceb01caf434151ca5a1022096ad9697c3b525` |
| 작업 브랜치 | `feature/4.4-test-execution`, 위 기준 + 미커밋 평가·집계 도구 |
| 검증 방식 | 깨끗한 HEAD를 C: 임시 실행 폴더로 복사하고 이번 평가 도구만 추가. 다른 작업 폴더의 산출물이 전역 검사에 섞이지 않게 함 |
| 실행 위치 | `%TEMP%/infood-4.4-execution/project` (원본 작업 브랜치는 D: 유지) |
| 설치 | pnpm 12.16.1, frozen lockfile. store도 `%TEMP%/infood-4.4-execution/pnpm-store` 사용. 의존성 추가·업데이트 없음 |
| 실행 도구 | Windows, Node v24.19.0, Next 16.4.6, Vitest 5.0.5. 계획의 Node 22와 차이가 있어 아래 CI를 별도 참고 |
| DB | 이 PC에서는 미구동. Docker.sbx v0.54.0 설치 확인, `sbx ls`는 `not signed in to Docker` |
| DB/fixture 버전 | 마이그레이션·시드는 위 커밋 그대로. 새 평가 fixture는 `eval/recommend/fixtures.ts`; 실제 DB 생성·검증은 아직 안 함 |
| 날짜 | 실행일 2026-11-17 KST. 단위 검사는 테스트에 고정한 기준일 사용. 실제 평가 전 `todayKST()`로 T를 기록하도록 구현 |
| AI | Vitest 설정 `AI_MOCK=1`; SDK 호출은 목. 실제 AI 호출 0회, 클라우드 DB 호출 없음 |
| 브라우저 | 이번 기준 소스의 브라우저 재실행 없음. Chromium·실기기 결과를 새로 주장하지 않음 |
| 민감 정보 | `.env*` 파일을 읽거나 출력하지 않았고 키 값·세션을 증거에 넣지 않음 |

## 실행 결과

```powershell
npm exec --yes --package=pnpm@12.16.1 -- pnpm install --frozen-lockfile --store-dir C:/Users/srsra/AppData/Local/Temp/infood-4.4-execution/pnpm-store
npm run lint
npm run typecheck
npm test -- --reporter=json --outputFile=test-results/vitest.json
npm run test:eval
npm run eval:recommend -- --plan
npm run test:results -- --input test-results/vitest.json --source 7bfceb01caf434151ca5a1022096ad9697c3b525 --output test-results/results-baseline-7bfceb0-reviewed
```

스크립트는 package.json의 pnpm 명령과 같다. PATH에 pnpm이 없어 설치만 고정 버전 `npm exec`로 실행했고, 검사 스크립트는 `npm run`으로 호출했다.

| 검사 | 결과 | 증거 범위 |
|---|---|---|
| 설치 / lint / typecheck | 통과 | C: 소스 복사본. 처음 평가 fixture에서 발생한 UUID Map 타입 오류 수정 후 통과 |
| Vitest (QA 수정 후 재실행) | **193 PASS / 0 FAIL / 90 SKIP**, 33파일·283케이스 | [개별 러너 결과](logs/test-results-4.4/after-qa-20261117/runner-current/report.md), [JSON 원본](logs/test-results-4.4/after-qa-20261117/runner-current/vitest.json), [CSV](logs/test-results-4.4/after-qa-20261117/runner-current/results.csv) |
| 평가·증거 도구 | **30 PASS / 0 FAIL** | [TAP 원본](logs/test-results-4.4/after-qa-20261117/tooling-final.tap). 집계 19건·호출 증거/중단 4건·ID/보고서/출처 7건. 실제 AI 품질 표본에 합산하지 않음 |
| 평가 `--plan` | 5시나리오 × 4회, expiry 10 / cost 5 / popularity 5 출력 | 모델·DB 호출 없음. 실제 fixture 생성 성공 증거도 아님 |
| 집계·계획 재생성 | 개별 행·원본 해시·현재 정의·대조 기록·수준별 합계 일치 | [재계산 검증](logs/test-results-4.4/after-qa-20261117/verification-final.json). 고정된 기대 합계 177·68을 검사하는 방식 제거 |

pnpm 12.16.1에서 `pnpm eval:recommend --plan`, 기존 실패 형식 `pnpm eval:recommend -- --plan`, `pnpm test:results -- --help`를 직접 재검증해 통과했다. 키·모드·URL·출처 등 CLI 12개 경로는 네트워크를 차단한 프로세스에서 검사했고 실제 모델·DB 요청 0회였다. 구체적인 재생성 명령은 [도구 README](../tests/e2e/results/README.md)를 따른다.

### 러너 수준별 집계

| 수준 | 전체 | PASS | FAIL | SKIP | NOT RUN |
|---|---:|---:|---:|---:|---:|
| 단위·스키마 | 123 | 123 | 0 | 0 | 0 |
| 화면 입력 보조 | 70 | 70 | 0 | 0 | 0 |
| DB | 18 | 0 | 0 | 18 | 0 |
| 서버·조회 통합 | 72 | 0 | 0 | 72 | 0 |
| 합계 | 283 | 193 | 0 | 90 | 0 |

### 계획 ID별 판정

[계획 ID별 결과표](logs/test-results-4.4/after-qa-20261117/plan-final/plan-results.md)는 3~8장 정의 행 177개를 요구사항·입력·기대값·실제 결과와 함께 기록한다. PASS 68건은 [작성자 assertion 대조 기록](../tests/e2e/results/reviews.json)의 실제 결과·소스 해시·단언 위치·개별 러너 통과를 함께 검증한 결과다. 이는 지정 리뷰어 승인이나 독립 QA의 68건 전부 확인을 뜻하지 않는다. 기록이 없는 케이스는 자동 PASS가 아니라 NOT RUN이다.

계획의 기대값이 합의되지 않은 UT-ORD-08·UT-UNIT-08, Action 필드 연결 증거가 부족한 UT-UNIT-06은 러너 통과와 별개로 BLOCKED다. 확장 9장은 이번 집계에서 제외한다. 이전 `runner-baseline.*`·`plan-results.*`·초기 `evidence-verification.json`은 수정 전 이력으로 보존하며 현재 판정 근거는 위 after-qa 결과다.

| 수준 | 전체 | PASS | FAIL | BLOCKED | NOT RUN | SKIP | N/A |
|---|---:|---:|---:|---:|---:|---:|---:|
| 단위 | 72 | 68 | 0 | 3 | 1 | 0 | 0 |
| DB | 17 | 0 | 0 | 17 | 0 | 0 | 0 |
| 통합 | 54 | 0 | 0 | 53 | 1 | 0 | 0 |
| 전체 E2E | 8 | 0 | 0 | 8 | 0 | 0 | 0 |
| 화면 회귀 | 14 | 0 | 0 | 0 | 14 | 0 | 0 |
| 비기능 | 12 | 0 | 0 | 11 | 1 | 0 | 0 |
| 합계 | 177 | 68 | 0 | 92 | 17 | 0 | 0 |

러너 283건은 계획 177건과 분모가 다르다. 한 ID에 여러 보조 테스트가 있거나 ID가 없는 검사도 있고, 반대로 계획만 있는 케이스도 있다. 컴포넌트 입력 보조에 붙은 E2E ID를 전체 E2E 통과로 세지 않았다. NOT RUN의 선택 케이스는 FR-USE-06(UT-FEFO-06)·FR-STK-05(IT-STK-05)이며 채택 미결정이다. 이미 구현된 검색·필터(FR-ING-03)와 특선 등록(FR-REC-07)은 재검증 대상에 포함한다.

## 이전 PR CI 참고 — 이번 브랜치 실행과 구분

[PR #59](https://github.com/semicolon213/infood/pull/59)의 [CI 실행 44026019774](https://github.com/semicolon213/infood/actions/runs/44026019774/job/133846431429)는 실제 로컬 Supabase를 띄워 **34파일·299케이스 전부 통과**, lint·typecheck·DB 타입 비교·build도 통과했다. checkout은 임시 merge 커밋 `0eed678`로, develop `7bfceb0`와 발주 UI PR head `364c438d15867e81ae33116855c707e251482633`를 합친 소스다.

이 결과는 4.3a의 합쳐진 후보에 대한 러너 증거다. 현재 4.4 브랜치에서 실행한 것과 합치지 않으며, 계획서 10.3이 요구하는 다품목 원자성·양성 RLS 대조 등 기대값 전부를 통과한 것으로 일괄 판정하지 않는다. 이번 미커밋 평가 도구도 그 CI에서 실행되지 않았다.

## 재개 조건

| 대상 | 담당·의존성 | 재개 조건 |
|---|---|---|
| DB·IT·전체 E2E | 성윤우 실행, 임지섭 DB/서버 확인 | Docker 로그인 후 로컬 컨테이너 실행 가능 여부 확인, Supabase 기동·마이그레이션 적용. 일반 사용자·새 매장으로 90 skip 재실행 및 계획 10.3 증거 대조 |
| NFT-03 실제 AI | 성윤우 실행, 김형균 AI 계층 확인 | 로컬 DB와 공급자 키를 실행 프로세스에 준비. `--prepare-only` DB 정답 검증 후 `--live` 고정 20회. 부족분 자동 추가 호출 없음 |
| NFT-05 접근성 | 성윤우 | axe 실행 도구 준비, 360·375·1024px 키보드·포커스·44px 및 심각 위반 검사 |
| NFT-10 커버리지 | 성윤우, 공용 설정 소유자 협의 | 현재 없는 coverage provider와 전체 `lib/stock` include 설정 준비. 미수입 파일 포함 분모 공개 |
| NFT-04·12 | 성윤우, 비팀원 3명·iOS/Android | 실제 과업 시간·실기기 기록 확보. 자동화 결과로 대체하지 않음 |
| NFT-06·09 | 성윤우, 배포/키 경계 담당자 | 배포·네트워크·cold/warm 조건 고정, 비밀 값 노출 검사용 빌드 증거 준비 |
| 단위 명세 보류 | 김형균·임지섭 | ea/개 표기와 단가 소수 예외 합의. 다른 소유자의 계산·API 코드는 이번 작업에서 바꾸지 않음 |

앱 코드 변경 없이 평가·증거 도구의 QA 결함을 수정했다. 임박 활용률 분모·서버 레시피와 AI 아이디어의 품질 분모 해석은 현재 계획을 유지하고 보조 집계를 추가했으며 합의가 필요하다. 환경 문제·명세 보류·기존 QA 재검증 대상은 [결함·보류 기록](defects-4.4.md)에 분리했다. 임지섭 지정 검토·수정 후 독립 재검토·실제 AI 검증은 대기 상태다.
