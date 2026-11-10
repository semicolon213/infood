# docs — 재고콕 문서 안내

> 이 폴더의 문서가 무엇이고, 어떤 산출물에 들어가며, 어디에 무엇이 있는지 정리한 안내서다. 2026-11-10 기준.
> **범위의 기준은 [03_SRS.md](03_SRS.md)다.** 다른 문서가 SRS와 다르면 SRS를 따르고 고친다.

## 1. 제출 산출물과 문서

개정 운영계획서(2026-11-02) 기준.

| 산출물 | 들어가는 문서 | 마감 |
|---|---|---|
| ① 프로젝트 기획서 | [02_프로젝트_기획서.md](02_프로젝트_기획서.md) | 10주 10/27(화) 20:00 |
| ② 요구사항 정의서 | [03_SRS.md](03_SRS.md), [diagrams/usecase.puml](diagrams/usecase.puml) | 10주 10/27(화) 20:00 |
| ③ WBS·일정표 | [04_WBS.md](04_WBS.md), [05_일정표.md](05_일정표.md) | 10주 10/27(화) 20:00 |
| ④ 시스템 설계서 초안 | [06_ARCHITECTURE.md](06_ARCHITECTURE.md), [07_DB.md](07_DB.md), [09_DESIGN.md](09_DESIGN.md) 3.4~3.6장 (아래 2장) | 11주 11/03(화) 20:00 |
| ⑤ 중간 산출물 | ①~④ 수정본, 핵심 기능 구현 초안(저장소), 테스트 계획 [10_TEST_PLAN.md](10_TEST_PLAN.md), 팀 코딩 규칙 | 12주 11/10(화) 20:00 |
| ⑥ 테스트 케이스·결과표 | [10_TEST_PLAN.md](10_TEST_PLAN.md) (12장 결과표 양식) | 13주 11/17(화) 20:00 |
| ⑦ AI 활용 로그 | [logs/ai-usage.md](logs/ai-usage.md) (주간 산출물과 함께 매주) | 13주 11/17(화) 20:00 (중간) |
| ⑧ 최종 산출물 | 소스·DB·최종 문서·결과보고서·AI 검증 보고서·발표자료·시연 영상 | 14주 11/30(월) 20:00 |
| 매주 | 주간 진행 일지 [logs/weekly/](logs/weekly/) | 매주 화 20:00 |

> 운영계획서 6.2절 표는 최종 산출물 마감을 23:59, 10절은 20:00으로 적고 있다. 이른 쪽(20:00)을 기준으로 한다.

## 2. ④ 시스템 설계서 — 과목 요구사항별 위치

| 과목 요구사항 (운영계획서 6.2·7절) | 위치 | 담당 |
|---|---|---|
| 아키텍처 스타일 선택과 근거 | [06](06_ARCHITECTURE.md) 14장 | 임지섭 |
| 핵심 품질 속성 2개 이상의 목표·달성·검증, 품질 속성 반영 4단계 | 06 15장 | 임지섭 |
| 4+1 관점 3개 이상 | 06 16장 (개발·프로세스·물리·시나리오) + 17장 (논리) | 임지섭 |
| 클래스 다이어그램 (상속·연관·집합·구성·의존·실체화) | 06 17장, [diagrams/class-diagrams.html](diagrams/class-diagrams.html) | 성윤우 |
| 디자인 패턴 2개 (적용 전후, 무엇이 자주 바뀌는가) | 06 7.1 Adapter, 7.2 Strategy | 김형균 |
| SOLID 위반 의심 지점과 개선 | 06 18장 | 김형균 |
| ERD | [07](07_DB.md) 1장, [diagrams/erd.html](diagrams/erd.html) | 임지섭 |
| 화면 흐름도 | [09](09_DESIGN.md) 3.4~3.6장, [diagrams/screen-flows.html](diagrams/screen-flows.html) | 성윤우 |
| 핵심 기능 시퀀스 | 06 5.3 판매 마감, [diagrams/seq-sales-fefo.html](diagrams/seq-sales-fefo.html) | 김형균 |
| 프로젝트 골격 | 저장소 `src/`, Vercel 배포 | 김형균 |

## 3. 문서 목록

| 문서 | 무엇을 담나 | 버전 | 주 작성 |
|---|---|---|---|
| [01_PRD.md](01_PRD.md) | 제품 목표·성공 지표, 사용자 스토리, 기능 목록, 데모 시나리오, 범위 밖 | v0.3 | 김형균 |
| [02_프로젝트_기획서.md](02_프로젝트_기획서.md) | ① 문제 정의, 대상 사용자, MVP 범위, 차별성, AI 검증 장치, 팀 역할, 일정 요약, 리스크 | v0.4 | 김형균 |
| [03_SRS.md](03_SRS.md) | ② 기능·비기능 요구사항(ID·우선순위), 유스케이스, 비즈니스 규칙 BR-01~06, 외부 기준, 추적표 | v0.4 | 임지섭·성윤우 |
| [04_WBS.md](04_WBS.md) | ③ 작업 분해, 담당·공수, **병렬 작업 규칙(코드 소유권·계약 우선·Git Flow)**, 컷라인 | v0.4 | 김형균 |
| [05_일정표.md](05_일정표.md) | ③ 주차별 계획, 마일스톤, 정기 회의, 간트 차트 | v0.4 | 김형균 |
| [06_ARCHITECTURE.md](06_ARCHITECTURE.md) | ④ 구성도, 계층·폴더, 주요 흐름(시퀀스), 트랜잭션, AI 계층과 디자인 패턴, 보안, 날짜·숫자 규칙, 환경변수, ADR, 스타일·품질 속성·4+1·클래스·SOLID | v0.4 | 전원 |
| [07_DB.md](07_DB.md) | ④ ERD, 테이블·RLS·RPC SQL, 주요 쿼리, 데이터 규칙, 시드 설명 | v0.3 | 임지섭 |
| [08_API_SPEC.md](08_API_SPEC.md) | 서버 액션·Route Handler 입출력, 에러 코드, AI 출력 스키마 (구현 계약은 `src/types/contracts.ts`) | v0.3 | 임지섭 |
| [09_DESIGN.md](09_DESIGN.md) | 디자인 토큰, 레이아웃, 화면 목록·흐름도, 와이어프레임, 컴포넌트, 문구 가이드 | v0.3 | 김형균·성윤우 |
| [10_TEST_PLAN.md](10_TEST_PLAN.md) | 단위·DB·통합·E2E 테스트 케이스, AI 평가, 비기능 테스트, 결과표·결함·AI 검증 보고서 양식, 요구사항→테스트 추적표 | v0.3 | 성윤우 |
| [11_TASK.md](11_TASK.md) | 주차별 작업 체크리스트와 완료 조건(DoD), 진행 상태 | v0.3 | 전원 |
| [seed-review.md](seed-review.md) | 가상 데이터(`supabase/seed.sql`) 구성과 검산 결과 | - | 성윤우 |

루트에 있는 문서:
- [../README.md](../README.md): 프로젝트 소개, 실행 방법
- [../AGENTS.md](../AGENTS.md) · [../CLAUDE.md](../CLAUDE.md): 코딩 에이전트(Codex·Claude Code) 작업 규칙. 도구가 루트에서 읽으므로 루트에 둔다.

## 4. 폴더

### `diagrams/` — 그림

본문에는 SVG를 이미지로 넣고, 크게 보는 HTML과 원본(Mermaid 또는 PlantUML)을 함께 둔다.

| 그림 | 파일 | 실린 곳 |
|---|---|---|
| 유스케이스 | `usecase.svg`·`.html`, 원본 `usecase.puml` | 03 4.1 |
| 일정 간트 | `schedule-gantt.svg`·`.html` | 05 4장 |
| 판매 마감 시퀀스 | `seq-sales-fefo.svg`·`.html` | 06 5.3 |
| 클래스 다이어그램 | `class-domain.svg`, `class-patterns.svg`, `class-diagrams.html` | 06 17장 |
| ERD | `erd.svg`·`.html` | 07 1장 |
| 화면 흐름도 | `screen-navigation.svg`, `screen-errors.svg`, `screen-flows.html` | 09 3.4·3.6 |
| 렌더링 검토 기록 | `REVIEW-2.6b.md`, `REVIEW-2.8.md`, `render-report-*.json` | - |

- 김형균 그림(유스케이스·간트·시퀀스·ERD)은 diagram-design으로 그렸다. 재고콕 초록 스킨을 쓴다.
- 성윤우 그림(클래스·화면 흐름)은 Mermaid로 렌더링했다.
- 그림을 바꾸면 본문 안 Mermaid 원본도 함께 고친다. 본문과 그림이 다르면 본문을 기준으로 다시 그린다.

### `logs/` — 기록

| 파일 | 내용 | 담당 |
|---|---|---|
| [logs/weekly/](logs/weekly/) | 주간 진행 일지 (`_template.md` 양식, `W11.md`…) | 김형균 |
| [logs/ai-usage.md](logs/ai-usage.md) | AI 활용 로그. 운영계획서 13절 항목, 팀원별 표 | 취합 성윤우, 각자 기록 |

### `seed-validation/` — 가상 데이터 검산

`verify.mjs`(검산 스크립트), `report.json`(결과). 설명은 [seed-review.md](seed-review.md).

## 5. 문서 규칙

- **한 내용은 한 문서에만** 적고, 다른 문서는 그 문서를 참조한다. 예외로 제출 문서(①~③)는 따로 읽어도 이해되게 쓴다.
- 요구사항·테스트·작업은 ID로 연결한다: SRS `FR-`·`BR-`·`NFR-`·`UC-`, 테스트 계획 `UT-`·`IT-`·`DB-`·`E2E-`·`NFT-`, WBS 작업 ID.
- 문서를 크게 바꾸면 머리말의 버전·날짜와 변경 이력을 갱신한다.
- 스키마를 바꾸면 새 마이그레이션 → `07_DB.md` 갱신, 계약을 바꾸면 `08_API_SPEC.md` 먼저 (AGENTS 규칙 15, WBS 3.2).
- 문서도 코드와 같이 `feature/<작업ID>-<설명>` 브랜치에서 고쳐 `develop`으로 PR을 올린다 (AGENTS "브랜치 (Git Flow)").

## 6. 알려진 정리 거리 (11/10 기준)

- 일정 문서의 마감은 11/10에 개정 운영계획서 기준으로 고쳤다 (WBS 2.3). 10주차는 개정 전 일정(11/02 제출)으로 작성했다는 사실을 그대로 적어 두었다.
