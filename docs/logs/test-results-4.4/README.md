# 4.4 증거 회차

PR 공유 기준은 최신 develop(발주 UI 포함)을 반영한 `pr-candidate-20261117/runner`, `plan`, `verification.json`이다. 로컬 Vitest는 209 PASS·90 SKIP이며 계획 177건의 68/92/17 판정은 유지한다.

`after-qa-20261117/runner-current`, `plan-final`, `verification-final.json`은 이전 7bfceb0 앱 기준의 QA 수정 검증 이력이다. `plan-reviewed`·`runner`는 같은 기존 입력을 새 도구로 재생성한 중간 점검이다.

이 폴더 바로 아래의 baseline·plan-results·evidence-verification은 초기 도구의 결과로 보존한 이력이다. 당시 임시 스크립트의 고정 합계 검사·ID/요구사항 변환 문제가 있어 최신 검증 증거로 사용하지 않는다. 최신 재현 도구와 assertion 대조 기록은 `tests/e2e/results/`에 있다.
