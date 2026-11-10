# WBS 3.10b 추천 프롬프트·고정 응답 검토

기준: `feature/3.10b-ai-prompts`, develop `2574a70`, 2026-11-10. 관련: FR-REC-01~02, BR-04, NFR-08·12.

## D-1: consumes 의미 결정 대기

독립 QA `run-20261110-1419`에서 기존 메뉴 `consumes`의 의미가 미합의임을 확인했다. 사용자는 11/10에 **아직 합의 전**이라고 확인했다. 현재 프롬프트·fixture의 1인분 전체 레시피는 **잠정안 A**이며 김형균·임지섭이 승인한 의미가 아니다. 이 항목은 병합 전에 결정·기록하고 결정에 맞게 프롬프트·fixture·검사를 함께 변경해야 한다.

| 선택지 | 의미·영향 | 필요한 결정·입력 |
|---|---|---|
| A (현재 잠정 구현) | 1인분 전체 레시피. 기존 입력으로 만들 수 있으나 비임박 재료도 포함. UI가 총소진량처럼 표시하면 오해 가능 | 1인분 표시·SRS의 임박 재료 요구와의 관계를 API·화면에서 정의 |
| B (추천안) | 1인분 레시피 중 임박 재료만 표시. FR-REC-02 문언에 가깝고 기준 분량을 명시할 수 있음 | 서버가 lib/stock으로 임박 재료를 선별·표시해 전달. 모델이 날짜 비교나 분량 계산을 하게 만들지 않음 |
| C | 권장 판매량에 따른 총소진량. PRD 예시와 가깝지만 현재 입력에는 목표 판매 인분이 없음 | 목표 인분의 결정 주체·서버 계산·표시 기준·API 의미부터 합의. AI 추정 수량을 재고 판단 근거로 쓰지 않음 |

**결정 주체:** 김형균(4.2·추천 화면·스키마)과 임지섭(지정 리뷰·계약). **현재 결정:** 없음. **합의/승인 근거:** 아직 없음. 상태가 결정 대기임을 API의 확정 정책이나 작업 완료로 기록하지 않는다.

## 변경과 사용

- `src/lib/ai/prompts/recommend.ts`: `buildRecommendationRequest()`가 기존 `AiRequest<Recommendation>`을 만든다. DB·모델 호출·현재 시계 접근·Strategy 선택·계산·저장은 하지 않는다. 출력 스키마와 Adapter는 기존 구현을 사용한다.
- 입력은 아키텍처 7.2의 스냅샷·정렬 후보와 구조가 같은 내부 타입이다. 화면↔서버 계약의 추가나 변경이 아니다. readonly 배열도 받을 수 있다.
- 프롬프트는 기존 메뉴·신규 아이디어, 원래 ID 사용·미등록 null·기본 단위·출력 길이·서버 계산 책임·사용자 확인을 안내한다. Strategy가 정한 후보 순서와 설명을 받아 사용한다.
- 사용자 문자열은 JSON 데이터에 둔다. 모델 전달 필드를 명시해 원시 행에 붙은 매장·세션·개인정보 필드를 제외한다. 이 구성과 문자열 분리 검사는 실제 모델이 악성 지시를 항상 무시한다는 증거가 아니다.
- `recommend.json`: 시드의 된장찌개·계란말이와 동일한 ID·이름, 잠정안 A의 1인분 레시피, 오징어 200g 입고량 기준 부족 예제·미등록 바질 예제. 두부는 g, 계란은 ea. 동적으로 바뀌는 기한·보유량을 문구에 확정하지 않는다.
- 기존 MockAdapter가 이미 이 JSON을 import하므로 고정 응답은 즉시 적용된다. `storage.json`은 확장 4.6 범위이며 수정하지 않았다.

4.2 담당자(김형균)는 검증한 매장 데이터로 다음과 같이 연결할 수 있다. 함수 이름·지역 변수는 연동 예시이며 신규 Route Handler 구현이 아니다.

```ts
import { getAiClient } from "@/lib/ai/client";
import { buildRecommendationRequest } from "@/lib/ai/prompts/recommend";
import { expiryStatus } from "@/lib/stock/status";

// Strategy 계산용 원본과 모델 전달용 스냅샷을 분리한다(API 9장 ②).
const rankedIngredients = strategy.rankIngredients(snapshot, today);
const promptSnapshot = {
  ...snapshot,
  ingredients: snapshot.ingredients.map((ingredient) => ({
    ...ingredient,
    lots: ingredient.lots.filter((lot) =>
      lot.remaining > 0 && expiryStatus(lot.expiresAt, today).status !== "expired",
    ),
  })),
};

const request = buildRecommendationRequest({
  today,
  snapshot: promptSnapshot,
  rankedIngredients,
  strategyGuide: strategy.promptGuide(),
});
const raw = await getAiClient().generate(request);
```

`today`는 서버의 `todayKST()`, 원본 `snapshot`은 해당 세션 매장의 활성 메뉴·레시피·재고·최근 7일 판매량으로 준비한다. **모델용 lots는 호출부가 lib/stock으로 선별한 사용 가능 묶음만 전달**한다. 경과 묶음이 남은 Strategy용 원본을 그대로 넘기지 않는다. null 기한의 사용 가능 묶음은 유지한다. 이 선별의 실제 구현·검증은 4.2의 책임이며 프롬프트 조립 함수가 대신하지 않는다.

`strategyGuide`는 서버 Strategy의 설명만 받는다. 호출부는 유한수·ISO 날짜·필수 키 등 입력 유효성을 보장해야 한다. 조립 함수는 NaN/Infinity가 null이 되거나 undefined 키가 사라지는 손실을 TypeError로 거부한다. 이는 내부 호출 오류이며 Route/Action은 호출 전에 검증하고 예상치 못한 오류를 기존 ActionResult 규칙으로 처리한다. 전체 입력 계약 검증을 대신하는 Zod 입구는 아니다. 메뉴 0개 거부·후처리·대체 추천·저장도 4.2의 책임이다.

## 검증 범위

| ID | 확인 내용 |
|---|---|
| UT-AI-22 | 기존 AiRequest·출력 스키마, 스냅샷·판매·후보 순서와 세 가지 Strategy 안내 전달 |
| UT-AI-23 | 따옴표·줄바꿈·지시문이 있는 데이터의 JSON 분리, 중첩 원시 행의 불필요한 필드 제외 |
| UT-AI-24 | 기존 출력 스키마, 재료·메뉴·레시피 행 각각의 ID 식, 잠정안 A의 이름/수량 대조. 실제 잔량 검증 아님 |
| UT-AI-25 | 실제 MockAdapter의 고정 응답 복사·독립성(NFR-12)·실패 모의(NFR-08) |
| UT-AI-26 | 시계·계산 없이 정상값·원본 보존, 비유한 수치·undefined 직렬화 손실 거부 |

초안의 신규 14건과 QA 후 추가한 직렬화 손실 거부 검사는 실제 AI·DB를 호출하지 않는 단위 검사다. fixture 검사는 시드 SQL의 JSON과 재료·메뉴·레시피 행 ID 식을 읽어 대조하며 SQL을 실행하지 않는다. `schemas.ts`·Adapter·client·Strategy·API·계약·시드는 수정하지 않았다.

2026-11-10 검증 결과: Node v24.22.1에서 신규 두 파일의 14건 통과, 환경 파일·기존 QA 산출물을 제외한 임시 소스 복사본 226파일에서 lint·typecheck 통과 및 전체 Vitest **134건 통과·35건 건너뜀**. 건너뜀은 로컬 Supabase가 없는 DB17·메뉴IT7·재료IT11건이다. pnpm이 PATH에 없어 프로젝트 스크립트와 같은 로컬 eslint·next typegen·tsc·vitest CLI를 직접 실행했다. CI Node22에서 실행한 결과를 주장하지 않는다.

검증 스크립트·로그·소스 복사본 경로는 `test-results/ai-prompts-validation/`에 기록했다. 소스 복사본은 OS 임시 폴더에 두어 새 검증용 .ts 파일이 원래 프로젝트의 전역 typecheck에 섞이지 않게 했다. `.env.example`의 기존 변경은 수정하거나 복사하지 않았다. 서버 내부 모듈·고정 응답 작업으로, 브라우저·실제 모델·실DB·전체 E2E·배포 build는 실행하지 않았다.

**독립 QA 후 작성자 재검증:** 권장 사항을 보완한 뒤 Node24 임시 소스 227파일에서 lint·typecheck 통과, 전체 **139건 통과·35건 건너뜀**, 신규 두 파일 **19건 통과**를 확인했다. 복사한 파일별 SHA-256과 복사본 일치 여부, 테스트별 JSON·verbose 로그를 `test-results/ai-prompts-validation/qa-fixes-20261110/`에 저장했다. 레시피 행 ID 접두어만 바꾼 변이를 UT-AI-24가 검출했고 원본 시드는 변하지 않았다. 이 결과는 D-1의 의미가 승인됐다는 뜻이 아니다.

## 남은 일

- 4.2의 실제 호출부·Strategy·재고 대조·원가 계산·저장·대체 경로 연동과 통합 검사. 없는 파일을 성윤우 범위에서 대신 구현하지 않았다.
- 고정 응답은 기본 시드 ID용이다. 임의 매장이나 다른 시점에서 유효한 추천을 보장하지 않는다. 서버 테스트는 해당 매장의 ID에 맞춘 AiClient 목을 준비하거나 시드 fixture를 연결해야 한다.
- 미등록 재료에는 기존 모델 스키마에 단위 필드가 없다. qty를 단위가 확정된 값으로 취급하지 않도록 프롬프트·예제에 연결 전 단위/양 확인 안내를 넣었다. 계약 필드를 임의로 추가하지 않았다.
- 실제 시드의 날짜·ordered 상태 등 2.9 보완은 별도 작업이다. 현재 고정 응답의 참조 검사로 실제 Supabase 검증 완료를 주장하지 않는다.
- 실제 모델의 추천 품질·인젝션 대응·20회 평가는 4.4에서 별도로 확인한다. 이 작업에서는 유료 호출하지 않는다.
- UT-AI-22~26 정의만 테스트 계획에 추가했다. PR #27의 3.9 문서 개정과 병합할 때 양쪽 정의·기준을 보존해야 한다.
- 독립 QA D-6의 예상 충돌은 후순위 PR에서 해결한다. 테스트 계획은 UT-AI-21·FR-REC-04·BR-03을 PR #27 내용으로 유지하고 UT-AI-22~26과 NFR-08·12의 UT-AI-25 연결을 합친다. 작업표는 3.9·3.10b 양쪽 진행 내용을, AI 로그는 양쪽 기록을 보존한다. 현재 PR #27은 승인됐으나 병합 전이므로 이 작업에서 대신 병합하지 않는다.
- 지정 리뷰·승인·PR 병합 전 작업표는 `[~]`로 둔다.
