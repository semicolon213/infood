"use client";

import { useState } from "react";
import Link from "next/link";
import { ChefHat, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";
import type { RecommendBasis, RecommendationView } from "@/types/contracts";
import { RecommendationResult } from "./recommendation-result";

// AI 메뉴 추천 화면 (FR-REC-01~06, UC-08) — WBS 4.2a. POST /api/recommendations (08_API_SPEC 9장)

export const BASIS_OPTIONS: { value: RecommendBasis; label: string; hint: string }[] = [
  { value: "expiry", label: "유통기한", hint: "기한이 가까운 재료부터" },
  { value: "cost", label: "원가", hint: "재고 금액이 큰 재료부터" },
  { value: "popularity", label: "인기", hint: "많이 팔린 메뉴의 재료부터" },
];

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: RecommendationView }
  | { kind: "error"; code: string; message: string };

const NETWORK_ERROR = "추천을 만들지 못했어요. 잠시 후 다시 시도해 주세요";

export function RecommendScreen({ hasMenus }: { hasMenus: boolean }) {
  const [basis, setBasis] = useState<RecommendBasis>("expiry"); // 기본 유통기한 우선 (FR-REC-06)
  const [state, setState] = useState<State>({ kind: "idle" });
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
  const loading = state.kind === "loading";

  async function run() {
    setState({ kind: "loading" });
    setOpenSteps(new Set());
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basis }),
      });
      const body = (await res.json()) as ActionResult<RecommendationView>;
      setState(body.ok ? { kind: "done", data: body.data } : { kind: "error", code: body.error.code, message: body.error.message });
    } catch {
      setState({ kind: "error", code: "NETWORK", message: NETWORK_ERROR });
    }
  }

  const toggleSteps = (index: number) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const action =
    state.kind === "done" ? (
      <Button variant="ghost" className="h-11" onClick={run} disabled={loading}>
        <RefreshCw aria-hidden="true" />다시 추천
      </Button>
    ) : undefined;

  return (
    <>
      <PageHeader title="오늘의 추천" action={action} />
      <main className="space-y-4 p-4">
        <fieldset className="space-y-2" disabled={loading}>
          <legend className="text-sm text-muted-foreground">무엇부터 쓸까요?</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="추천 기준">
            {BASIS_OPTIONS.map((o) => (
              <Button
                key={o.value}
                role="radio"
                aria-checked={basis === o.value}
                variant={basis === o.value ? "default" : "outline"}
                className="h-11 rounded-full"
                onClick={() => setBasis(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{BASIS_OPTIONS.find((o) => o.value === basis)!.hint} 쓰는 메뉴를 추천해요</p>
        </fieldset>

        {!hasMenus ? (
          <Alert>
            <AlertDescription>
              추천하려면 메뉴가 1개 이상 있어야 해요.
              <Button asChild variant="outline" className="mt-2 h-11">
                <Link href="/menus/new">메뉴 등록하기</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : state.kind !== "done" ? (
          <Button className="h-[52px] w-full text-base" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {loading ? "추천을 만들고 있어요" : "추천 받기"}
          </Button>
        ) : null}

        {loading && <p role="status" className="text-center text-sm text-muted-foreground">재고와 메뉴를 살펴보고 있어요. 길면 30초쯤 걸려요</p>}

        {state.kind === "error" && (
          <Alert variant="destructive">
            <AlertDescription>
              {state.message}
              {state.code !== "RATE_LIMITED" && state.code !== "VALIDATION" && (
                <Button variant="outline" className="mt-2 h-11" onClick={run}>
                  다시 시도
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {state.kind === "done" && (
          <RecommendationResult
            data={state.data}
            renderIdeaActions={(idea) => (
              <div className="space-y-2">
                <Button variant="outline" className="h-11 w-full" aria-expanded={openSteps.has(idea.index)} onClick={() => toggleSteps(idea.index)}>
                  <ChefHat aria-hidden="true" />
                  {openSteps.has(idea.index) ? "조리 순서 닫기" : "조리 순서 보기"}
                </Button>
                {openSteps.has(idea.index) && (
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    {idea.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                )}
              </div>
            )}
          />
        )}
      </main>
    </>
  );
}
