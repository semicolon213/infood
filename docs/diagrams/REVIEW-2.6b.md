# 2.6b 클래스 다이어그램 렌더링·검토

2026-11-03 · 작성: 성윤우 / 도구: Codex, Mermaid 12.2.0, Chromium.

원본은 [아키텍처 17장](../06_ARCHITECTURE.md). [확대 검토본](class-diagrams.html)은 외부 네트워크 없이 열리고 SVG 2개를 포함한다. 생성 SVG·PNG와 Mermaid 원본의 일치 확인용 SHA-256은 [렌더링 기록](render-report.json)에 있다. 원본을 바꾸면 파생 그림도 다시 생성한다.

| 검토 | 결과 |
|---|---|
| 문법·실제 렌더링 | 도메인·패턴 2개 모두 성공, 브라우저 오류0, SVG 밖으로 잘린 텍스트0 |
| 관계 6종 | 연관·집합·합성·의존·일반화·실체화 표기와 화살촉을 그림에서 확인 |
| DB 설계 대조 | nullable lot 참조, RESTRICT/CASCADE, 0..* 다중성, 매장 관계 생략 설명을 07_DB.md 및 develop에 병합된 0001_init.sql과 대조 |
| 실제 코드 대조 | AiClient 구현 두 개 및 AiError extends Error 확인. 허구의 재고 상속 없음 |
| 패턴 설계 대조 | 7.1 Adapter·7.2 Strategy와 일치. Strategy·FEFO는 설계 단계라는 설명 유지 |
| 수정 | 단수 엔티티 → snake_case 복수 테이블 이름 설명 보완 |
| 읽기·접근성 | 한글·제네릭·다중성·마름모/삼각형 확인, SVG 제목·설명 제공, HTML 확대50%와 375px 내부 스크롤 확인 |

관련: BR-02·04, NFR-01·11. 에이전트 1차 검토 및 렌더링 확인을 마쳤다. **김형균의 사람 리뷰/승인은 대기**이며 PR 병합 전까지 상태는 [~]다.
