# 4.4 러너·계획 결과 재생성

Node 22.15 이상, 프로젝트 의존성 설치 후 실행한다. 추가 의존성은 없다. 아래 명령은 저장소 루트 기준이며 `--root`로 검토 소스를 명시할 수도 있다. pnpm은 인자 구분자 `--` 없이 사용한다. npm 형식의 선행 구분자 하나도 호환한다.

```powershell
pnpm test --reporter=json --outputFile=test-results/vitest-new.json
$evalCommit = git rev-parse HEAD
pnpm test:results --input test-results/vitest-new.json --source $evalCommit --output test-results/runner-new
pnpm test:plan --runner test-results/runner-new/results.json --output test-results/plan-new
pnpm test:evidence --runner test-results/runner-new --plan test-results/plan-new --output test-results/verified-new.json
pnpm test:tooling
```

출력 위치에는 아직 없는 디렉터리·파일을 사용한다.

`collect.mjs`는 개별 `title`만으로 ID를 추출하고 `IT-REC-04·07`, `UT-AI-11~13` 같은 표기를 확장한다. `fullName`은 참고로만 보존하며 describe 범위 ID는 상속하지 않는다. 러너 파일이 지정 루트 밖이거나 수준을 분류할 수 없으면 실패한다. 다른 PC·복사본에서 만든 JSON은 `--runner-root`에 그 실행 루트를, `--root`에 현재 대조 소스를 각각 지정한다. 루트를 못 찾았을 때 전체를 단위 검사로 분류하지 않는다.

`build-report.mjs`는 계획 3~8장의 정의 행을 읽고 `reviews.json`의 명시적 대조 기록을 적용한다. 기록이 없으면 NOT RUN이다. PASS에는 검토자·구체적 실제 결과·기대값 대조 메모·계획 정의 해시·테스트 파일 해시·assertion 줄과 해당 개별 테스트의 러너 PASS가 모두 필요하다. 파일이나 계획이 바뀌면 재검토를 요구한다. `reviews.json`은 작성자 자체 대조이며 지정 리뷰어 승인과 별개다.

`verify-evidence.mjs`는 원본 Vitest JSON에서 러너를 다시 만들고, 현재 계획·assertion 대조 기록에서 결과 행과 수준별 합계를 재계산한다. 기대 케이스 수나 PASS 수는 상수로 두지 않는다. 구조·해시 검증이 의미 대조를 대신하지 않으며 의미 판단의 근거는 ledger의 메모·소스 위치다.

새 러너·계획·assertion 텍스트 해시는 `utf8-lf`를 명시하고 CRLF를 LF로 정규화한다. Windows Git checkout과 Linux 사이의 줄바꿈만으로 증거 검증이 실패하지 않게 하며, 원본 실행 복사본 확인용 source manifest의 파일 해시는 실제 바이트를 그대로 비교한다.

`source.mjs`는 실제 Git HEAD·현재 작업 상태와 앱 전체·후처리·전략·클라이언트·평가 코드·lockfile의 해시를 묶는다. Git 없는 C: 실행 복사본을 평가할 때 이 manifest를 지정하고 파일 집합과 해시가 같아야 한다. `.env*`는 읽지 않는다.
