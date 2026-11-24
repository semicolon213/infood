"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deactivateIngredient } from "@/actions/ingredients";
import { adjustLot } from "@/actions/usage";
import { IngredientDetail } from "./detail";
import type { IngredientDetailData } from "./view-model";

export function IngredientDetailScreen({ data }: { data: IngredientDetailData }) {
  const router = useRouter();
  return <IngredientDetail data={data} onDeactivate={async () => {
    const result = await deactivateIngredient({ id: data.id });
    if (result.ok) toast.success("재료를 비활성화했어요");
    return result;
  }} onAdjust={async (input) => {
    const result = await adjustLot(input);
    if (result.ok) { toast.success("실사 수량으로 맞췄어요"); router.refresh(); }
    return result;
  }} onBack={() => { router.push("/ingredients"); router.refresh(); }} />;
}
