# 러너 실행 결과

대상 7b8bd6eee401b1386728c6300491b93dc29efe6d · v22.17.0 · win32

총 333건: {"PASS":333,"FAIL":0,"SKIP":0,"NOT RUN":0}

계획 PASS는 별도 assertion 대조 기록이 필요합니다.

| 파일 | 개별 테스트 제목 | ID | 수준 | 러너 판정 |
|---|---|---|---|---|
| src/actions/ingredients.test.ts | IT-ING-01: 같은 이름 중복 → CONFLICT | IT-ING-01 | 통합 | PASS |
| src/actions/ingredients.test.ts | IT-ING-02: trackExpiry=true, 기본 보관일수 없음 → VALIDATION | IT-ING-02 | 통합 | PASS |
| src/actions/ingredients.test.ts | IT-ING-03: targetStock < minStock → VALIDATION | IT-ING-03 | 통합 | PASS |
| src/actions/ingredients.test.ts | IT-ING-04: 환산 단위 {단, 1000} 추가 → ingredient_units 저장, 목록·상세에서 보임 | IT-ING-04 | 통합 | PASS |
| src/actions/ingredients.test.ts | IT-ING-05: 잔량(경과 포함) > 0 → 비활성화 CONFLICT | IT-ING-05 | 통합 | PASS |
| src/actions/ingredients.test.ts | IT-ING-06: 묶음 3개 → 유통기한 순, 기한 없는 묶음은 마지막 | IT-ING-06 | 통합 | PASS |
| src/actions/ingredients.test.ts | IT-ING-07: status soon / expired / low, 이름 검색 | IT-ING-07 | 통합 | PASS |
| src/actions/ingredients.test.ts | 기본 단위 변경: 잔량 0인 과거 묶음이 있어도 CONFLICT, 묶음이 없으면 허용 |  | 통합 | PASS |
| src/actions/ingredients.test.ts | 환산 단위 통째 교체, 대소문자만 다른 이름은 VALIDATION |  | 통합 | PASS |
| src/actions/ingredients.test.ts | 잔량 0이면 비활성화 → 목록·상세에서 빠지고, 같은 이름 재등록은 CONFLICT |  | 통합 | PASS |
| src/actions/ingredients.test.ts | 다른 매장 재료 조회·수정·비활성화 → null / NOT_FOUND |  | 통합 | PASS |
| src/actions/menus.test.ts | IT-MENU-01: 이름·판매가·레시피 2개 → 메뉴 + recipe_items 저장 | IT-MENU-01 | 통합 | PASS |
| src/actions/menus.test.ts | IT-MENU-02: 소요량 0 → VALIDATION | IT-MENU-02 | 통합 | PASS |
| src/actions/menus.test.ts | IT-MENU-03: 비활성화 → isActive false (판매 마감·추천 제외는 3.6b·4.2에서 이 값을 씀) | IT-MENU-03 | 통합 | PASS |
| src/actions/menus.test.ts | 수정 시 레시피 통째 교체: 빠진 재료는 지우고 남은 재료는 수량 갱신 |  | 통합 | PASS |
| src/actions/menus.test.ts | 같은 이름 → CONFLICT |  | 통합 | PASS |
| src/actions/menus.test.ts | 다른 매장 재료 → VALIDATION, 메뉴도 만들지 않음 |  | 통합 | PASS |
| src/actions/menus.test.ts | 다른 매장 메뉴 수정·비활성화 → NOT_FOUND |  | 통합 | PASS |
| src/actions/orders.test.ts | IT-ORD-02: 초안에서 1개 삭제·1개 추가·수량 수정 → 고친 그대로 draft 저장, 수량 0 이하는 제외 | IT-ORD-02 | 통합 | PASS |
| src/actions/orders.test.ts | IT-ORD-03: ordered 목록 수정 → CONFLICT, 품목 유지 | IT-ORD-03 | 통합 | PASS |
| src/actions/orders.test.ts | saveOrder: 없는 목록·다른 매장 목록 → NOT_FOUND, 다른 매장 재료 → NOT_FOUND |  | 통합 | PASS |
| src/actions/orders.test.ts | saveOrder: 같은 재료 두 번·메모 200자 초과 → VALIDATION, 저장 없음 |  | 통합 | PASS |
| src/actions/orders.test.ts | IT-ORD-04: draft→ordered, ordered→draft, ordered→received 모두 성공, ordered_at·received_at 기록 | IT-ORD-04 | 통합 | PASS |
| src/actions/orders.test.ts | IT-ORD-05: draft→received, received→draft, received→ordered, 같은 상태로 → CONFLICT, 상태 유지 | IT-ORD-05 | 통합 | PASS |
| src/actions/orders.test.ts | setOrderStatus: 없는 목록·다른 매장 목록 → NOT_FOUND |  | 통합 | PASS |
| src/actions/orders.test.ts | IT-ORD-06: ordered 삭제 → CONFLICT, draft 삭제는 품목까지 지워짐, 없는 목록 → NOT_FOUND | IT-ORD-06 | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK-01: 3품목, 하나는 유통기한 입력·둘은 비움 → 묶음 3, 비운 품목은 BR-01 계산값과 근거 | IT-STK-01 | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK-02: 2kg, 15,000원 (재료 단위 g) → 잔량 2000g, unit_price 7.5 | IT-STK-02 | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK-03: 환산 단위 없는 "박스" → VALIDATION, fields[items.N.unit], 묶음·이력 없음 | IT-STK-03 | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK-04: 수량 0 또는 유통기한 < 입고일 → VALIDATION, 해당 행 표시, 묶음·이력 없음 | IT-STK-04 | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK 보조: 환산 단위로 입고 (대파 2단 = 600g), 같은 재료 여러 줄은 묶음 따로 |  | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK 보조: 소수 넷째 자리 수량(0.0004g) → 계약에서 VALIDATION items.N.qty (08_API_SPEC 1.4) |  | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK 보조: 환산·반올림 뒤 0이 되는 수량(계수 0.0001 단위 × 1) → VALIDATION items.N.qty, 묶음·이력 없음 |  | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK 보조: 미래 입고일 → VALIDATION |  | 통합 | PASS |
| src/actions/receive.test.ts | IT-STK 보조: 비활성 재료·다른 매장 재료 → NOT_FOUND, 묶음 없음 |  | 통합 | PASS |
| src/actions/recommend.test.ts | IT-REC-09: 매장 재료가 아닌 재료가 남으면 VALIDATION, 메뉴 저장 없음 | IT-REC-09 | 통합 | PASS |
| src/actions/recommend.test.ts | IT-REC-08: 사용자가 고친 이름·가격·수량으로 is_special 메뉴 + 레시피, accepted = true | IT-REC-08 | 통합 | PASS |
| src/actions/recommend.test.ts | IT-REC-08 보조: 같은 이름 메뉴 → CONFLICT / 없는 아이디어 → NOT_FOUND | IT-REC-08 | 통합 | PASS |
| src/actions/sale-orders.test.ts | 사이트: 2인분 판매 → 가까운 기한부터 200g 차감, 기록 1건 |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 재고보다 많이 팔면 있는 만큼 차감하고 부족을 알려 준다 |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 포스: 토큰 인증 → 차감, 같은 주문번호 재전송은 한 번만 반영 |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 포스: 토큰 없음 → 401, 다른 매장 메뉴 → VALIDATION, 메뉴 목록 조회 |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 같은 날짜에 판매 마감과 주문별 판매를 섞으면 두 번 차감하지 않게 막는다 |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 4.8a 취소: 줄인 묶음에 그대로 되돌리고 adjust 이력을 남긴다, 두 번 취소는 CONFLICT |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 4.8a 포스 취소: 주문번호로 취소, 없는 번호는 NOT_FOUND. 취소만 남은 날짜는 마감 가능 |  | 통합 | PASS |
| src/actions/sale-orders.test.ts | 4.8a 다른 매장 주문은 취소할 수 없다 |  | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE 보조(F-02 정상): 양파 100g 메뉴 7개 → A 500g + B 200g 차감, X 유지, 판매·이력 저장 |  | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE-01: 재고 부족 (12개 = 1200g, 사용 가능 1000g) → 1000g만 차감 + 부족 200g 반환·저장 | IT-USE-01 | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE-02: 미래 날짜 → VALIDATION, 마감·차감 없음 | IT-USE-02 | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE-03: 이미 마감한 날짜 다시 저장 (FR-USE-06 미구현) → CONFLICT, 추가 차감 없음 | IT-USE-03 | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE-04: 경과 묶음만 남은 재료 → 차감 없음, 부족으로 기록 | IT-USE-04 | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE-05: 계획 직후 다른 요청이 Q 250g 폐기 → 1회 충돌 뒤 재계획(Q 250g·부족 50g)으로 성공, 기록 1세트 | IT-USE-05 | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE-05 재충돌 변형: 재계획 직후 100g 더 폐기 → 2회 시도 후 STOCK_CONFLICT, 이 액션의 기록 0건 | IT-USE-05 | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE 보조: 비활성·다른 매장 메뉴 → VALIDATION sales.N.menuId |  | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE 보조: getSalesDay — 마감 전 qty 0, 최근 7일 판매량 순, 비활성 메뉴 제외 |  | 통합 | PASS |
| src/actions/sales.test.ts | IT-USE 보조: getSalesDay — 마감한 날은 그 뒤 비활성화한 메뉴의 판매 수량도 보여 줌 (PR #41 리뷰) |  | 통합 | PASS |
| src/actions/storage.test.ts | UT-STO-01: 재료 이름 → 고정 응답 추천값 (저장 없음) | UT-STO-01 | 통합 | PASS |
| src/actions/storage.test.ts | 이름이 비면 VALIDATION, AI 장애면 AI_FAILED |  | 통합 | PASS |
| src/actions/storage.test.ts | 일일 한도를 넘으면 RATE_LIMITED |  | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE-06: 직원 식사 2품목(kg 환산 포함), 메모 → FEFO 차감, usage_records 2건·메모 저장 | IT-USE-06 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE-07: 사용량 > 사용 가능 재고 → 가능한 만큼 차감 + shortages 반환, short_qty 저장 (경과 묶음 유지) | IT-USE-07 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE-08: 경과 묶음 전량 폐기, reason=expired → 잔량 0, 경과 묶음 목록에서 사라짐 | IT-USE-08 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE-09: 폐기량 > 현재 잔량 (입력 실수) → VALIDATION fields.qty, RPC 호출 없음 | IT-USE-09 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE-10: 계획 직후 다른 요청이 Q 250g 폐기 → 1회 충돌 뒤 재계획(Q 250g·부족 50g)으로 성공, 기록 1세트 | IT-USE-10 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE-10 재충돌 변형: 재계획 직후 100g 더 폐기 → 2회 시도 후 STOCK_CONFLICT, 이 액션의 기록·차감 0건 | IT-USE-10 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE 보조: 폐기 확인 뒤 다른 기기에서 잔량이 줄면 → STOCK_CONFLICT, 실패 폐기 이력 없음 (DB-13 서버 경로) | DB-13 | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE 보조: 같은 재료 여러 줄은 합쳐 기록 1건, 비활성·다른 매장 재료·없는 묶음 → NOT_FOUND |  | 통합 | PASS |
| src/actions/usage.test.ts | IT-USE 보조(UI-REG-10): 이력 조회 — 31일(양끝 포함) 정상·32일·역전 거부, 최신순, 종류 필터 | UI-REG-10 | 통합 | PASS |
| src/lib/date.test.ts | UTC 15:00 이후는 KST 다음 날 |  | 단위 | PASS |
| src/lib/result.test.ts | RPC가 던진 코드는 그대로, 그 밖의 DB 오류는 INTERNAL |  | 단위 | PASS |
| src/lib/result.test.ts | 문구를 준 코드만 살리고 나머지는 INTERNAL + fallback |  | 단위 | PASS |
| src/types/contracts.test.ts | 재료: 적정 재고 < 최소 재고, 기한 추적인데 보관일수 없음 → 항목별 오류 |  | 단위 | PASS |
| src/types/contracts.test.ts | 재료: 환산 단위에 기본 단위 이름(kg) 금지, 중복 금지 |  | 단위 | PASS |
| src/types/contracts.test.ts | 입고: 유통기한 < 입고일 → items.N.expiresAt (UC-04 6a) |  | 단위 | PASS |
| src/types/contracts.test.ts | 입고: 품목 0개 거부, 날짜 형식 검사 |  | 단위 | PASS |
| src/types/contracts.test.ts | 판매 마감: 수량 합계 0 거부, 소수 수량 거부 |  | 단위 | PASS |
| src/types/contracts.test.ts | 발주: 같은 재료 두 줄 거부, qty 0 품목은 허용(저장 시 제외, UC-09 3a) |  | 단위 | PASS |
| src/types/contracts.test.ts | 수량: 소수 셋째 자리까지 (0.001·0.1+0.2 통과, 0.0004·1.2345 거부, 08 1.4) |  | 단위 | PASS |
| src/types/contracts.test.ts | 메뉴: 판매가 0 이상 2,147,483,647 이하 정수 (DB int, 08 4장) |  | 단위 | PASS |
| src/components/dashboard/dashboard-view.test.ts | dayLabel: 날짜 문자열을 월/일 (요일)로 |  | 화면 입력 보조 | PASS |
| src/components/dashboard/dashboard-view.test.ts | FR-DASH-01: 임박 묶음을 기한 순으로 D-n과 날짜와 함께 |  | 화면 입력 보조 | PASS |
| src/components/dashboard/dashboard-view.test.ts | FR-DASH-02: 기한 지난 묶음은 따로, 해당 묶음 폐기 화면으로 연결 |  | 화면 입력 보조 | PASS |
| src/components/dashboard/dashboard-view.test.ts | FR-DASH-03: 부족 재료는 사용 가능 재고 / 최소 재고 |  | 화면 입력 보조 | PASS |
| src/components/dashboard/dashboard-view.test.ts | FR-DASH-04: 경고가 없어도 추천·발주 바로가기 |  | 화면 입력 보조 | PASS |
| src/components/dashboard/dashboard-view.test.ts | D-0도 D-n 형식 (재료 화면과 같음) |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 문자열 입력을 공유 DTO로 변환하고 선택값을 생략한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 기한 추적 시 보관일수가 없으면 필드 오류를 반환한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 보관일수 1.5를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 보관일수 0를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 보관일수 3651를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 보관일수 Infinity를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 보관일수 숫자아님를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 추적을 끄면 숨긴 보관일수를 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 적정 재고가 최소보다 작으면 필드 오류를 반환한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 비어 있는 필수 수량을 0으로 바꾸지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 수정 시 한국어 카테고리와 환산 계수를 보존한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 예약 단위 kg를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 예약 단위 L를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 예약 단위 g를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 예약 단위 ml를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 예약 단위 ea를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 공백 정리 후 중복 단위와 10개 초과를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 숫자 변환·계약·중복 단위 오류를 첫 제출에서 모두 반환한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 계수와 보관일수가 이름·필수 보관일수·중복 오류를 숨기지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 경과 재고도 잔량으로 취급하고 사용 가능량은 서버 값을 쓴다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 서버 묶음 순서와 단가 정밀도를 표시한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 묶음 D--1에 목록과 같은 expired 배지 톤을 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 묶음 D-0에 목록과 같은 urgent 배지 톤을 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 묶음 D-1에 목록과 같은 urgent 배지 톤을 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 묶음 D-2에 목록과 같은 soon 배지 톤을 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 묶음 D-3에 목록과 같은 soon 배지 톤을 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 묶음 D-4에 목록과 같은 ok 배지 톤을 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 기한 없는 묶음에는 상태 색을 붙이지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 부족 여부와 남은 일수는 현재 날짜로 재계산하지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 기한 정보 없음과 기한 추적 제외를 구분한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 부족 링크·검색·보관 필터를 새로고침 후에도 읽는다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 잘못된 URL 조건은 기본값으로 처리한다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UI-ING-UNIT: 입고 복귀만 허용하고 외부 경로는 목록으로 돌린다 |  | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UT-STO-01: storage=fridge, days=7 → 폼에 채우고 저장은 하지 않는다 | UT-STO-01 | 화면 입력 보조 | PASS |
| src/components/ingredients/ingredients.test.ts | UT-STO-01: 사용자가 쓴 카테고리와 잠긴 단위는 그대로 둔다 | UT-STO-01 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조: 기본 단위 수량과 원 정수를 공유 계약으로 전달 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조: 빈 금액·소요량을 0으로 바꾸지 않고 이름 오류도 함께 안내 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조: 소수 판매가·잘못된 소요량과 재료 중복을 동시에 검출 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조: 계약의 수량 상한·0원·빈 레시피를 유지 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조: 수정 중 선택할 수 없게 된 재료를 자동 삭제하지 않고 안내 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조: 수정 초깃값은 저장된 수량을 손실 없이 문자열로 표시 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조 D-3: 소수 넷째 자리 입력은 반올림하거나 전송하지 않는다 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조 D-6·D-7: 판매가 int 상한을 지키고 지수·진법 표기는 거부 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조 D-4: 재료 변경 시 그 필드만 해제하고 다른 행·수량 오류는 유지 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조 D-4: 행 삭제 시 남은 오류를 새 인덱스에 연결 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/menus/form-input.test.ts | E2E-02 보조 D-4: 다른 행의 변경으로 해소된 중복 안내만 해제 | E2E-02 | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 권장 발주량을 다시 계산하지 않고 기본 단위 그대로 채운다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 수량 를 서버에 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 수량 1e3를 서버에 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 수량 Infinity를 서버에 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 수량 NaN를 서버에 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 수량 0.0001를 서버에 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 수량 1000001를 서버에 보내지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 0 이하 행을 유지해 서버 오류의 행 번호가 어긋나지 않는다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 중복 재료와 선택할 수 없는 재료를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 실제 날짜가 아닌 발주일과 미래 날짜를 거절한다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 행 삭제 뒤 오류 경로를 남은 품목에 맞추고 수정한 오류만 지운다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 날짜 역전·중복 검색값을 거절하고 빈 기간은 전체 조회로 넘긴다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 선택 불가인 기존 행이 있어도 아직 쓰지 않은 재료를 추가한다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | state와 다른 화면 입력값을 제출 시 읽고 빈 문자열도 유지한다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 화면에 연결할 수 없는 서버 오류도 사용자에게 전달한다 |  | 화면 입력 보조 | PASS |
| src/components/orders/form-input.test.ts | 잘못된 날짜 필드만 오류로 표시한다 |  | 화면 입력 보조 | PASS |
| src/components/recommend/recommendation-result.test.ts | FR-REC-05: 정상 결과는 'AI 추천' 표시 |  | 화면 입력 보조 | PASS |
| src/components/recommend/recommendation-result.test.ts | FR-REC-03: 재료마다 보유 / 재고 부족(지금 수량) / 등록되지 않은 재료(단위 없이) |  | 화면 입력 보조 | PASS |
| src/components/recommend/recommendation-result.test.ts | 기존 메뉴 재료는 '1인분 기준'으로 표시 (08 v0.3.2) |  | 화면 입력 보조 | PASS |
| src/components/recommend/recommendation-result.test.ts | 예상 원가는 서버 값, 미등록 재료가 있으면 원가 제외 안내 |  | 화면 입력 보조 | PASS |
| src/components/recommend/recommendation-result.test.ts | UC-08 3a: 대체 결과는 '규칙 기반' 안내, 새 특선 구역 없음 |  | 화면 입력 보조 | PASS |
| src/components/recommend/recommendation-result.test.ts | 추천 메뉴가 없으면 빈 상태 문구 |  | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 기본 단위 수량·메모를 공유 사용 계약에 전달 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | IT-USE-06 보조: 계약에 따라 같은 재료의 여러 사용 행을 허용 | IT-USE-06 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 빈 재료·수량·미래 날짜 오류를 함께 반환 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 0·음수·상한 초과·정밀도 초과·지수 표기는 전송하지 않음 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 존재하지 않는 날짜·재료·빈 품목·긴 메모 검사 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | IT-USE-08 보조: 경과 묶음 링크는 정확한 재료·잔량·경과 사유를 미리 채움 | IT-USE-08 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | IT-USE-09 보조: 폐기는 선택한 재료의 묶음과 잔량 이내만 허용 | IT-USE-09 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 경과하지 않은 묶음은 사유를 사용자가 선택 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조 D-1: 직접 묶음을 고르면 폐기량·사유·메모를 그대로 유지 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조 D-5: 재료를 바꿀 때 단위가 달라질 수 있는 수량·묶음만 초기화 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 조회는 31일 경계·역전·미래·종류를 검증 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 행 추가·재료 수정은 다른 행 오류를 유지 | E2E-04 | 화면 입력 보조 | PASS |
| src/components/waste/form-input.test.ts | E2E-04 보조: 행 삭제 시 남은 오류의 인덱스를 이동 | E2E-04 | 화면 입력 보조 | PASS |
| src/lib/queries/dashboard.test.ts | IT-DASH-01: 임박은 D(D-0)·A(D-1)·B(D-3) 기한 순, 경과 X는 따로, C(D-4)·기한 없는 묶음은 제외 | IT-DASH-01 | 통합 | PASS |
| src/lib/queries/dashboard.test.ts | IT-DASH-02: 양파 총잔량 1500g이어도 사용 가능 1000g < 최소 1200g이면 부족 | IT-DASH-02 | 통합 | PASS |
| src/lib/queries/dashboard.test.ts | IT-DASH-04: 묶음·부족 재료가 없는 매장 → 각 목록 빈 배열, 폐기 금액 0원 | IT-DASH-04 | 통합 | PASS |
| src/lib/queries/dashboard.test.ts | IT-X03: 이번 주·지난주 폐기 금액 = 폐기량 × 묶음 단가 (주 시작은 KST 월요일, 단가 없는 묶음 0원) |  | 통합 | PASS |
| src/lib/queries/dashboard.test.ts | IT-DASH-04: 조회 실패는 빈 대시보드로 위장하지 않고 예외로 전달 | IT-DASH-04 | 통합 | PASS |
| src/lib/queries/menus.test.ts | UT-COST-01·02 연동: 최근 입고 단가로 원가 1,050원·원가율 15.0%. 다 쓴 묶음의 단가도 최근이면 쓴다 | UT-COST-01, UT-COST-02 | 통합 | PASS |
| src/lib/queries/menus.test.ts | UT-COST-03 연동: 단가를 모르는 재료가 있거나 레시피가 없으면 cost·costRate 없음, 판매가 0원이면 costRate만 없음 | UT-COST-03 | 통합 | PASS |
| src/lib/queries/orders.test.ts | IT-ORD-01: 부족 재료 3개 중 미입고 발주로 충분한 1개는 빠지고, 권장량은 UT-ORD 계산과 같다 | IT-ORD-01 | 통합 | PASS |
| src/lib/queries/orders.test.ts | IT-ORD-09: 부족 재료가 없으면 빈 items | IT-ORD-09 | 통합 | PASS |
| src/lib/queries/orders.test.ts | IT-ORD-07: 같은 날 목록 2개를 모두 조회, 날짜 내림차순, 기간으로 거른다 | IT-ORD-07 | 통합 | PASS |
| src/lib/queries/orders.test.ts | IT-ORD-08: 저장한 목록을 getOrder로 불러와 복사 텍스트를 만든다 | IT-ORD-08 | 통합 | PASS |
| src/lib/queries/orders.test.ts | getOrder: 다른 매장 목록·없는 ID·형식이 틀린 ID는 null |  | 통합 | PASS |
| src/lib/ai/client.test.ts | UT-AI-09: AI_MOCK=1이면 MockAdapter, 같은 task면 같은 고정 응답 | UT-AI-09 | 단위 | PASS |
| src/lib/ai/client.test.ts | UT-AI-09: AI_MOCK=fail이면 AI_FAILED (NFR-08 장애 모의) | UT-AI-09 | 단위 | PASS |
| src/lib/ai/client.test.ts | UT-AI-09: AI_MOCK이 없으면 실제 어댑터. 기본은 GeminiAdapter | UT-AI-09 | 단위 | PASS |
| src/lib/ai/client.test.ts | UT-AI-09 보조: AI_PROVIDER=anthropic이면 ClaudeAdapter | UT-AI-09 | 단위 | PASS |
| src/lib/ai/client.test.ts | UT-AI-09: 고정 응답이 스키마에 맞지 않으면 AI_INVALID_OUTPUT | UT-AI-09 | 단위 | PASS |
| src/lib/ai/receipt.test.ts | UT-RCP-01: 다른 매장 재료 ID → null로 바꾸고 이름 일치로만 다시 연결 | UT-RCP-01 | 단위 | PASS |
| src/lib/ai/receipt.test.ts | UT-RCP-02: 환산할 수 없는 단위(박스) → unit null, 확인 필요 | UT-RCP-02 | 단위 | PASS |
| src/lib/ai/receipt.test.ts | 등록한 환산 단위·단위 생략은 그대로 쓴다 |  | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-04: 매장 활성 메뉴가 아닌 menuId는 제외하고 droppedCount +1 | UT-AI-04 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-05: 소진량 > 사용 가능 재고면 항목을 지우지 않고 short, shortCount +1 | UT-AI-05 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-06: estCost는 AI 값이 아니라 최근 묶음 단가로 서버가 계산 (미등록 재료는 제외) | UT-AI-06 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-15: 매장에 없는 재료(ingredientId=null, 바질) → unregistered, availableQty null | UT-AI-15 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-16: 다른 매장 재료 ID + 이름 ' 양 파 ' → 이름 정규화로 매장 양파에 연결 | UT-AI-16 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-17: ingredientId=null, ' TOFU  milk ' → 대소문자·공백 무시로 'Tofu Milk'에 연결 | UT-AI-17 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-18: 소진량 ≤ 사용 가능 재고 → have, availableQty는 DB 값 | UT-AI-18 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-05·18 보조: 기존 메뉴 consumes = 1인분 전체 레시피(서버가 채움), 임박 재료 먼저, 임박 아닌 재료의 부족도 표시 (08 v0.3.2) | UT-AI-05, UT-AI-18 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-19: 경과 묶음만 있는 재료 → 사용 가능 재고 0 → short | UT-AI-19 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-14: 같은 AI 응답을 세 기준으로 후처리하면 결과가 같다 | UT-AI-14 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-19 보조: 모델 입력은 3.10b 프롬프트를 쓰고 경과 묶음을 뺀다. 후처리는 원본 스냅샷 기준 | UT-AI-19 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-20: 두부(D-1)가 든 메뉴 2개 + 안 든 메뉴 3개 → 두부 메뉴 2개만 pushMenus, newIdeas 빈 배열, fallback=true | UT-AI-20 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-21: 임박 재료가 없으면 pushMenus 빈 배열, fallback=true (오류 아님) | UT-AI-21 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-20·21 보조: AI 실패 → 대체 결과. 대체할 메뉴도 없으면 원래 오류 코드 (08_API_SPEC 9장) | UT-AI-20, UT-AI-21 | 단위 | PASS |
| src/lib/ai/recommend.test.ts | UT-AI-21 보조: AiError가 아닌 오류(프로그램 오류)는 숨기지 않고 던진다 | UT-AI-21 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-AI-06 보조: latestUnitPrice — 가장 최근 입고 묶음의 단가, 단가 없는 묶음은 건너뜀, 같은 입고일은 나중 묶음 | UT-AI-06 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-AI-12 보조: stockValue — 사용 가능 묶음만, 단가 없으면 0원 | UT-AI-12 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-AI-06 보조: costOf — 단가를 모르는 재료는 빼고 원 단위 반올림 | UT-AI-06 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-COST-01: 레시피 원가 — 두부 1모 900원 × 1 + 양파 100g × 1.5원/g = 1,050원 | UT-COST-01 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-COST-02: 판매가 7,000원, 원가 1,050원 → 원가율 15.0% | UT-COST-02 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-COST-03: 단가 없는 묶음만 있는 재료가 있으면 원가 '알 수 없음'(null), 0으로 계산하지 않음 | UT-COST-03 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-AI-11 보조: nearestDaysLeft — 경과 묶음·기한 없는 묶음 제외, 오늘이 기한이면 0 | UT-AI-11 | 단위 | PASS |
| src/lib/stock/cost.test.ts | UT-AI-13 보조: weeklyUsage — 판매량 × 1인분 소요량의 합 | UT-AI-13 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-01: 사용자 입력이 있으면 입력값 우선, source=manual | UT-EXP-01 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-02: 입력 없음 → 입고일 + 기본 보관일수 30, source=default | UT-EXP-02 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-03: 기본 보관일수 1 → 다음 날 | UT-EXP-03 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-04: 입력 기한이 입고일보다 이르면 VALIDATION (UC-04 6a) | UT-EXP-04 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-05: 월 경계 — 10/30 + 3일 = 11/02 | UT-EXP-05 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-06: 기한 추적 제외 재료는 null, source 없음 (입력이 있어도) | UT-EXP-06 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-07: 윤년 경계 — 2028-02-27 + 2일 = 2028-02-29 | UT-EXP-07 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-08: 연 경계 — 12/30 + 5일 = 2027-01-04 | UT-EXP-08 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-09: daysLeft — 오늘 10/28, 기한 10/27 → -1 | UT-EXP-09 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-10: daysLeft — 오늘이 기한이면 0 | UT-EXP-10 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | UT-EXP-11: 계산 근거 문자열 (FR-STK-02) | UT-EXP-11 | 단위 | PASS |
| src/lib/stock/expiry.test.ts | 기한 추적 재료인데 입력도 기본 보관일수도 없으면 VALIDATION |  | 단위 | PASS |
| src/lib/stock/expiry.test.ts | 입고일과 같은 날 기한은 허용 |  | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-01: 기준일 10/31, A(11/01, 500g)·B(11/05, 500g), 필요 300g → A에서 300g | UT-FEFO-01 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-02: 같은 조건, 필요 700g → A 500g + B 200g | UT-FEFO-02 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-03: 기한 같음, 입고일 다름 → 입고일 빠른 것부터 | UT-FEFO-03 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-04: 기한 null 묶음은 마지막 | UT-FEFO-04 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-05: 사용 가능 총잔량 800g, 필요 1000g → 800g 차감 + 부족 200g | UT-FEFO-05 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-07: 여러 재료 동시 → 재료별로 독립 계획, 결과는 lot_id 오름차순 | UT-FEFO-07 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-08: 소수 수량 (0.1 + 0.2) → 부동소수 오차 없음 | UT-FEFO-08 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-09: 기준일 11/03, A(11/02 경과)·B(11/05), 필요 300g → A 제외, B에서 300g | UT-FEFO-09 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-10: 기준일 11/03, 경과 묶음 A(11/02)만 있음, 필요 300g → 차감 없음 + 부족 300g | UT-FEFO-10 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO-11: 기한이 기준일과 같은 묶음(11/03) → 차감 대상에 포함 | UT-FEFO-11 | 단위 | PASS |
| src/lib/stock/fefo.test.ts | UT-FEFO 보조: 잔량 0 묶음·없는 재료·수량 0 필요량 |  | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-01: 적정 10000, 사용 가능 3000, 미입고 0 → 7000 | UT-ORD-01 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-02: 적정 미입력, 최소 4000, 사용 가능 3000 → 적정 8000 → 5000 | UT-ORD-02 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-03: 적정 10000, 사용 가능 3000, 미입고 5000 → 2000 | UT-ORD-03 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-04: 적정 10000, 사용 가능 6000, 미입고 5000 → 0 이하라 제외(null) | UT-ORD-04 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-05: ea, 적정 10, 사용 가능 7.4 → 3 (정수 올림) | UT-ORD-05 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-06: g, 적정 5000, 사용 가능 2499.5 → 2501 | UT-ORD-06 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-07: draft·received 발주는 미입고에 넣지 않음 | UT-ORD-07 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-08: 양파 2500g, 계란 30ea, 우유 800ml | UT-ORD-08 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-09: 간장 1000ml → 1L, 소금 999g → 999g | UT-ORD-09 | 단위 | PASS |
| src/lib/stock/order.test.ts | UT-ORD-10: 빈 목록 → 빈 문자열 | UT-ORD-10 | 단위 | PASS |
| src/lib/stock/order.test.ts | 올림 전 부동소수 오차로 발주가 생기지 않음 (10 − 7.1 − 2.9 = 4.4e-16) |  | 단위 | PASS |
| src/lib/stock/order.test.ts | kg 표시는 소수 1자리 반올림 (1250g → 1.3kg) |  | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-01: 기한 11/02 → 경과 | UT-STAT-01 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-02: 기한 11/03 → 임박, D-0 | UT-STAT-02 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-03: 기한 11/06 → 임박, D-3 | UT-STAT-03 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-04: 기한 11/07 → 정상 (D-4) | UT-STAT-04 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-05: 기한 null → 판정 안 함 | UT-STAT-05 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-06: 경과 500 + 11/05 300 + null 200 → 사용 가능 500, 경과 500 | UT-STAT-06 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-07: 최소 재고 0, 사용 가능 0 → 부족 아님 | UT-STAT-07 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-08: 최소 1000, 사용 가능 999 → 부족 | UT-STAT-08 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-09: 최소 1000, 사용 가능 1000 → 부족 아님 | UT-STAT-09 | 단위 | PASS |
| src/lib/stock/status.test.ts | UT-STAT-10: 최소 1000, 총 1500 중 경과 800 → 사용 가능 700, 부족 | UT-STAT-10 | 단위 | PASS |
| src/lib/stock/status.test.ts | 잔량 합의 부동소수 오차를 소수 3자리로 정리 |  | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-01: 10 kg → 10000 g | UT-UNIT-01 | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-02: 1.5 L → 1500 ml | UT-UNIT-02 | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-03: 대파 2단, 환산 계수 1000 → 2000 g | UT-UNIT-03 | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-04: 기본 단위 ea 재료에 kg 입력 → VALIDATION | UT-UNIT-04 | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-05: 10kg 15,000원 → g당 1.5원 | UT-UNIT-05 | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-06: 등록되지 않은 환산 단위(박스) → VALIDATION, 환산 계수 입력 요청 | UT-UNIT-06 | 단위 | PASS |
| src/lib/stock/unit.test.ts | UT-UNIT-07: 1.2345 kg → 1234.5 g (소수 3자리 반올림) | UT-UNIT-07 | 단위 | PASS |
| src/lib/stock/unit.test.ts | 기본 단위 그대로 입력하면 계수 1 |  | 단위 | PASS |
| src/lib/stock/unit.test.ts | round3: 부동소수 오차 제거와 반올림 경계 |  | 단위 | PASS |
| src/lib/stock/unit.test.ts | unitPriceOf: 총액 없음·수량 0이면 null, 소수 4자리 |  | 단위 | PASS |
| src/lib/stock/waste.test.ts | IT-X03 보조: weekStart — 주 시작은 월요일 (월·화·일요일, 연말 넘김) |  | 단위 | PASS |
| src/lib/stock/waste.test.ts | IT-X03 보조: 이번 주·지난주 합계, 이번 주 일별(월~오늘, 폐기 없는 날 0원), 범위 밖·단가 없는 묶음 제외 |  | 단위 | PASS |
| src/lib/stock/waste.test.ts | IT-X03 보조: 일별 원 단위 반올림, 주 합계는 반올림한 일별 금액의 합 |  | 단위 | PASS |
| src/lib/stock/waste.test.ts | IT-X03 보조: 오늘이 월요일이면 daily는 하루, 폐기가 없으면 모두 0 |  | 단위 | PASS |
| src/lib/supabase/db.test.ts | DB-01: 사용자 B가 A 매장 재료 조회 → 0건 | DB-01 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-02: 사용자 B가 A 매장 store_id로 재료 insert → 거부 | DB-02 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-03: stock_movements update/delete → 거부 (추가만) | DB-03 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-04: 사용자 B가 A 매장 purchase_orders·purchase_order_items 조회·수정 → 0건 / 거부 | DB-04 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-05: 사용자 B가 A 매장 usage_records·ingredient_units·recommendations 조회 → 0건 | DB-05 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-06: receive_stock 묶음 2개 입고 → 묶음 2 + in 이력 2, 잔량 = 수량 | DB-06 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-07: receive_stock 다른 매장 재료 ID 포함 → 전체 롤백, NOT_FOUND | DB-07 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-08: record_usage 사용 2품목, 그중 1품목 부족 → usage_records 2건(short_qty), use 이력 ref_type=usage | DB-08 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-09: record_usage 계획 이후 잔량이 바뀜 → STOCK_CONFLICT, 전체 롤백 | DB-09 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-10: record_daily_sales 정상 마감 → 판매·차감·이력 한 트랜잭션, shortages 저장 | DB-10 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-11: record_daily_sales 두 세션에서 동시에 같은 묶음 차감 → 한쪽 STOCK_CONFLICT, 잔량 음수 없음 | DB-11 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-12: record_waste 묶음 지정 폐기 300g (잔량 500g) → 잔량 200g, waste 이력, reason 저장 | DB-12 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-13: record_waste 잔량보다 큰 폐기 → 거부(STOCK_CONFLICT), 롤백 | DB-13 | DB | PASS |
| src/lib/supabase/db.test.ts | DB 보조: apply_consumption은 private 스키마라 REST로 직접 호출 불가, 잔량 그대로 (WBS 3.4, PR #3 리뷰) |  | DB | PASS |
| src/lib/supabase/db.test.ts | DB-16: get_ingredient_stock — 사용 가능·경과 잔량, is_low, 결과가 p_today에 따라 바뀜 | DB-16 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-17: increment_ai_usage 한도 초과 → RATE_LIMITED | DB-17 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-14: remaining > quantity 또는 음수 잔량 직접 update → 거부 | DB-14 | DB | PASS |
| src/lib/supabase/db.test.ts | DB-15: target_stock < min_stock insert → 거부 | DB-15 | DB | PASS |
| src/app/(main)/sales/sales-form.test.ts | 받침 없으면 가, 있으면 이, 천 단위 구분 |  | 화면 입력 보조 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-01: 활성 메뉴 0개 → VALIDATION, AI 호출 없음 | IT-REC-01 | 통합 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-02·03: 정상 — 재료마다 status·availableQty, 없는 메뉴·미등록·부족 수가 응답과 DB에 저장 | IT-REC-02, IT-REC-03 | 통합 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-04·07: AI 형식 오류(재시도 후) → ok, fallback=true, 규칙 기반 메뉴가 DB에도 fallback으로 | IT-REC-04, IT-REC-07 | 통합 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-05: basis=cost면 스냅샷의 재료 순서가 CostFirst 결과 (두부 5,400원 → 양파 2,000원) | IT-REC-05 | 통합 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-05: basis=popularity면 최근 7일 판매(판매일 T-6~T)만 반영 — 7일 밖 판매는 순서를 바꾸지 않음 | IT-REC-05 | 통합 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-10: 추천만 받고 등록하지 않으면 메뉴·재고·이력 변화 없음 (BR-04) | IT-REC-10 | 통합 | PASS |
| src/app/api/recommendations/create.test.ts | IT-REC-06: 일일 한도 초과 → RATE_LIMITED, AI 호출 0회 | IT-REC-06 | 통합 | PASS |
| src/lib/ai/adapters/claude.test.ts | 추천은 claude-sonnet-5-5로, 45초 타임아웃 신호를 넣어 호출한다 |  | 단위 | PASS |
| src/lib/ai/adapters/claude.test.ts | UT-AI-03: 스키마 불일치는 1회 재시도하고, 다시 실패하면 AI_INVALID_OUTPUT | UT-AI-03 | 단위 | PASS |
| src/lib/ai/adapters/claude.test.ts | UT-AI-03: 재시도에서 성공하면 그 결과를 돌려준다 | UT-AI-03 | 단위 | PASS |
| src/lib/ai/adapters/claude.test.ts | UT-AI-10: SDK 오류는 AI_FAILED로 바꾸고 SDK 오류 타입을 밖으로 내보내지 않는다 | UT-AI-10 | 단위 | PASS |
| src/lib/ai/adapters/claude.test.ts | UT-AI-10: 타임아웃(AbortError)도 AI_FAILED | UT-AI-10 | 단위 | PASS |
| src/lib/ai/adapters/gemini.test.ts | 추천은 gemini-3.5-flash-lite로, 타임아웃 신호를 넣어 호출한다 |  | 단위 | PASS |
| src/lib/ai/adapters/gemini.test.ts | UT-AI-03: 스키마 불일치는 1회 재시도하고, 다시 실패하면 AI_INVALID_OUTPUT | UT-AI-03 | 단위 | PASS |
| src/lib/ai/adapters/gemini.test.ts | UT-AI-10: 무료 등급 한도 초과(429)도 AI_FAILED로 바꿔 규칙 기반 대체로 넘어가게 한다 | UT-AI-10 | 단위 | PASS |
| src/lib/ai/adapters/structured.test.ts | 이미지가 없으면 메시지를 그대로 쓴다 |  | 단위 | PASS |
| src/lib/ai/adapters/structured.test.ts | 이미지를 마지막 사용자 메시지에 붙인다 |  | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-22: 서버 스냅샷·판매량·후보 순서를 AiRequest에 보존한다 | UT-AI-22 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-22: Strategy 안내만 받아 쓰며 기준을 다시 분기하지 않는다 — 유통기한 우선: 위 후보부터 검토하세요 | UT-AI-22 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-22: Strategy 안내만 받아 쓰며 기준을 다시 분기하지 않는다 — 원가 우선: 서버가 정한 재고 금액 순서를 따르세요 | UT-AI-22 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-22: Strategy 안내만 받아 쓰며 기준을 다시 분기하지 않는다 — 인기 우선: 서버가 정한 최근 판매 순서를 따르세요 | UT-AI-22 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-23: 이름 안의 따옴표·줄바꿈·지시문은 사용자 JSON 데이터로 유지한다 | UT-AI-23 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-23: 원시 행에 붙은 매장·세션·개인정보 필드는 모델 입력에 포함하지 않는다 | UT-AI-23 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: 고정 시계·재계산·입력 변경 없이 0·null·소수와 순서를 전달한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: availableQty=NaN를 JSON null로 바꾸지 않고 거부한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: availableQty=Infinity를 JSON null로 바꾸지 않고 거부한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: availableQty=-Infinity를 JSON null로 바꾸지 않고 거부한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: 중첩 묶음의 Infinity도 JSON null로 바꾸지 않고 거부한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: 필수 키 undefined를 생략하지 않고 거부한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/prompts/recommend.test.ts | UT-AI-26: 빈 자료도 가짜 메뉴·수량으로 채우지 않고 직렬화한다 | UT-AI-26 | 단위 | PASS |
| src/lib/ai/strategies/strategies.test.ts | UT-AI-11: ExpiryFirst — 남은 일수 오름차순, 경과 묶음 제외, 기한 없음은 마지막 | UT-AI-11 | 단위 | PASS |
| src/lib/ai/strategies/strategies.test.ts | UT-AI-12: CostFirst — 양파 3kg×1.5원/g, 두부 10모×900원 → 두부(9,000원) → 양파(4,500원) | UT-AI-12 | 단위 | PASS |
| src/lib/ai/strategies/strategies.test.ts | UT-AI-13: PopularityFirst — 최근 7일 판매량 × 소요량이 큰 재료가 앞 | UT-AI-13 | 단위 | PASS |
| src/lib/ai/strategies/strategies.test.ts | UT-AI-11~13 보조: getStrategy: 기본은 유통기한 우선, 기준마다 다른 전략과 안내 문구 | UT-AI-11, UT-AI-12, UT-AI-13 | 단위 | PASS |
| src/lib/ai/strategies/strategies.test.ts | UT-AI-14 보조: 전략은 순수 함수 — 같은 입력이면 같은 결과, 스냅샷을 바꾸지 않는다 | UT-AI-14 | 단위 | PASS |
| src/lib/ai/__fixtures__/recommend.test.ts | UT-AI-24: v0.3.2 Recommendation에서 기존 메뉴는 ID와 추천 이유만 반환한다 | UT-AI-24 | 단위 | PASS |
| src/lib/ai/__fixtures__/recommend.test.ts | UT-AI-24: 추천한 메뉴의 시드 레시피가 시드 재료를 참조한다 | UT-AI-24 | 단위 | PASS |
| src/lib/ai/__fixtures__/recommend.test.ts | UT-AI-24: 신규 아이디어의 등록 ID·이름을 시드와 연결하고 미등록은 null로 둔다 | UT-AI-24 | 단위 | PASS |
| src/lib/ai/__fixtures__/recommend.test.ts | UT-AI-24: 시드 입고량 기준 오징어 100g보다 큰 200g 요청을 포함한다 | UT-AI-24 | 단위 | PASS |
| src/lib/ai/__fixtures__/recommend.test.ts | UT-AI-25: MockAdapter가 새 fixture를 반환하고 호출 간 변경이 공유되지 않는다 | UT-AI-25 | 단위 | PASS |
| src/lib/ai/__fixtures__/recommend.test.ts | UT-AI-25: 기존 장애 모의는 새 fixture에서도 AI_FAILED를 반환한다 | UT-AI-25 | 단위 | PASS |
| src/app/api/receipts/parse/route.test.ts | IT-RCP-01: AI 목 정상 → 확인용 행 목록, 확정 전 재고 변화 없음 | IT-RCP-01 | 통합 | PASS |
| src/app/api/receipts/parse/route.test.ts | IT-RCP-02: AI 목 실패 → 직접 입력 안내 | IT-RCP-02 | 통합 | PASS |
| src/app/api/receipts/parse/route.test.ts | 사진이 아니면 VALIDATION (AI 호출 없음) |  | 통합 | PASS |
