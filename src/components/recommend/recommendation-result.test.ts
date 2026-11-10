import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUB_RECOMMENDATION } from "@/lib/queries/stub-data";
import type { RecommendationView } from "@/types/contracts";
import { RecommendationResult } from "./recommendation-result";

// AI 추천 결과 화면 (WBS 4.2a, FR-REC-02·03·05). 계약 데이터를 어떻게 보여 주는지만 본다.
const render = (data: RecommendationView) => renderToStaticMarkup(createElement(RecommendationResult, { data }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("RecommendationResult", () => {
  it("FR-REC-05: 정상 결과는 'AI 추천' 표시", () => {
    const t = text(render(STUB_RECOMMENDATION));
    expect(t).toContain("AI 추천");
    expect(t).not.toContain("규칙 기반");
  });

  it("FR-REC-03: 재료마다 보유 / 재고 부족(지금 수량) / 등록되지 않은 재료(단위 없이)", () => {
    const t = text(render(STUB_RECOMMENDATION));
    expect(t).toContain("두부 1개 보유");
    expect(t).toContain("대파 20g 지금 0g 있어요 재고 부족");
    expect(t).toContain("고추기름 10 등록되지 않은 재료");
    expect(t).toContain("재고 부족 1 · 등록되지 않은 재료 1");
  });

  it("기존 메뉴 재료는 '1인분 기준'으로 표시 (08 v0.3.2)", () => {
    const t = text(render(STUB_RECOMMENDATION));
    expect(t).toContain("된장찌개");
    expect(t).toContain("재료 · 1인분 기준 두부 0.5개 보유");
  });

  it("예상 원가는 서버 값, 미등록 재료가 있으면 원가 제외 안내", () => {
    const t = text(render(STUB_RECOMMENDATION));
    expect(t).toContain("예상 원가 3,000원");
    expect(t).toContain("제안 판매가 9,500원");
    expect(t).toContain("등록되지 않은 재료는 원가에 포함되지 않아요");
  });

  it("UC-08 3a: 대체 결과는 '규칙 기반' 안내, 새 특선 구역 없음", () => {
    const t = text(render({ ...STUB_RECOMMENDATION, fallback: true, newIdeas: [] }));
    expect(t).toContain("규칙 기반");
    expect(t).toContain("추천을 만들지 못했어요. 임박 재료가 들어간 메뉴를 보여 드릴게요");
    expect(t).not.toContain("새 특선 아이디어");
    expect(t).toContain("된장찌개");
  });

  it("추천 메뉴가 없으면 빈 상태 문구", () => {
    const t = text(render({ ...STUB_RECOMMENDATION, pushMenus: [], newIdeas: [], shortCount: 0, unregisteredCount: 0 }));
    expect(t).toContain("지금 재고로 먼저 권할 메뉴가 없어요");
    expect(t).toContain("이번에는 새 아이디어가 없어요");
  });
});
