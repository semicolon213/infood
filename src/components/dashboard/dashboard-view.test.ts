import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUB_DASHBOARD } from "@/lib/queries/stub-data";
import type { Dashboard } from "@/types/contracts";
import { DashboardView, dayLabel } from "./dashboard-view";

// 대시보드 화면 (WBS 4.1a). 서버 조회는 4.1b(IT-DASH)에서 검증하고, 여기서는 계약 데이터를 어떻게 보여 주는지만 본다.
const render = (data: Dashboard) => renderToStaticMarkup(createElement(DashboardView, { data, storeName: "테스트 한식당" }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("DashboardView (FR-DASH-01~04)", () => {
  it("dayLabel: 날짜 문자열을 월/일 (요일)로", () => {
    expect(dayLabel("2026-11-10")).toBe("11/10 (화)");
    expect(dayLabel("2026-11-03")).toBe("11/3 (화)");
    expect(dayLabel("2026-12-01")).toBe("12/1 (화)");
  });

  it("FR-DASH-01: 임박 묶음을 기한 순으로 D-n과 날짜와 함께", () => {
    const t = text(render(STUB_DASHBOARD));
    expect(t).toContain("먼저 써야 할 재료 2");
    expect(t.indexOf("두부 6개")).toBeLessThan(t.indexOf("돼지고기(앞다리) 1.2kg"));
    expect(t).toContain("D-1");
    expect(t).toContain("D-2");
    expect(t).toContain("11/5 (목)까지");
  });

  it("FR-DASH-02: 기한 지난 묶음은 따로, 해당 묶음 폐기 화면으로 연결", () => {
    const html = render(STUB_DASHBOARD);
    expect(text(html)).toContain("기한 지난 재료 1");
    expect(html).toContain(`href="/waste?lotId=${STUB_DASHBOARD.expiredLots[0].lotId}"`);
    // 기한 지난 구역이 임박 구역보다 위
    expect(html.indexOf("기한 지난 재료")).toBeLessThan(html.indexOf("먼저 써야 할 재료"));
  });

  it("FR-DASH-03: 부족 재료는 사용 가능 재고 / 최소 재고", () => {
    const t = text(render(STUB_DASHBOARD));
    expect(t).toContain("부족한 재료 2");
    expect(t).toContain("0g / 최소 500g");
    expect(t).toContain("1.2kg / 최소 2kg");
  });

  it("FR-DASH-04: 경고가 없어도 추천·발주 바로가기", () => {
    const html = render({ today: "2026-11-10", expiringLots: [], expiredLots: [], lowStock: [] });
    expect(text(html)).toContain("지금 처리할 재료가 없어요");
    expect(html).toContain('href="/recommend"');
    expect(html).toContain('href="/orders"');
    expect(html).not.toContain("기한 지난 재료");
  });

  it("D-0도 D-n 형식 (재료 화면과 같음)", () => {
    const lot = { ...STUB_DASHBOARD.expiringLots[0], daysLeft: 0 };
    expect(text(render({ ...STUB_DASHBOARD, expiringLots: [lot] }))).toContain("D-0");
  });
});
