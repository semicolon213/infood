# 테스트 계획서

**시스템:** 재고콕
**버전:** v0.2 / 2026-10-27
**관련 문서:** `03_SRS.md`, `08_API_SPEC.md`, `07_DB.md`

---

## 1. 목적과 범위

- **목적:** 재고 수량과 기한이 정확하게 계산·반영되는지, AI·외부 API가 실패해도 서비스가 안전하게 동작하는지 검증한다.
- **범위:** SRS의 P0·P1 요구사항, 비즈니스 규칙 BR-01~04, 비기능 요구사항 중 보안·성능·호환성
- **범위 밖:** 부하 테스트, 외부 API 자체의 정확성

## 2. 테스트 수준과 도구

| 수준 | 대상 | 도구 | 실행 시점 |
|---|---|---|---|
| 단위 | `lib/stock/*`, `lib/ai/*` 후처리, `lib/external` 정규화 | Vitest | 커밋 전, PR CI |
| DB | RLS 정책, RPC 함수 | Vitest + 로컬 Supabase (`supabase start`) | PR CI |
| 통합 | Server Actions, Route Handlers (AI·외부 API는 목) | Vitest + MSW | PR CI |
| E2E | 핵심 사용자 흐름 | Playwright (모바일 뷰포트 375×812) | 주간 점검, 배포 전 |
| AI 평가 | 명세서·라벨 인식 정확도, 추천 품질 | `eval/` 스크립트 | 프롬프트 변경 시, 주 1회 |
| 수동·실기기 | 카메라, 바코드, 촬영 | iPhone, Android 실기기 | 3·5주차 |

### 2.1 원칙
- **도메인 로직은 실제 DB 없이 테스트한다.** 오늘 날짜는 인자로 주입한다.
- AI는 기본적으로 `AI_MOCK=1` 고정 응답으로 테스트한다. 실제 모델 호출은 AI 평가에서만 한다.
- 외부 API는 MSW로 응답을 흉내 낸다 (정상, 없음, 타임아웃, 500).

## 3. 단위 테스트

### 3.1 기한 계산 `lib/stock/expiry.ts` (BR-01)

| ID | 입력 | 기대 결과 |
|---|---|---|
| UT-EXP-01 | 수동 입력 11/05, 라벨 소비기한 11/10 | 11/05, source=manual |
| UT-EXP-02 | 라벨 소비기한 11/10, 기본 보관일수 3 | 11/10, source=label |
| UT-EXP-03 | 제조일 10/01 + 기간 90일 | 12/30, source=label |
| UT-EXP-04 | 산란일 10/24, 기간 없음, 기본 21일 | 11/14, source=label |
| UT-EXP-05 | 정보 없음, 입고일 10/28, 기본 30일 | 11/27, source=default |
| UT-EXP-06 | `track_expiry = false` | null |
| UT-EXP-07 | 월말·윤년 경계 (2028-02-28 + 1일) | 2028-02-29 |
| UT-EXP-08 | API 기간 + 기준일 없음 | 입고일 + API 기간, source=api |
| UT-EXP-09 | `daysLeft` 계산: 오늘 10/28, 기한 10/27 | -1 (지남) |
| UT-EXP-10 | 제조일 2026-01-31 + 1개월 | 2026-02-28 (말일 보정) |
| UT-EXP-11 | 제조일 2026-03-15 + 12개월 | 2027-03-15 |

### 3.2 FEFO 계획 `lib/stock/fefo.ts` (BR-02)

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-FEFO-01 | 묶음 A(기한 11/01, 500g), B(11/05, 500g), 필요 300g | A에서 300g |
| UT-FEFO-02 | 같은 조건, 필요 700g | A 500g + B 200g |
| UT-FEFO-03 | 기한 같음, 입고일 다름 | 입고일 빠른 것부터 |
| UT-FEFO-04 | 기한 null 묶음 포함 | null 묶음은 마지막 |
| UT-FEFO-05 | 총잔량 800g, 필요 1000g | 800g 차감 + 부족 200g |
| UT-FEFO-06 | 같은 날 재입력: 기존 차감 A 300g 되돌림 반영 | A 잔량을 +300으로 보고 다시 계획 |
| UT-FEFO-07 | 여러 재료 동시 | 재료별로 독립 계획, 결과는 lot_id 오름차순 |
| UT-FEFO-08 | 소수 수량 (0.1 + 0.2) | 부동소수 오차 없음 (소수 3자리 반올림) |

### 3.3 단위 환산·원가 `lib/stock/unit.ts`, `cost.ts` (BR-03)

| ID | 입력 | 기대 결과 |
|---|---|---|
| UT-UNIT-01 | 10 kg → g | 10000 |
| UT-UNIT-02 | 1.5 L → ml | 1500 |
| UT-UNIT-03 | 2 단, custom 계수 200 (g) | 400 g |
| UT-UNIT-04 | 재료 단위 ea에 kg 입력 | 오류 (`VALIDATION`) |
| UT-UNIT-05 | 10kg 15,000원 → g당 단가 | 1.5 |
| UT-COST-01 | 레시피 원가 (두부 1모 900원 × 1 + 양파 100g × 1.5) | 1,050원 |

### 3.4 AI 후처리 `lib/ai/*`

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-AI-01 | 명세서 응답의 `matchedIngredientId`가 다른 매장 재료 | null로 변경 |
| UT-AI-02 | `unit = other`, `unitText = "박스"` | inputUnit=custom, confidence=low |
| UT-AI-03 | 스키마 불일치 응답 | 1회 재시도 후 `AI_INVALID_OUTPUT` |
| UT-AI-04 | 추천에 없는 메뉴 ID | 해당 항목 제거, droppedCount +1 |
| UT-AI-05 | 추천 소진량 > 잔량 | 해당 항목 제거 |
| UT-AI-06 | 추천 원가 | AI 값 무시, 서버 계산값 사용 |
| UT-AI-07 | 라벨 날짜가 10년 뒤 | confidence=low |
| UT-AI-08 | 소비기한 문구 파싱: "제조일로부터 12개월" / "제조일로부터 90일" / "별도표기일까지" | {12, month} / {90, day} / null |

### 3.5 외부 API 어댑터 `lib/external/*`

| ID | 상황 | 기대 결과 |
|---|---|---|
| UT-EXT-01 | 정상 응답 | `ProductInfo`로 정규화 |
| UT-EXT-02 | 결과 0건 | null |
| UT-EXT-03 | 5초 타임아웃 | `EXTERNAL_API_FAILED` |
| UT-EXT-04 | 필드 누락 | 해당 필드 null, 오류 없음 |

## 4. DB 테스트 (RLS, RPC)

| ID | 대상 | 시나리오 | 기대 결과 |
|---|---|---|---|
| DB-01 | RLS | 사용자 B가 A 매장 재료 조회 | 0건 |
| DB-02 | RLS | 사용자 B가 A 매장 store_id로 재료 insert | 거부 |
| DB-03 | RLS | `stock_movements` update/delete | 거부 |
| DB-04 | RLS | 인증 사용자가 `products` insert | 거부 (service role만 가능) |
| DB-05 | Storage | B가 `{A매장}/x.jpg` 읽기 | 거부 |
| DB-06 | `receive_stock` | 묶음 2개 입고 | 묶음 2 + 이력 2, 잔량=수량 |
| DB-07 | `receive_stock` | 다른 매장 재료 ID 포함 | 전체 롤백, `NOT_FOUND` |
| DB-08 | `receive_stock` | 이미 confirmed 명세서 | `CONFLICT`, 롤백 |
| DB-09 | `apply_consumption` | 잔량보다 큰 차감 | `STOCK_CONFLICT`, 전체 롤백 |
| DB-10 | `record_daily_sales` | 같은 날 2회 저장 (23 → 20) | 최종 잔량이 20 기준과 같음, 이력에 되돌림 존재 |
| DB-11 | `record_daily_sales` | 두 세션에서 동시에 같은 묶음 차감 | 한쪽 `STOCK_CONFLICT`, 잔량 음수 없음 |
| DB-12 | `adjust_lot` | 잔량을 수량보다 크게 | `VALIDATION` |
| DB-13 | `increment_ai_usage` | 한도 초과 | `RATE_LIMITED` |
| DB-14 | 제약 | `remaining > quantity` 직접 update | 거부 |

## 5. 통합 테스트 (Server Actions, Route Handlers)

| ID | 대상 | 시나리오 | 기대 결과 | 관련 FR |
|---|---|---|---|---|
| IT-01 | 모든 Action | 미로그인 호출 | `UNAUTHORIZED` | AUTH-03 |
| IT-02 | `createIngredient` | 같은 이름 중복 | `CONFLICT` | ING-01 |
| IT-03 | `createIngredient` | track_expiry=true, 보관일수 없음 | `VALIDATION` | ING-01 |
| IT-04 | `parse` | AI 목 정상 | 행 목록, 기한 미리보기 포함, status=parsed | RCP-02 |
| IT-05 | `parse` | AI 목 실패 | status=failed, `AI_FAILED` | RCP-03 |
| IT-06 | `confirmReceipt` | 수정된 연결 포함 | 묶음 생성, 별칭 추가 | RCP-06, ING-05 |
| IT-07 | `barcode` | 매장 매핑 있음 | source=store, 외부 API 호출 없음 | BAR-02 |
| IT-08 | `barcode` | 캐시 없음, API 정상 | source=api, products 저장 | BAR-03 |
| IT-09 | `barcode` | 같은 바코드 재조회 | source=cache, API 호출 0회 | NFR-13 |
| IT-10 | `barcode` | API 결과 없음 | source=none, found=false 캐시 | BAR-05 |
| IT-11 | `recordDailySales` | 재고 부족 | 차감 + shortages 반환 | SALE-03 |
| IT-12 | `recordDailySales` | 미래 날짜 | `VALIDATION` | SALE-01 |
| IT-13 | `recommendations` | 메뉴 0개 | `VALIDATION` | REC-01 |
| IT-14 | `recommendations` | AI 목 정상 | 검증된 결과, DB 저장 | REC-01~04 |
| IT-15 | `acceptRecommendation` | 아이디어 채택 | is_special 메뉴 + 레시피 생성 | REC-05 |
| IT-16 | `getDashboard` | 시드 데이터 | 임박·부족·폐기 금액이 기대값과 일치 | DASH-01~03 |

## 6. E2E 테스트 (Playwright, 모바일 뷰포트)

| ID | 시나리오 | 확인 사항 |
|---|---|---|
| E2E-01 | 명세서 입고: 로그인 → 입고 → 사진 업로드(테스트 이미지) → 확인 화면에서 1행 수정 → 입고 | 재료 상세에 묶음, 대시보드 갱신 |
| E2E-02 | 바코드 입고: 숫자 입력으로 바코드 조회 → 새 재료 등록 → 수량 → 입고 | 다음 조회 시 source=store |
| E2E-03 | 판매 마감: 수량 입력 → 저장 → 같은 날 수정 저장 | 잔량이 최종 수량 기준 |
| E2E-04 | 추천: 임박 재료 있는 상태에서 추천 → 특선 등록 | 메뉴 목록에 특선 표시 |
| E2E-05 | 폐기: 대시보드 지난 묶음 → 폐기 처리 | 폐기 금액 증가, 경고 사라짐 |
| E2E-06 | 실패 경로: AI 목 실패 → "직접 입력"으로 입고 완료 | 막다른 화면 없음 |
| E2E-07 | 첫 사용자: 가입 → 매장 생성 → 빈 대시보드 안내 | 빈 상태 문구와 버튼 |

## 7. AI 평가

### 7.1 데이터
- `eval/receipts/`: 실제 명세서 10~20장 + 정답 JSON (품목, 수량, 단위, 연결 재료)
- `eval/labels/`: 라벨 사진 10장 + 정답 (날짜 유형, 날짜)
- `eval/recommend/`: 재고 상황 5가지 시나리오

### 7.2 지표

| 지표 | 계산 | 목표 |
|---|---|---|
| 품목 재현율 | 정답 품목 중 인식된 비율 | ≥ 90% |
| 품목·수량 정확도 | 품목·수량·단위가 모두 맞은 비율 | ≥ 85% |
| 재료 연결 정확도 | 연결된 재료가 정답과 같은 비율 | ≥ 80% |
| 라벨 날짜 정확도 | 유형과 날짜가 모두 맞은 비율 | ≥ 80% |
| 추천 유효율 | 검증을 통과한 추천 비율 (1 − droppedCount/전체) | ≥ 90% |
| 추천 임박 재료 활용률 | 추천이 D-3 이내 재료를 하나 이상 소진하는 비율 | ≥ 80% |
| 응답 시간 | 명세서 인식 P95 | ≤ 15초 |

### 7.3 실행
프롬프트를 바꿀 때마다 `pnpm eval:receipts`(명령어 목록은 루트 `AGENTS.md`)를 실행해 결과를 `eval/results/{날짜}.md`로 저장하고, 결과 표를 PR에 첨부한다.

## 8. 비기능 테스트

| ID | 항목 | 방법 | 기준 |
|---|---|---|---|
| NFT-01 | 화면 응답 | Lighthouse 모바일 / Vercel 분석 | 주요 화면 LCP ≤ 2.5초 |
| NFT-02 | 바코드 조회 | 캐시 적중·미적중 시간 측정 | 1초 / 3초 이내 |
| NFT-03 | 보안 | 클라이언트 번들에서 비밀 키 검색 | `ANTHROPIC`, `SERVICE_ROLE`, `FOODSAFETY` 미포함 |
| NFT-04 | 접근성 | axe (Playwright) | 심각 위반 0건 |
| NFT-05 | 호환성 | 실기기 매트릭스 (9장) | 핵심 흐름 전부 동작 |
| NFT-06 | 업로드 | 10MB 원본 사진 | 압축 후 5MB 이하로 업로드 |

## 9. 실기기 매트릭스

| 기기 | 브라우저 | 확인 항목 |
|---|---|---|
| iPhone (iOS 최신) | Safari | 카메라 권한, 바코드, 촬영, 하단 안전 영역 |
| iPhone (iOS 직전 버전) | Safari | 바코드, 촬영 |
| Android (최신) | Chrome | 카메라 권한, 바코드, 촬영, 진동 |
| PC | Chrome | 사이드바 레이아웃, 파일 업로드 |

## 10. 진입·종료 기준

| 구분 | 기준 |
|---|---|
| 각 PR 머지 | lint·typecheck·단위·DB·통합 테스트 통과 |
| M3 (3주차) | E2E-01, 02 통과 |
| M4 기능 동결 | E2E 전체 통과, 심각도 1·2 결함 0건 |
| 최종 발표 | 실기기 매트릭스 통과, AI 평가 결과표 완성 |

## 11. 결함 관리

| 심각도 | 정의 | 처리 기한 |
|---|---|---|
| 1 치명 | 재고 수량·기한이 틀리게 저장, 다른 매장 데이터 노출 | 즉시 |
| 2 높음 | 핵심 흐름(입고·마감·추천) 진행 불가 | 1일 |
| 3 보통 | 우회 가능한 기능 오류 | 해당 주 |
| 4 낮음 | 화면·문구 | 5주차 |

결함은 GitHub Issue에 `bug`, `sev-1`~`sev-4` 라벨로 등록하고, 재현 절차·기대 결과·실제 결과를 적는다.
