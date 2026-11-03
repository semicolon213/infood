// 날짜 규칙 (docs/06_ARCHITECTURE.md 10장): "오늘"은 KST 기준 날짜이고 서버가 이 함수로만 구한다.
// lib/stock 계산 함수에는 이 값을 인자로 넘긴다 (도메인은 시계에 의존하지 않음).

// "2026-11-03" 형식. now는 테스트에서 시각을 고정할 때만 넘긴다
export function todayKST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}
