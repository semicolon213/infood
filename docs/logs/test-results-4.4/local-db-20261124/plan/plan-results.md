# 4.4 계획 ID별 결과표

대상 7b8bd6eee401b1386728c6300491b93dc29efe6d. 계획 정의 177건 / 러너 333건. 확장 9장은 제외합니다. PASS는 파일 해시·assertion 위치·실행 통과를 묶은 작성자 대조 기록에 근거하며 지정 리뷰 승인을 뜻하지 않습니다. [러너 원본](runner-results.json)

| 테스트 ID | 요구사항 | 증거 수준 | 입력·초기 상태 | 기대 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|---|
| UT-EXP-01 | FR-STK-02, BR-01 | 단위 | 사용자 입력 11/05, 입고일 11/03, 기본 보관일수 3 | 11/05, source=manual (입력값 우선) | 11/03 입고·직접 기한 11/05 입력에 expiresAt=11/05, source=manual, 직접 입력 근거 전체 객체 확인. | PASS |
| UT-EXP-02 | FR-STK-02, BR-01 | 단위 | 입력 없음, 입고일 10/28, 기본 보관일수 30 | 11/27, source=default | 10/28+30일이 11/27, source=default인 필드 단언 확인. | PASS |
| UT-EXP-03 | FR-STK-02, BR-01 | 단위 | 입력 없음, 입고일 11/03, 기본 보관일수 1 | 11/04, source=default | 11/03+보관 1일의 expiresAt=11/04 단언 확인. | PASS |
| UT-EXP-04 | FR-STK-02, BR-01 | 단위 | 입력 11/01, 입고일 11/03 (입고일보다 이름) | 오류 `VALIDATION` (UC-04 6a) | 입고보다 이른 11/01 입력에 VALIDATION·expiresAt 오류 필드 확인. | PASS |
| UT-EXP-05 | FR-STK-02, BR-01 | 단위 | 월 경계: 입고일 10/30 + 3일 | 11/02 | 10/30+3일=11/02 월 경계 단언 확인. | PASS |
| UT-EXP-06 | FR-STK-02, BR-01 | 단위 | `track_expiry = false` | null, source 없음 | trackExpiry=false이면 입력 기한이 있어도 expiresAt·source·basis 모두 null 확인. | PASS |
| UT-EXP-07 | FR-STK-02, BR-01 | 단위 | 윤년 경계: 입고일 2028-02-27 + 2일 | 2028-02-29 | 2028 윤년 2/27+2일=2/29 단언 확인. | PASS |
| UT-EXP-08 | FR-STK-02, BR-01 | 단위 | 연 경계: 입고일 12/30 + 5일 | 2027-01-04 | 2026/12/30+5일=2027/01/04 단언 확인. | PASS |
| UT-EXP-09 | FR-STK-02, BR-01 | 단위 | `daysLeft`: 오늘 10/28, 기한 10/27 | -1 | 기준 10/28에서 10/27의 daysLeft=-1 확인. | PASS |
| UT-EXP-10 | FR-STK-02, BR-01 | 단위 | `daysLeft`: 오늘 11/03, 기한 11/03 | 0 | 기준일과 같은 11/03의 daysLeft=0 확인. | PASS |
| UT-EXP-11 | FR-STK-02, BR-01 | 단위 | 계산 근거 문자열: 입고일 11/03 + 기본 5일 | "입고일 + 기본 보관일수 5일" (FR-STK-02) | 기본 보관 5일의 basis 문자열을 정확히 비교하는 단언 확인. | PASS |
| UT-FEFO-01 | FR-USE-01~03, BR-02 | 단위 | 기준일 10/31, 묶음 A(기한 11/01, 500g), B(11/05, 500g), 필요 300g | A에서 300g | 역순으로 준 A/B에서 기한 빠른 A만 300g, 부족 없음 전체 계획 비교. | PASS |
| UT-FEFO-02 | FR-USE-01~03, BR-02 | 단위 | 같은 조건, 필요 700g | A 500g + B 200g | 필요 700g에 A 500g·B 200g과 shortages 빈 배열 비교. | PASS |
| UT-FEFO-03 | FR-USE-01~03, BR-02 | 단위 | 기한 같음, 입고일 다름 | 입고일 빠른 것부터 | 같은 기한 두 묶음 중 입고 10/30인 b-early에서만 300g 확인. | PASS |
| UT-FEFO-04 | FR-USE-01~03, BR-02 | 단위 | 기한 null 묶음 포함 | null 묶음은 마지막 | null 기한 묶음보다 날짜 있는 묶음 500g 먼저 소진한 뒤 null 100g, 반환은 ID순임을 비교. | PASS |
| UT-FEFO-05 | FR-USE-01~03, BR-02 | 단위 | 사용 가능 총잔량 800g, 필요 1000g | 800g 차감 + 부족 200g | 재고 500+300에 필요 1000: 계획 합계 800·shortQty=200·requiredQty=1000 확인. | PASS |
| UT-FEFO-06 | FR-USE-01~03, BR-02 | 단위 | 같은 날 재입력: 기존 차감 A 300g 되돌림 반영 (확장 FR-USE-06) | A 잔량을 +300으로 보고 다시 계획 | 선택 판매 재입력 채택 미결정; 이번 범위에 강제 포함하지 않음 | NOT RUN |
| UT-FEFO-07 | FR-USE-01~03, BR-02 | 단위 | 여러 재료 동시 | 재료별로 독립 계획, 결과는 lot_id 오름차순 | 두 재료를 따로 계획해 두부 1+1·양파300, lot ID순 및 부족 없음 확인. | PASS |
| UT-FEFO-08 | FR-USE-01~03, BR-02 | 단위 | 소수 수량 (0.1 + 0.2) | 부동소수 오차 없음 (소수 3자리 반올림) | 같은 재료 0.1+0.2 필요량 병합 후 A0.1·B0.2를 정확히 비교. | PASS |
| UT-FEFO-09 | FR-USE-01~03, BR-02 | 단위 | 기준일 11/03, 묶음 A(기한 11/02, 500g), B(11/05, 500g), 필요 300g | A 제외, B에서 300g | 기준 11/03에서 11/02 묶음 제외, B만300g·부족 없음 전체 계획 비교. | PASS |
| UT-FEFO-10 | FR-USE-01~03, BR-02 | 단위 | 기준일 11/03, 경과 묶음 A(11/02, 500g)만 있음, 필요 300g | 차감 없음 + 부족 300g | 경과 묶음만 있으면 items 빈 배열·requiredQty=shortQty=300 확인. | PASS |
| UT-FEFO-11 | FR-USE-01~03, BR-02 | 단위 | 기준일 11/03, 기한이 기준일과 같은 묶음(11/03) | 차감 대상에 포함 | 기한이 기준일 11/03인 A에서 300g 차감 계획 확인. | PASS |
| UT-UNIT-01 | BR-03 | 단위 | 10 kg → g | 10000 | 10kg를 g로 환산한 ok=true,value=10000 확인. | PASS |
| UT-UNIT-02 | BR-03 | 단위 | 1.5 L → ml | 1500 | 1.5L를 ml로 환산한 value=1500 확인. | PASS |
| UT-UNIT-03 | BR-03 | 단위 | 대파 2 "단", `ingredient_units` 계수 1000 (g) | 2000 g | 대파 2단·계수1000으로 기본 수량2000g 확인. | PASS |
| UT-UNIT-04 | BR-03 | 단위 | 재료 단위 ea에 kg 입력 | 오류 `VALIDATION` | ea 재료에 kg 입력하면 VALIDATION·unit 오류 필드 확인. | PASS |
| UT-UNIT-05 | BR-03 | 단위 | 10kg 15,000원 → 기본 단위(g)당 단가 | 1.5 | 10kg를10000g로 바꾼 뒤 15000원/10000g=1.5 단가 확인. | PASS |
| UT-UNIT-06 | BR-03 | 단위 | 3 "박스" 입력, 해당 재료에 "박스" 환산 단위 없음 | 오류 `VALIDATION`, `fields["items.0.unit"] = "환산 계수를 입력해 주세요"` | 단위 함수의 VALIDATION·field=unit 반환은 통과. 계획의 fields[items.0.unit] Action 연결 증거는 실제 통합 재실행 필요 | BLOCKED |
| UT-UNIT-07 | BR-03 | 단위 | 1.2345 kg → g | 1234.5 (소수 3자리 반올림) | 1.2345kg를1234.5g로 환산한 소수 경계 확인. | PASS |
| UT-UNIT-08 | BR-03 | 단위 | 품목 총액 1000원 / 기본 단위 수량 3g의 단가 | 손계산 333.333333…원/g. SRS BR-03 우선 기준 333.333과 비교하고 아키텍처 4자리 값 333.3333도 관측·기록. 단가 예외는 10.2 합의 전 최종 판정 보류 | 3자리/단가 4자리 명세 합의와 이 경계 실행 필요 | BLOCKED |
| UT-STAT-01 | FR-DASH-01~03, BR-05 | 단위 | 기한 11/02 | 경과 (expired) | 기준11/03에서11/02는 status=expired,daysLeft=-1 전체 객체 비교. | PASS |
| UT-STAT-02 | FR-DASH-01~03, BR-05 | 단위 | 기한 11/03 | 임박, D-0 | 11/03 당일 기한은 soon,D-0 전체 객체 비교. | PASS |
| UT-STAT-03 | FR-DASH-01~03, BR-05 | 단위 | 기한 11/06 | 임박, D-3 | 11/06 기한은 soon,D-3 전체 객체 비교. | PASS |
| UT-STAT-04 | FR-DASH-01~03, BR-05 | 단위 | 기한 11/07 | 정상 (D-4) | 11/07 기한은 ok,D-4 전체 객체 비교. | PASS |
| UT-STAT-05 | FR-DASH-01~03, BR-05 | 단위 | 기한 null (추적 제외) | 정상, 임박·경과 판정 안 함 | null 기한은 none·daysLeft=null로 임박/경과 판정하지 않음을 확인. | PASS |
| UT-STAT-06 | FR-DASH-01~03, BR-05 | 단위 | 묶음 A(경과, 500g) + B(11/05, 300g) + C(null, 200g) | 사용 가능 재고 500g, 경과 재고 500g | 경과500+정상300+null200에서 사용가능500·경과500 각각 확인. | PASS |
| UT-STAT-07 | FR-DASH-01~03, BR-05 | 단위 | 최소 재고 0, 사용 가능 재고 0 | 부족 아님 (판정 안 함) | 최소0·가용0이면 isLow=false 확인. | PASS |
| UT-STAT-08 | FR-DASH-01~03, BR-05 | 단위 | 최소 재고 1000g, 사용 가능 재고 999g | 부족 | 최소1000·가용999이면 isLow=true 확인. | PASS |
| UT-STAT-09 | FR-DASH-01~03, BR-05 | 단위 | 최소 재고 1000g, 사용 가능 재고 1000g | 부족 아님 (같으면 부족 아님) | 최소1000·가용1000 경계에서 isLow=false 확인. | PASS |
| UT-STAT-10 | FR-DASH-01~03, BR-05 | 단위 | 최소 재고 1000g, 총잔량 1500g 중 경과 800g | 사용 가능 700g → 부족 | 총1500 중 경과800을 빼 가용700·최소1000 미만=true 확인. | PASS |
| UT-ORD-01 | FR-ORD-01~04, BR-06 | 단위 | 적정 재고 10000g, 사용 가능 3000g, 미입고 0 | 7000g | 적정10000-가용3000-미입고0=권장7000 확인. | PASS |
| UT-ORD-02 | FR-ORD-01~04, BR-06 | 단위 | 적정 재고 미입력, 최소 재고 4000g, 사용 가능 3000g | 적정 8000g 사용 → 5000g | 적정null·최소4000에서 적정8000을 적용해 권장5000 확인. | PASS |
| UT-ORD-03 | FR-ORD-01~04, BR-06 | 단위 | 적정 10000g, 사용 가능 3000g, `ordered` 발주 목록에 같은 재료 5000g | 2000g | ordered5000을 미입고로 집계해 10000-3000-5000=2000 확인. | PASS |
| UT-ORD-04 | FR-ORD-01~04, BR-06 | 단위 | 적정 10000g, 사용 가능 6000g, 미입고 5000g | 0 이하 → 초안에서 제외 | 10000-6000-5000이 음수이면 초안 제외용 null 반환 확인. | PASS |
| UT-ORD-05 | FR-ORD-01~04, BR-06 | 단위 | 단위 ea, 적정 10, 사용 가능 7.4 | 3 (정수 올림) | 10-7.4=2.6을 정수 올림3으로 확인. | PASS |
| UT-ORD-06 | FR-ORD-01~04, BR-06 | 단위 | 단위 g, 적정 5000, 사용 가능 2499.5 | 2501 (정수 올림, 소수 3자리 반올림 규칙과 별개) | 5000-2499.5=2500.5를 정수 올림2501로 확인. | PASS |
| UT-ORD-07 | FR-ORD-01~04, BR-06 | 단위 | `draft`·`received` 상태 발주 수량 | 미입고 발주량에 포함하지 않음 | draft1000·received2000을 제외하고 ordered300만 미입고 집계 확인. | PASS |
| UT-ORD-08 | FR-ORD-01~04, BR-06 | 단위 | `formatOrderText`: 양파 2500g, 계란 30ea, 우유 800ml | API 10장 기준 "양파 2.5kg", "계란 30ea", "우유 800ml" 줄바꿈 텍스트. 현 구현의 "개" 표기와 차이는 10.2에서 합의 전 최종 판정 보류 | g·ml 러너 통과, ea/개 계약 합의 대기 | BLOCKED |
| UT-ORD-09 | FR-ORD-01~04, BR-06 | 단위 | `formatOrderText`: 간장 1000ml, 소금 999g | "간장 1L", "소금 999g" (1000 이상만 kg·L) | 1000ml 간장은1L,999g 소금은999g·줄바꿈 정확히 확인. | PASS |
| UT-ORD-10 | FR-ORD-01~04, BR-06 | 단위 | `formatOrderText`: 빈 목록 | 빈 문자열 | 빈 품목 목록의 복사 문자열이 빈 문자열임을 확인. | PASS |
| UT-AI-03 | FR-REC-01~06, BR-04 | 단위 | 스키마 불일치 응답 | 1회 재시도 후 `AI_INVALID_OUTPUT` | Claude/Gemini의 스키마 실패를 SDK 목으로 두 번 발생시켜 호출2회·AI_INVALID_OUTPUT, Claude의 재시도 성공도 확인. | PASS |
| UT-AI-04 | FR-REC-01~06, BR-04 | 단위 | 추천에 없는 메뉴 ID | 해당 항목 제외, droppedCount +1 (FR-REC-04) | 활성 soup와 없는 ghost를 섞어 soup만 남기고 DB 이름·droppedCount=1 단언 확인. | PASS |
| UT-AI-05 | FR-REC-01~06, BR-04 | 단위 | 소진량 > 사용 가능 재고 | 항목 유지, 해당 재료 `status = "short"`, shortCount +1 (제거하지 않음) | 두부 가용6에 필요10을 유지한 채 short·가용6·shortCount1 확인. 기존 메뉴 전체 레시피의 부족도 별도 확인. | PASS |
| UT-AI-06 | FR-REC-01~06, BR-04 | 단위 | 신규 아이디어 원가 | AI 값 무시, 서버가 묶음 단가로 계산한 `estCost` 사용 | 양파 최근 단가2×100+두부900×2=estCost2000, 미등록 바질 제외 확인. | PASS |
| UT-AI-09 | FR-REC-01~06, BR-04 | 단위 | `AI_MOCK=1`에서 `getAiClient()` | `MockAdapter`, 같은 task면 같은 고정 응답 (Adapter) | AI_MOCK=1의 MockAdapter 반복 응답·스키마 검증, fail 모드 AiError와 잘못된 스키마 거부를 확인. 실제 공급자는 인스턴스만 생성. | PASS |
| UT-AI-10 | FR-REC-01~06, BR-04 | 단위 | `ClaudeAdapter`, SDK가 타임아웃·오류 (SDK 목) | `AI_FAILED`로 변환, SDK 오류 타입이 밖으로 나가지 않음 | Claude SDK 오류·타임아웃, Gemini 429를 SDK 목으로 주입해 AI_FAILED·SDK 오류 타입 비노출 확인. | PASS |
| UT-AI-11 | FR-REC-01~06, BR-04 | 단위 | `ExpiryFirst.rankIngredients` | 남은 일수 오름차순, 경과 묶음 제외 (Strategy) | 두부D1→우유D3→양파D10→기한없음 순서, 우유 경과분 제외 가용500·경과만 계란 제외 확인. | PASS |
| UT-AI-12 | FR-REC-01~06, BR-04 | 단위 | `CostFirst.rankIngredients`: 양파 3kg×1.5원/g, 두부 10모×900원 | 두부(9,000원) → 양파(4,500원) | 두부9000원→양파4500원 순서와 우유의 사용가능분만1500원 단언 확인. | PASS |
| UT-AI-13 | FR-REC-01~06, BR-04 | 단위 | `PopularityFirst.rankIngredients` | 최근 7일 판매량 많은 메뉴의 재료가 앞 | 최근 판매×레시피로 우유8000ml→양파500g→두부10개→소금0 순서·안내문 비교. | PASS |
| UT-AI-14 | FR-REC-01~06, BR-04 | 단위 | 같은 AI 응답을 세 기준으로 후처리 | 재고 대조·제외 결과가 기준과 상관없이 동일 | 동일 고정 출력의 expiry/cost/popularity 결과 객체를 동일 비교하고 제외1·부족1·미등록1 확인. | PASS |
| UT-AI-15 | FR-REC-01~06, BR-04 | 단위 | 재료 `ingredientId = null`, name "바질" (매장에 없음) | `status = "unregistered"`, `availableQty = null`, unregisteredCount +1 | 매장에 없는 바질을 null ID·null 단위/가용량·unregistered로 유지하고 건수1 확인. | PASS |
| UT-AI-16 | FR-REC-01~06, BR-04 | 단위 | 다른 매장 재료 ID, name " 양 파 " (매장에 "양파" 있음) | 이름 정규화(공백 제거·소문자)로 매장 "양파"에 연결, status는 재고로 판정 | 다른 매장 ID와 공백 있는 양파 이름이 자기 매장 양파ID·가용1500·have로 연결되는지 확인. | PASS |
| UT-AI-17 | FR-REC-01~06, BR-04 | 단위 | `ingredientId = null`, name "Tofu" / 매장 "tofu" | 대소문자 무시로 연결 | null ID의 대소문자/공백 다른 TOFU milk 이름이 자기 매장 우유ID·have로 연결됨을 확인. | PASS |
| UT-AI-18 | FR-REC-01~06, BR-04 | 단위 | 소진량 ≤ 사용 가능 재고 | `status = "have"`, `availableQty`는 AI 값이 아닌 DB 값 | DB 레시피 두부1에 가용6이 have·shortCount0이며 consumes가 전체 레시피인 추가 단언 확인. | PASS |
| UT-AI-19 | FR-REC-01~06, BR-04 | 단위 | 같은 재료가 경과 묶음만 보유 | 사용 가능 재고 0 → `short` | 경과 계란 가용0을 short로 반환하고 모델 입력의 경과 lots는 빈 배열인 반면 후처리는 원본을 쓰는 단언 확인. | PASS |
| UT-AI-20 | FR-REC-01~06, BR-04 | 단위 | 규칙 기반 대체 추천: 임박 재료 두부(D-1)가 든 메뉴 2개, 안 든 메뉴 3개 | 두부 메뉴 2개만 pushMenus, newIdeas 빈 배열, `fallback = true` (UC-08 3a) | 5메뉴 중 두부 임박 포함 2메뉴만 이름순 반환·fallback=true·newIdeas 빈 배열, 전체 consumes 확인. | PASS |
| UT-AI-21 | FR-REC-01~06, BR-04 | 단위 | 대체 후보 생성 순수 함수: 임박 재료 없음 | 후보 pushMenus 빈 배열. 함수 내부의 빈 후보 결과만 검증하며 HTTP 성공을 의미하지 않음. Route Handler는 이 결과와 원래 AI 오류를 받아 IT-REC-11대로 오류 반환 | 임박 없는 기준일의 순수 fallback 함수가 빈 후보를 반환함을 확인. API 성공 주장 없이 별도 실패 전달 단언과 구분. | PASS |
| UT-AI-22 | FR-REC-01~06, BR-04 | 단위 | 3.10b 프롬프트 요청에 서버 스냅샷·최근 판매·Strategy 후보와 안내 전달 | 기존 AiRequest·Recommendation 사용, 입력 순서와 Strategy 안내 보존, 기준 재계산·분기 없음 | AiRequest task/schema/user JSON·전체 snapshot·후보순서·판매량과 Strategy 안내 포함을 비교. each 3개 안내도 비교. | PASS |
| UT-AI-23 | FR-REC-01~06, BR-04 | 단위 | 3.10b 재료/메뉴 이름의 따옴표·줄바꿈·지시문, 원시 행의 세션·매장 등 추가 필드 | 이름·근거는 파싱 가능한 사용자 JSON 데이터에만 포함, 추가 필드는 허용 목록에서 제외. 실제 모델의 지시 준수 검증은 별도 | 이름/이유의 지시문은 user JSON에 보존하고 system에는 넣지 않음. 매장·세션·추가 점수 필드는 allowlist 대조로 제외. | PASS |
| UT-AI-24 | FR-REC-01~06, BR-04 | 단위 | 3.10b recommend.json을 v0.3.2 출력 스키마 및 시드 재료·메뉴·레시피 참조와 대조 | 기존 메뉴는 menuId·reason만 반환, 시드 메뉴와 레시피의 재료 참조 일치, 미등록 바질 null, 오징어 입고량 기준 부족 예제. 서버의 consumes 구성과 재고 대조는 4.2에서 검증 | v0.3.2 스키마와 정확한 키, 시드 메뉴/레시피 ID·단위·등록명, null 바질, 오징어 요청량>시드100을 각 단언으로 대조. | PASS |
| UT-AI-25 | FR-REC-01~06, BR-04 | 단위 | 3.10b 새 fixture를 기존 MockAdapter로 반복 호출·결과 수정·장애 모의 | 스키마에 맞는 동일 응답의 독립 복사, 변경 공유 없음, fail 모드는 AI_FAILED | MockAdapter 첫 응답 수정 뒤 다음 응답이 원본 fixture와 같음·fail 모드 AI_FAILED 확인. | PASS |
| UT-AI-26 | FR-REC-01~06, BR-04 | 단위 | 3.10b 프롬프트의 고정 today·0·null·소수·빈 자료·동결 배열 및 NaN/Infinity/undefined | 정상값·순서·원본 보존, 비유한 수치·undefined는 TypeError로 거부. 수량·기한 재계산 없음. 활성 메뉴 0개 API 거부는 4.2에서 검증 | 고정today·0·null·소수·동결 입력 불변, NaN/Infinity/undefined TypeError, 빈 자료의 정확한 JSON을 각 단언으로 확인. | PASS |
| DB-01 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | A 매장에 재료 생성 → A 세션으로 생성 ID 조회(양성 대조) → B 세션으로 같은 ID 조회 | A는 정확히 1건·입력값 확인, B는 0건. 모두가 차단돼 0건인 상태를 통과시키지 않음 | 11/24 실행 PASS지만 테스트가 B 조회 0건만 단언. A 양성 대조 없음(계획 10.3) → 테스트 보완 필요 | BLOCKED |
| DB-02 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 사용자 B가 A 매장 store_id로 재료 insert | 거부 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. B 세션 insert가 RLS 42501로 거부됨을 단언. | PASS |
| DB-03 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | `stock_movements` update/delete | 거부 (추가만) | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 본인 매장 이력 update·delete가 0행이고 delta 100이 그대로 남음을 단언(추가만 허용). | PASS |
| DB-04 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 사용자 B가 A 매장 `purchase_orders`·`purchase_order_items` 조회·수정 | 0건 / 거부 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. B의 purchase_orders·items 조회 0건, update 0행, save_order RPC FORBIDDEN, A 원본(memo·qty) 유지 단언. | PASS |
| DB-05 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 사용자 B가 A 매장 `usage_records`·`ingredient_units`·`recommendations` 조회 | 0건 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 세 테이블 각각 A 양성 대조(>0건)와 B 0건을 같은 데이터로 단언. | PASS |
| DB-06 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 묶음 2개 입고 | 묶음 2 + `in` 이력 2, 잔량 = 수량 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 반환 묶음 2, quantity=remaining(200·300), in 이력 2건(delta 200·300) 단언. | PASS |
| DB-07 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 다른 매장 재료 ID 포함 | 전체 롤백, `NOT_FOUND` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 타 매장 재료 포함 시 NOT_FOUND, 정상 품목의 묶음·이력도 0건(전체 롤백) 단언. | PASS |
| DB-08 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 사용 2품목, 그중 1품목 부족 | `usage_records` 2건(부족분 `short_qty` 기록), `use` 이동 이력, ref_type=usage | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. usage_records 2건(부족 품목 short_qty 50), use 이력 1건 ref_type=usage·ref_id=기록 ID, 잔량 400 단언. | PASS |
| DB-09 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 4.1의 2재료 P/Q(각 500g), 계획 P 100g·Q 300g. 다른 세션이 Q 250g 폐기한 뒤 오래된 계획 제출(P 먼저 처리) | `STOCK_CONFLICT`. P=500g, Q=250g, 이 호출의 `usage_records`·`use` 이력 0건. 다른 세션의 폐기만 보존. 앞 품목 차감·이력도 전부 롤백 | 11/24 실행 PASS지만 단일 재료(버섯)·단일 묶음 검사. 4.1의 P/Q 2품목·선행 P 차감 롤백 미검증(계획 10.3) → 테스트 보완 필요 | BLOCKED |
| DB-10 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 정상 마감 | 판매·차감·이력이 한 트랜잭션, `sales_days.shortages` 저장 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. sales_days.shortages·sales 저장, use 이력 ref_type=sales·ref_id=마감 ID, 잔량 0 단언. 롤백 원자성은 IT-USE-05 재충돌 변형이 보완. | PASS |
| DB-11 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 4.1의 2재료 P/Q(각 500g)에 두 세션이 서로 다른 미마감 날짜로 같은 계획 P 100g·Q 300g 제출(P 먼저 처리) | 성공 1·`STOCK_CONFLICT` 1, P=400g·Q=200g. 성공한 마감·판매만 1세트, 이력 P −100g·Q −300g만 존재. 실패한 쪽의 선행 P 차감·판매·이력 전부 롤백, 음수 없음 | 11/24 실행 PASS지만 단일 묶음 동시 차감 검사. 4.1의 P/Q 2품목·실패 쪽 선행 P 롤백(P=400 확인) 미검증(계획 10.3) → 테스트 보완 필요 | BLOCKED |
| DB-12 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 묶음 지정 폐기 300g (잔량 500g) | 잔량 200g, `waste` 이력, reason 저장 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 잔량 200, waste 이력 delta −300·reason expired·memo 저장 단언. | PASS |
| DB-13 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 단일 묶음 500g 확인 후 다른 세션이 250g 폐기, 원래 요청이 300g 폐기 제출 | `STOCK_CONFLICT`, 잔량 250g 및 선행 폐기 이력만 보존, 실패 요청의 이력 없음. 단일 묶음 거부 검사이며 다품목 원자성 증거는 DB-09·11로 별도 확보 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 다른 기기 250g 폐기 커밋 후 300g 요청 → STOCK_CONFLICT, 잔량 250, waste 이력 1건(선행분만) 단언(usage.test 보조). RPC 직접 600>500 거부·이력 0건도 확인. 단일 묶음 범위. | PASS |
| DB-14 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | `remaining > quantity` 또는 음수 잔량 직접 update | 거부 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. remaining 31(>30)·−1 update 모두 23514 거부, 잔량 30 유지 단언. | PASS |
| DB-15 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | `target_stock < min_stock` insert | 거부 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. target 1000 < min 5000 insert가 23514로 거부됨을 단언. | PASS |
| DB-16 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 시드 데이터, `p_today = 11/03` | 사용 가능·경과 잔량, `is_low`가 UT-STAT 계산과 일치. 함수 안에서 `now()`를 쓰지 않음(다른 `p_today`로 결과가 바뀜) | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. p_today 11/03: 사용 가능 50·경과 80·is_low true(50<100), 11/01: 사용 가능 130·is_low false로 결과가 p_today에 따라 바뀜, 타 매장 0건 단언. 시드 대신 테스트별 fixture(계획 2.3-4). | PASS |
| DB-17 | NFR-02, NFR-07, NFR-09, DR-01~03 | DB | 한도 초과 | `RATE_LIMITED` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 한도 2에서 1·2 다음 RATE_LIMITED, 타 매장 FORBIDDEN 단언. | PASS |
| IT-AUTH-01 | FR-AUTH-01 | 통합 | 모든 Action: 미로그인 호출 | `UNAUTHORIZED` | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-AUTH-02 | FR-AUTH-02 | 통합 | 매장 생성: 첫 로그인 후 매장 이름 입력 | 매장 생성, 이후 Action에서 `NO_STORE` 없음 | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-AUTH-03 | FR-AUTH-03 | 통합 | 모든 Action: 요청 본문에 다른 매장 `storeId` 포함 | 무시하고 세션 매장 기준 처리 | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-ING-01 | FR-ING-01 | 통합 | `createIngredient`: 같은 이름 중복 | `CONFLICT` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 두 번째 같은 이름 등록이 CONFLICT(fields.name) 단언. | PASS |
| IT-ING-02 | FR-ING-01 | 통합 | `createIngredient`: `trackExpiry=true`, 기본 보관일수 없음 | `VALIDATION` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 기본 보관일수 없을 때 VALIDATION, fields.defaultShelfDays 단언. | PASS |
| IT-ING-03 | FR-ING-01 | 통합 | `createIngredient`: `targetStock < minStock` | `VALIDATION` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. target 5 < min 10 → VALIDATION, fields.targetStock 단언. | PASS |
| IT-ING-04 | FR-ING-05 | 통합 | `updateIngredient`: 환산 단위 `{unitName:"단", factor:1000}` 추가 | `ingredient_units` 저장, 입고 시 사용 가능 | 11/24 실행 PASS지만 환산 단위 저장·조회만 단언. '입고 시 사용 가능'은 이 ID 테스트에 없음(receive.test 보조는 생성 시 단위로만 확인) → 테스트 보완 필요 | BLOCKED |
| IT-ING-05 | FR-ING-01 | 통합 | `deactivateIngredient`: 잔량(경과 포함) > 0 | `CONFLICT` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 경과 묶음만 500ml 남은 재료 비활성화가 CONFLICT 단언. | PASS |
| IT-ING-06 | FR-ING-02 | 통합 | `getIngredient`: 묶음 3개 | 입고일·기한·잔량·단가가 DB와 일치하고 유통기한 순 (null 마지막) | 11/24 실행 PASS지만 정렬·잔량만 단언. 입고일·단가의 DB 일치 미검증(fixture 단가 모두 null) → 테스트 보완 필요 | BLOCKED |
| IT-ING-07 | FR-ING-03 | 통합 | `getIngredients`: `status: "soon" / "expired" / "low"`, 이름 검색 | 각 조건에 맞는 재료만 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. soon·expired·low 필터가 해당 재료만, 이름 검색(대소문자 무시) 결과 단언. | PASS |
| IT-ING-08 | FR-ING-01, FR-ING-05 | 통합 | 재료 등록·수정·비활성화: 재고 없는 재료 정상 등록 → 이름·보관일수 수정 → 재조회 → 비활성화 | 입력값·수정값 저장, 환산 단위 보존, 활성 목록에서 제외 | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-MENU-01 | FR-MENU-01, FR-MENU-02 | 통합 | `saveMenu`: 이름·판매가·레시피 2개 | 메뉴 + `recipe_items` 저장 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 저장 후 재조회로 이름·가격·활성과 레시피 2건(200, 50.5) 단언. | PASS |
| IT-MENU-02 | FR-MENU-02 | 통합 | `saveMenu`: 소요량 0 | `VALIDATION` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 소요량 0 → VALIDATION, fields[recipe.0.qty] 단언. | PASS |
| IT-MENU-03 | FR-MENU-01 | 통합 | `deactivateMenu`: 비활성화 | 판매 마감·추천 대상에서 빠짐 | 11/24 실행 PASS지만 isActive=false만 단언. 판매 마감·추천 스냅샷 제외 미검증(계획 10.3) → 테스트 보완 필요 | BLOCKED |
| IT-MENU-04 | FR-MENU-01, FR-MENU-02 | 통합 | `saveMenu` 수정: 기존 메뉴 ID로 이름·가격·레시피 변경, 비활성 메뉴도 수정 | ID 유지, 재조회·새로고침에 수정값 반영, 레시피는 통째 교체, 기존 비활성 상태 유지 | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-STK-01 | FR-STK-01, FR-STK-02, FR-STK-04 | 통합 | `receiveStock`: 3품목, 하나는 유통기한 입력·둘은 비움 | 묶음 3, 비운 품목은 BR-01 계산값과 근거 문자열 반환 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 묶음 3, 비운 양파는 입고일+3일·default·근거 문자열, 직접 입력 우유는 manual, 추적 제외 소금은 null, DB 행·in 이력 3건 단언. | PASS |
| IT-STK-02 | FR-STK-01, FR-STK-03 | 통합 | `receiveStock`: 2kg, 15,000원 (재료 단위 g) | 잔량 2000g, `unit_price` 7.5 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 2kg·15,000원 → quantity·remaining 2000, unit_price 7.5 단언. | PASS |
| IT-STK-03 | FR-STK-03 | 통합 | `receiveStock`: 환산 단위 없는 "박스" | `VALIDATION`, `fields["items.N.unit"]` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 환산 없는 박스 → VALIDATION fields[items.1.unit], 앞 품목 포함 묶음·이력 변화 없음 단언. | PASS |
| IT-STK-04 | FR-STK-01 | 통합 | `receiveStock`: 수량 0 또는 유통기한 < 입고일 | `VALIDATION`, 해당 행 표시 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 수량 0 → fields[items.0.qty], 기한<입고일 → fields[items.1.expiresAt], 묶음·이력 변화 없음 단언. | PASS |
| IT-USE-01 | FR-USE-01, FR-USE-02, FR-USE-05 | 통합 | `recordDailySales`: 재고 부족 | 가능한 만큼 차감 + `shortages` 반환 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 12개(1200g) → 사용 가능 1000g만 차감(X 500 유지), shortages 200 응답·재조회 저장 단언. | PASS |
| IT-USE-02 | FR-USE-01 | 통합 | `recordDailySales`: 미래 날짜 | `VALIDATION` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. T+1 → VALIDATION fields.soldOn, 마감 0·잔량 유지 단언. | PASS |
| IT-USE-03 | FR-USE-01, FR-USE-06 | 통합 | `recordDailySales`: 이미 마감한 날짜 다시 저장 (FR-USE-06 미구현 상태) | `CONFLICT` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 같은 날 재저장 CONFLICT, 잔량·마감·이력 추가 없음 단언. | PASS |
| IT-USE-04 | FR-USE-02, FR-USE-05 | 통합 | `recordDailySales`: 경과 묶음만 남은 재료 | 차감 없음, 부족으로 기록 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 경과 묶음만 → consumed 빈 배열, shortQty 300, 잔량·use 이력 변화 없음, 재조회 부족 저장 단언. | PASS |
| IT-USE-05 | FR-USE-02, FR-USE-05, NFR-07 | 통합 | `recordDailySales`: 실제 Supabase의 4.1 다품목 충돌·재계획 및 재충돌 변형 | 1회 충돌 뒤 최신 계획으로 1회 재시도·부족 Q 50g 저장, 마감·판매·이력 중복 없음. 재충돌 변형은 2회 시도 후 `STOCK_CONFLICT`·전부 롤백 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 실DB에서 경쟁 폐기 커밋: RPC 2회, Q 부족 50, P=400·Q=0, 마감·판매 1건, use 2건. 재충돌 변형은 2회 후 STOCK_CONFLICT, P=500·Q=150, 마감·판매·use 0건, waste 2건 단언(계획 4.1). | PASS |
| IT-USE-06 | FR-USE-03 | 통합 | `recordUsage`: 직원 식사 2품목, 메모 | FEFO 차감, `usage_records` 저장 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 2품목(0.7kg 환산 포함) FEFO 차감 A 0·B 300·계란 26, usage_records 2건 메모 저장, use 이력 3건 단언. | PASS |
| IT-USE-07 | FR-USE-03, FR-USE-05 | 통합 | `recordUsage`: 사용량 > 사용 가능 재고 | 차감 + `shortages` 반환, `short_qty` 저장 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 1000g 요청·사용 가능 800g → 부족 200 반환, 경과 X 유지, short_qty 200 저장 단언. | PASS |
| IT-USE-08 | FR-USE-04 | 통합 | `recordWaste`: 경과 묶음 전량 폐기, reason=expired | 잔량 0, 대시보드 경과 목록에서 사라짐 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 경과 X 500g 폐기 → remaining 0, waste 이력 reason expired 단언. 경과 목록 제외는 getDashboard와 같은 조건(remaining>0·expires_at<T, dashboard.ts)으로 DB 재조회해 0건 확인; getDashboard 직접 호출은 아님. | PASS |
| IT-USE-09 | FR-USE-04 | 통합 | `recordWaste`: 폐기량 > 현재 잔량 (입력 실수) | `VALIDATION`, `fields.qty`, RPC 호출 없음 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 301>300 → VALIDATION fields.qty, record_waste 호출 0회, 잔량 유지 단언. | PASS |
| IT-USE-10 | FR-USE-03, FR-USE-05, NFR-07 | 통합 | `recordUsage`: 실제 Supabase의 4.1 다품목 충돌·재계획 및 재충돌 변형. 사용 P 100g·Q 300g, 메모 입력 | 1회 충돌 뒤 최신 계획으로 1회 재시도·부족 Q 50g 저장, 사용 기록·메모·이력 1세트. 재충돌 변형은 시도 2회 후 `STOCK_CONFLICT`, 실패 시도 기록·차감 0건 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 실DB 경쟁 폐기: RPC 2회, Q 부족 50, P=400·Q=0, 사용 기록 2건·메모, use 2건. 재충돌 변형 2회 후 STOCK_CONFLICT, P=500·Q=150, 기록·use 0건, waste 2건 단언(계획 4.1). | PASS |
| IT-DASH-01 | FR-DASH-01, FR-DASH-02 | 통합 | `getDashboard`: 서버 `todayKST()`=T를 기록하고 2.3의 상대 날짜 X(T−1)·A(T+1)·B(T+3)·C(T+4) 묶음 준비. 별도 재료 D의 T 당일 기한 묶음도 준비 | `today=T`, 임박은 D(D-0)·A(D-1)·B(D-3) 기한 순, 경과는 X 별도, C는 두 목록에서 제외. 실행 중 KST 날짜가 바뀌면 데이터를 새 T로 재준비 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. today=T, 임박 D(D-0)·A(D-1)·B(D-3) 순서, 경과 X 별도, C 제외 단언. | PASS |
| IT-DASH-02 | FR-DASH-03 | 통합 | `getDashboard`: 서버 T에 맞춘 2.3 양파 X/A/B/C, 최소 1200g·적정 2000g. 과거 11/03 고정 시드로 대체하지 않음 | `lowStock`에 양파 사용 가능 1000g·최소 1200g 표시, 총잔량 1500g으로 부족을 누락하지 않음 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 총잔량 1500g이어도 lowStock에 양파 사용 가능 1000·최소 1200 단언. | PASS |
| IT-DASH-03 | FR-DASH-04 | 통합 | 대시보드 화면 통합: 정상 조회 후 추천·발주 바로가기 선택 | `/recommend`·`/orders` 화면으로 이동 (Dashboard DTO에 경로 필드를 요구하지 않음) | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-DASH-04 | FR-DASH-01, FR-DASH-02, FR-DASH-03 | 통합 | `getDashboard`: 묶음·부족 재료가 없는 매장 | 각 목록 빈 배열, 화면은 빈 상태와 입고 경로 제공; 조회 실패와 구분 | 11/24 실행 PASS: 빈 배열과 조회 실패 예외 구분은 확인. 화면 빈 상태·입고 경로는 브라우저 증거 없음 | BLOCKED |
| IT-REC-01 | FR-REC-01 | 통합 | `POST /api/recommendations`: 메뉴 0개 | `VALIDATION` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 활성 메뉴 0개 → VALIDATION, AI 호출 0회 단언. createRecommendation(라우트 본체) 직접 호출이며 HTTP 래퍼는 미경유. | PASS |
| IT-REC-02 | FR-REC-01, FR-REC-02, FR-REC-03, FR-REC-06, FR-REC-08 | 통합 | `POST /api/recommendations`: AI 목 정상, `basis` 생략 | `basis = "expiry"`, 재료마다 status·availableQty, DB 저장 | 11/24 실행 PASS지만 테스트가 basis를 'expiry'로 명시 전달. basis 생략 시 기본값(route.ts RecommendRequest) 경로 미검증 → 테스트 보완 필요 | BLOCKED |
| IT-REC-03 | FR-REC-03, FR-REC-04, FR-REC-08 | 통합 | `POST /api/recommendations`: AI 목 응답에 없는 메뉴 1개·미등록 재료 1개·부족 재료 1개 | droppedCount 1, unregisteredCount 1, shortCount 1이 응답과 `recommendations`에 저장 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 없는 메뉴·미등록 바질·부족 두부 → dropped·unregistered·short 각 1이 응답과 recommendations 행에 저장됨 단언. | PASS |
| IT-REC-04 | FR-REC-01, FR-REC-04, NFR-08 | 통합 | `POST /api/recommendations`: AI 목이 2회 연속 형식 오류, 대체 가능한 활성 메뉴 있음 | `ok: true`, `data.fallback: true`, 규칙 기반 pushMenus, `recommendations.fallback = true` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. AI가 재시도 후 AI_INVALID_OUTPUT → ok, fallback true, 규칙 기반 pushMenus=활성 메뉴, DB fallback true 단언. 2회 재시도 자체는 어댑터 범위. | PASS |
| IT-REC-05 | FR-REC-06 | 통합 | `POST /api/recommendations`: `basis: "cost"`, `"popularity"` | 입력 스냅샷의 재료 순서가 각 Strategy 결과와 같음 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. cost: 스냅샷 순서 두부(5,400)→양파(2,000), popularity: 7일 내 판매만 반영해 양파→두부 단언. | PASS |
| IT-REC-06 | NFR-12 | 통합 | `POST /api/recommendations`: 일일 한도 초과 | `RATE_LIMITED`, AI 호출 0회 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 한도 1에서 두 번째 RATE_LIMITED, AI 호출 1회(초과 호출 0회) 단언. | PASS |
| IT-REC-07 | FR-REC-05 | 통합 | 응답: 정상 / 대체 | 정상은 `fallback=false`(화면 "AI 추천"), 대체는 `fallback=true`(화면 "규칙 기반") | 11/24 실행 PASS: 대체 fallback=true만 이 ID 테스트에서 단언. 정상 fallback=false는 IT-REC-02·03 테스트에만 있고 화면 'AI 추천'/'규칙 기반' 표시는 미검증 | BLOCKED |
| IT-REC-08 | FR-REC-07 | 통합 | `acceptRecommendation`: 사용자가 이름·가격·재료 수량을 고쳐 등록 | 고친 값으로 `is_special` 메뉴 + 레시피, `accepted = true` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 고친 이름·가격·두부 2로 is_special 메뉴·레시피 저장, accepted true 단언. | PASS |
| IT-REC-09 | FR-REC-07, BR-04 | 통합 | `acceptRecommendation`: `unregistered` 재료가 남은 아이디어 | `VALIDATION` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 매장 재료가 아닌 재료(미등록 대체 ID)가 남으면 VALIDATION, 메뉴 0건 단언. null ID는 계약에서 막힘. | PASS |
| IT-REC-10 | BR-04 | 통합 | 추천 후: 추천만 받고 등록 안 함 | 메뉴·재고 변화 없음 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 추천 생성 전후 메뉴·레시피·묶음 잔량·이력 수가 동일함을 단언. | PASS |
| IT-REC-11 | FR-REC-04, NFR-08 | 통합 | `POST /api/recommendations`: 활성 메뉴는 있으나 임박 재료 메뉴는 없음. AI 목이 호출 실패 / 재시도 후 형식 오류인 두 변형 | API 9장 기준 `ok:false`, HTTP 502, 각각 원래 `AI_FAILED` / `AI_INVALID_OUTPUT`. 빈 fallback 성공으로 바꾸지 않음. 실패 안내·재시도·재료/메뉴 이동 제공. 활성 메뉴 0개의 사전 `VALIDATION`은 IT-REC-01로 구분 | 11/24 로컬 DB 실행에도 이 ID의 테스트가 없음 → 통합 테스트 작성 필요 | BLOCKED |
| IT-ORD-01 | FR-ORD-01 | 통합 | `getOrderDraft`: 부족 재료 3개, 그중 1개는 미입고 발주로 충분 | 2개만, `suggestedQty`는 UT-ORD 계산과 일치 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 부족 3개 중 미입고 발주로 충분한 대파 제외, 두부 13·양파 600(UT-ORD 계산) 2건만 단언. | PASS |
| IT-ORD-02 | FR-ORD-02, FR-ORD-03 | 통합 | `saveOrder`: 초안에서 1개 삭제·1개 추가·수량 수정 | 수정한 그대로 `draft` 저장, 수량 0 품목은 제외 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 삭제·추가·수정 결과 그대로 draft 저장, 수량 0 제외, 날짜·메모 저장 단언. | PASS |
| IT-ORD-03 | FR-ORD-03, FR-ORD-05 | 통합 | `saveOrder`: `ordered` 상태 목록 수정 | `CONFLICT` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. ordered 수정 CONFLICT, 품목 유지 단언. | PASS |
| IT-ORD-04 | FR-ORD-03, FR-ORD-05 | 통합 | `setOrderStatus`: draft→ordered, ordered→draft, ordered→received | 모두 성공, `ordered_at`·`received_at` 기록 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 세 전이 모두 성공, ordered_at·received_at 기록 단언. | PASS |
| IT-ORD-05 | FR-ORD-05 | 통합 | `setOrderStatus`: draft→received, received→draft, received→ordered | `CONFLICT` | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. draft→received, received→draft·ordered CONFLICT와 상태 유지 단언. | PASS |
| IT-ORD-06 | FR-ORD-05 | 통합 | `deleteOrder`: `ordered` 상태 삭제 | `CONFLICT` (draft만 삭제 가능) | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. ordered 삭제 CONFLICT·행 유지, draft 삭제는 품목까지 제거 단언. | PASS |
| IT-ORD-07 | FR-ORD-03 | 통합 | `getOrders` / `getOrder`: 같은 날 목록 2개, 기간 조회 | 날짜별로 둘 다 조회 | 11/24 로컬 Supabase(0000~0006) CI=1 실행 PASS. 같은 날 2개 모두 조회·날짜 내림차순, 기간 필터 단언. | PASS |
| IT-ORD-08 | FR-ORD-04 | 통합 | `getOrder` + `formatOrderText`: 저장된 목록 | 복사 텍스트가 UT-ORD-08 형식 | 11/24 실행 PASS: getOrder→formatOrderText g·ml 형식 확인. ea 표기는 UT-ORD-08 합의(10.2) 대기라 제외됨 | BLOCKED |
| IT-ORD-09 | FR-ORD-01 | 통합 | `getOrderDraft`: 부족 재료 없음 | 빈 items (화면은 "부족한 재료가 없어요") | 11/24 실행 PASS: 빈 items 확인. 화면 문구 '부족한 재료가 없어요'는 브라우저 증거 없음 | BLOCKED |
| IT-STK-05 | FR-STK-05 | 통합 | 입고 화면 불러오기: `ordered` 목록을 불러와 입고 | 품목·수량이 미리 채워짐 (P1) | 선택 발주 불러오기 채택 미결정 | NOT RUN |
| E2E-01 | UC-01 | 전체 E2E | 첫 사용자: 로그인 → 매장 생성 → 빈 대시보드 | 빈 상태 문구와 [입고하기] 버튼 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-02 | UC-02, UC-03 | 전체 E2E | 재료 등록(적정 재고·환산 단위 "단") → 메뉴·레시피 등록 | 재료 목록·메뉴 상세에 표시 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-03 | UC-04, UC-05, UC-07, FR-USE-05 | 전체 E2E | 입고 3품목(하나는 "단" 단위, 하나는 유통기한 비움) → 양파 사용 가능 1000g·메뉴 100g/인분의 12개 판매로 부족을 만드는 마감 → 대시보드 | 계산된 기한·근거, 양파 차감 1000g·부족 200g. 마감 저장 직후 결과 화면에서 양파·부족 200g 경고가 보이고 포커스/스크롤로 인지 가능하며 고정 바에 가리지 않음. 새로고침해 마감 부족 기록 유지, 대시보드 부족도 표시 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-04 | UC-06, UC-07 | 전체 E2E | 사용 기록(직원 식사) → 대시보드 경과 묶음 [폐기 처리] | 잔량 감소, 경과 목록에서 사라짐 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-05 | UC-08 | 전체 E2E | 추천: 기준 "원가 우선" 선택 → 추천 받기(AI 목) → 결과 검토. FR-REC-07 채택 시에만 특선 수정·등록 추가 | P0: 보유/부족/미등록·"AI 추천"·재고 대조 안내, DB 검증 기록, 임의 재고 변경 없음. P1 채택 시: 수정한 특선이 메뉴 목록에 표시 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-06 | UC-08 3a, NFR-08 | 전체 E2E | 추천 실패 경로: AI 목 실패 | "추천을 만들지 못했어요" 안내 + 규칙 기반 메뉴, 막다른 화면 없음 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-07 | UC-09 | 전체 E2E | 발주: 초안 확인 → 수량 수정 → 저장 → 복사 → 발주완료 → 입고완료 | 클립보드 텍스트 형식, 상태 변화 | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| E2E-08 | NFR-09 | 전체 E2E | 다른 계정 격리: 계정 B로 로그인해 A 매장 재료 URL 직접 접근 | A 데이터 보이지 않음 (404 또는 빈 화면) | 실제 Supabase 브라우저 환경 미준비; UI 입력 보조 통과를 전체 E2E로 집계하지 않음 | BLOCKED |
| UI-REG-01 | FR-MENU-01~02, 디자인 3.6 | 화면 회귀 | 메뉴 이름·가격·레시피 3행을 비워 제출 → 한 행 재료만 선택 → 다른 행 삭제 | 수정 필드 오류만 해제, 나머지 오류 유지·인덱스 재연결; 첫 오류는 DOM상 첫 입력에 포커스, aria 오류 연결 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-02 | FR-MENU-01~02, NFR-01, 아키텍처 10장 | 화면 회귀 | 가격 `1e3`·3000000000, 소요량 0.0015·0.0004, 경계 0원·0.001·소수 3자리 입력 | 화면이 잘못된 입력을 설명하고 입력 보존; 조용한 반올림·부분 저장 여부를 DB 재조회로 확인. 정밀도·금액 상한의 API 거부 기준은 10.2 합의 후 확정; 그 전에는 계약 검증을 통과 처리하지 않음 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-03 | FR-AUTH-01, 디자인 3.6 | 화면 회귀 | 메뉴 작성·상세 동작 중 세션 만료 → 저장/비활성화 (`UNAUTHORIZED` 응답 및 proxy 로그인 리다이렉트 각각) | 원인·로그인 경로 표시, 작성 내용 보존, 복구 후 재시도 가능; 원인 없는 재시도 반복 없음 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-04 | FR-USE-04, UC-06 | 화면 회귀 | 폐기 양파·수량 10·사유 변질·메모 입력 → 경과하지 않은 5000g 묶음을 직접 선택 → 다른 재료 선택 | 직접 묶음 선택은 10·변질·메모 유지; 재료 변경은 메모·사유 유지, 단위가 달라지는 수량·묶음은 초기화. 잔량 전체로 임의 변경 없음 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-05 | FR-DASH-02, FR-USE-04 | 화면 회귀 | 대시보드의 경과 X(T−1) 묶음 링크 / 재료 상세의 비경과 A(T+1) 묶음 링크 / 없는·잘못된 ID 링크로 각각 진입. 실제 URL과 반환 묶음 기한 기록 | X는 잔량 전체·기한 경과 사유 자동 입력, A는 묶음만 지정·전체 수량 자동 입력 없음, 잘못된 ID는 오류·복귀 수단. 재료 상세에서 같은 경과 X를 여는 정책·출처 구분 파라미터는 10.2 합의 후 별도 판정하며 임의 URL 계약을 만들지 않음 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-06 | FR-USE-03~05, UC-06 | 화면 회귀 | 375×812에서 사용 저장 성공(계란 부족 10ea 응답) / 폐기 저장 성공 | 결과·남은 양·부족 경고로 스크롤 및 포커스 이동, 실제 고정 저장바·하단 탭에 가리지 않음; "계란 재고가 10ea 부족했어요"처럼 조사 오류 없는 안내 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-07 | FR-AUTH-01, 디자인 3.6 | 화면 회귀 | 사용·폐기 초안 작성 → 인증 만료 → 저장 → 안내의 기록 조회·로그인 선택 | 초안을 둔 원래 화면이 로그인으로 이동해 입력을 잃지 않음; 새 창 로그인·기록 확인 후 원래 입력으로 복구 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-08 | FR-USE-04~05, 디자인 3.6 | 화면 회귀 | 저장이 `NOT_FOUND` / `STOCK_CONFLICT` 반환 → 기록·묶음 새로고침 → 재선택 | 화면 안에 복구 수단, 사라진 묶음 재선택 방지, 나머지 입력 보존, 서버 최신 잔량 표시 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-09 | FR-STK-04, FR-USE-01·03~04, NFR-07 | 화면 회귀 | 저장 버튼 3회 연타 / 처리 후 응답만 유실 | pending 중 변경·중복 제출 방지, 요청 1건, 자동 재전송 없음; 기록 확인 후 판단하도록 안내. 재전송의 서버 멱등성은 현재 계약에 없어 보장으로 기록하지 않음 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-10 | FR-USE-03~04, 이력 조회 계약, 디자인 3.6 | 화면 회귀 | 초안 작성 중 탭·이력 조건 변경; KST 오늘·과거·미래·없는 날짜·역전. from=2026-10-01, to=10-31(양끝 포함 31일) / 11-01(32일), 실행 T가 이보다 이르면 T 기준 같은 길이로 이동. 각 경계 기록·usage/waste 필터 준비 | 31일 정상·양끝 기록 포함·최신순·종류 필터 정확, 32일·역전·잘못된 값은 안내. 조회 중 초안 유지·저장 요청 없음. 기간 계산의 양끝 포함 기준은 10.2에서 조회 소유자 확인 후 최종 판정 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-11 | NFR-05, 디자인 3.6 | 화면 회귀 | 375×812·1024 화면에서 긴 이름·여러 행·오류 입력 후 Tab·Shift+Tab·Esc 조작 | 주요 터치 영역 44px, 라벨·오류 연결, 포커스 가시성·대화상자 복귀, 고정 바 가림·가로 넘침 없음; 360px도 최소 지원 너비 확인 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-12 | 검증 증거 신뢰성 | 화면 회귀 | 첫 등록 DTO 기록 후 같은 메뉴 수정; fixture에서 다른 매장·비활성·없는 ID 조회 | 첫 증거가 수정 DTO로 바뀌지 않음(깊은 복사), 필터·DB 제약을 생략해 거짓 통과하지 않음. 스크린샷 전 sticky/fixed를 static으로 바꾸지 않음 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-13 | FR-ING-02, FR-MENU-01, FR-DASH-01~03, 디자인 3.6 | 화면 회귀 | 재료/메뉴/묶음 없음, 조회 실패, 없는 상세 ID, 일시 장애 후 재조회 | 빈 상태·오류·404 구분, 한국어 안내·복귀/재조회 제공, 입력 가능한 화면은 초안 유지. HTTP 상태는 Next 스트리밍 여부도 기록 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| UI-REG-14 | FR-USE-03~04, 계약 입력 검증 | 화면 회귀 | 수량 0·음수·빈 값·소수 경계, 메모 100/101자, 여러 행 오류 후 수정·삭제 | 계약 범위에서 검증, 유효 경계는 DTO에 그대로 반영; 오류 동시 표시·첫 오류 포커스·행 인덱스 연결·입력 보존 | 이번 기준 소스에서 브라우저 재실행 안 함; 과거 fixture 결과는 참고만 | NOT RUN |
| NFT-01 | NFR-01 | 비기능 | `lib/stock` 단위 테스트(3.1~3.5) 전체 실행 | 전부 통과 (손계산 기대값과 100% 일치) | UT-UNIT-08·UT-ORD-08 명세 합의 대기 | BLOCKED |
| NFT-02 | NFR-02, 07 | 비기능 | 실제 DB의 DB-09·DB-11 다품목 롤백, DB-12~13 폐기 성공/거부, 4.1의 실제 통합 IT-USE-05·10 | 잔량 음수·실패 호출의 부분 반영 0건, 경쟁 요청의 정상 커밋 보존, 재시도 최대 1회. 목 분기 검사만 있으면 판정 `BLOCKED` | DB 다품목 원자성·실제 재시도 증거 재검토 필요 | BLOCKED |
| NFT-03 | NFR-03 | 비기능 | 7장 `pnpm eval:recommend`, AI 생성·대체·오류 분리 | AI 생성 성공 20건·시나리오/기준 분포 충족, AI분 DB 대조 일치율 100%. 대체 응답만으로 통과 불가, 표본 미달은 `BLOCKED` | 로컬 DB 및 실제 공급자 키 미준비; 실제 AI 0회 | BLOCKED |
| NFT-04 | NFR-04 | 비기능 | 8.1 사용성 측정 절차 | 입고 1품목 30초 이내, 판매 마감(메뉴 10개) 2분 이내 (3명 모두) | 비팀원 3명·실기기 사용성 측정 미실시 | BLOCKED |
| NFT-05 | NFR-05 | 비기능 | UI-REG-11 + axe 도구 준비 후 Playwright 검사 | 360px 이상 지원, 375×812·1024 점검, 주요 버튼 높이 44px 이상, 유통기한 "D-2"+날짜+색 표시, 심각 접근성 위반 0건 | axe 도구·브라우저 접근성 실행 미준비 | BLOCKED |
| NFT-06 | NFR-06 | 비기능 | 배포 환경·네트워크·cold/warm 구분 고정. 일반 화면별 진입→주요 내용 표시 5회 원시값·최댓값, AI는 7장 20회 P95 별도 기록 | 일반 화면 5회 모두 1초 이내, AI P95 15초 이내·진행 상태 표시. 소표본 한계와 실패 요청도 보고 | 배포 환경·네트워크·cold/warm 측정 미준비 | BLOCKED |
| NFT-07 | NFR-08 | 비기능 | `AI_MOCK=fail` 모의 장애에서 E2E-03·E2E-06 | 재고 기능 정상, 대체 추천과 실패 안내 표시 | 실제 DB 연결 E2E-03·06 미실행 | BLOCKED |
| NFT-08 | NFR-09 | 비기능 | DB-01~05, IT-AUTH-03, E2E-08 | 다른 매장 데이터 0건 | 인증·매장 격리 전체 E2E 미실행 | BLOCKED |
| NFT-09 | NFR-10 | 비기능 | 비밀 키 모듈의 `server-only`·클라이언트 import 경계 검토 + 빌드 JS·소스맵에서 테스트용 비밀 값의 포함 여부 검사 (값 자체 출력 금지) | 비밀 값 노출 0건, service role 클라이언트 사용 없음. 공개 Supabase 키와 비밀 키 구분; 키 이름 검색만으로 통과 판정하지 않음 | 빌드 산출물에 테스트 비밀 값이 섞이는지 아직 검사 안 함 | NOT RUN |
| NFT-10 | NFR-11 | 비기능 | coverage provider·`lib/stock` 전체 파일(include, 미수입 파일 포함) 설정 후 `pnpm test --coverage` | 라인 커버리지 80% 이상; 분모·제외 목록·리포트 첨부. provider 미설치는 `BLOCKED` | coverage provider 미설치·전체 stock 분모 미설정 | BLOCKED |
| NFT-11 | NFR-12 | 비기능 | 설정 점검 + IT-REC-06 | 매장별 일일 한도 동작, CI에서 `AI_MOCK=1` | AI_MOCK 설정 확인, 실제 일일 한도는 DB 재실행 필요 | BLOCKED |
| NFT-12 | 호환성 (C-01) | 비기능 | 실기기: iOS Safari, Android Chrome 최신 2개 버전 | E2E-03·05·07 수동 확인 통과 | iOS/Android 실기기 미준비 | BLOCKED |

## 수준별 계획 케이스 수

| 수준 | 전체 | PASS | FAIL | BLOCKED | NOT RUN | SKIP | N/A |
|---|---:|---:|---:|---:|---:|---:|---:|
| 단위 | 72 | 68 | 0 | 3 | 1 | 0 | 0 |
| DB | 17 | 14 | 0 | 3 | 0 | 0 | 0 |
| 통합 | 54 | 38 | 0 | 15 | 1 | 0 | 0 |
| 전체 E2E | 8 | 0 | 0 | 8 | 0 | 0 | 0 |
| 화면 회귀 | 14 | 0 | 0 | 0 | 14 | 0 | 0 |
| 비기능 | 12 | 0 | 0 | 11 | 1 | 0 | 0 |
