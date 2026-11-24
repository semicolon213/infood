# #88 ComingSoon 삭제 QA

- 작업: WBS 5.2, [안 쓰는 ComingSoon 컴포넌트 삭제](https://github.com/semicolon213/infood/issues/88)
- 확인일: 2026-11-24
- 기준: 최신으로 가져온 `origin/develop`의 `da2c285079548816eec261976cc8049fb1654bbf`
- 구현 PR: [#98](https://github.com/semicolon213/infood/pull/98), HEAD `4737558df19ae00c7e9c4b8d27cfe4042d577c5e`
- 판정: **#98 삭제 변경 QA PASS**

PR #98은 위 기준에서 `src/components/common/coming-soon.tsx` 13줄만 삭제한다. 검증한 격리 복사본의 제품 소스 변경이 #98과 정확히 일치함을 확인했다. 이 보고서는 QA 결과를 기록하며, 실제 삭제와 이슈 완료 처리는 #98의 병합에 따른다. `components/common/` 소유권(`04_WBS.md` 3.1)에 따라 이번 QA PR은 제품 코드를 변경하지 않는다.

| 검사 | 결과 | 근거 |
|---|---|---|
| 참조 검색 | PASS | 소스·테스트·설정에서 `ComingSoon` / `coming-soon` 검색 결과는 정의 1건뿐. 사용처 0건 |
| 복사본 대조 | PASS | 추적 파일 369개 기준, 제품 소스 차이는 대상 파일 삭제뿐. 로컬 Supabase 식별자·포트만 별도 설정 |
| lint | PASS | 기존 ESLint 명령 실행, 종료 코드 0 |
| typecheck | PASS | `next typegen` + `tsc --noEmit`, 종료 코드 0 |
| Vitest | PASS | `CI=1`, `AI_MOCK=1`, `--maxWorkers=2`: 356 PASS / 0 FAIL / 0 SKIP. 실제 로컬 Auth·RLS·RPC 포함 |
| 프로덕션 빌드 | PASS | Next.js 16.4.6 기본 Turbopack 빌드, 종료 코드 0 |
| 기존 Playwright 로그인 검사 | PASS | `shell.spec.ts` 2건: 미로그인 이동·잘못된 이메일 안내 |
| 모바일 화면 진입 | PASS | 375×812, 일반 사용자·새 매장으로 주요 화면 10곳 HTTP 200, 정상 제목·탐색 메뉴 표시 |

모바일 확인 경로: `/`, `/receive`, `/sales`, `/sell`, `/recommend`, `/more`, `/ingredients`, `/menus`, `/waste`, `/orders`. 각 화면에 자리표시 문구·가로 넘침이 없고, 브라우저의 처리되지 않은 JavaScript 오류는 0건이었다. 스크린샷을 저장하고 대시보드·더보기를 직접 확인했다. 이 검사는 빈 매장의 화면 진입 확인이며, 입고·판매 등의 전체 업무 E2E를 대신하지 않는다.

실행 중 확인한 제한과 보완:

- 첫 Vitest 기본 병렬 실행은 348 PASS / 8 FAIL이었다. 7건은 기본 5초 시간 초과, 1건은 같은 테스트 파일에서 `NOT_FOUND`였다. 앱·테스트·시간 제한을 바꾸지 않고 워커만 2개로 제한해 전체 356건이 통과했다. 첫 실패 결과도 보존했다.
- 최초 빌드는 외부 `node_modules` 연결이 Turbopack의 프로젝트 루트 밖에 있어 패키지를 찾지 못했다. 격리 복사본 안에 `pnpm install --offline --frozen-lockfile`로 같은 의존성을 설치한 뒤 기본 빌드를 통과했다. 기존 검사 환경과 직접 의존성 30개의 버전도 모두 일치했다.
- 전용 로컬 Supabase(`61321`)에 저장소 마이그레이션·시드를 적용했다. 검사 후 전용 스택을 종료했다. 원본 환경·다른 QA 스택·운영 DB는 변경하지 않았고 실제 AI 호출은 0회다.
- 저장소의 기존 대시보드 테스트는 과거 이력 준비에 로컬 테스트용 service role fixture를 사용한다. 해당 기존 동작을 그대로 실행했으며, 새 service role 클라이언트는 추가하지 않았다. 모바일 확인은 공개 anon 키와 일반 사용자 세션을 사용했다.

공유 증거는 [`logs/coming-soon-88-20261124/summary.json`](logs/coming-soon-88-20261124/summary.json)에 검사별 결과와 #98 소스 대조를 기록했다. 모바일 화면은 [대시보드](logs/coming-soon-88-20261124/dashboard.png)·[더보기](logs/coming-soon-88-20261124/more.png), 빌드 원문은 [`build.log`](logs/coming-soon-88-20261124/build.log)에서 확인할 수 있다.

전체 로컬 증거는 `test-results/issue88-qa-20261124/`에 있다(기존 `.gitignore` 대상).

- `audit.json`: 소스·직접 의존성·참조 대조
- `test.json`, `test-serial.json`: 최초 실행과 워커 2개 재실행 결과
- `lint.log`, `typegen.log`, `typecheck.log`, `build.log`: 정적 검사·빌드
- `playwright.json`, `browser.json`, `*.png`: 로그인 검사·모바일 진입·화면
- `setup.mjs`, `run.mjs`, `browser.mjs`, `audit.mjs`, `workspace.json`: 실행 절차·복사본 위치

결과 기록 외 제품 코드·의존성·계약·DB 스키마는 변경하지 않았다. #98의 GitHub Actions `check`도 PASS임을 PR 작성 시 확인했다. 이 QA PR은 #88을 자동 종료하지 않는다.
