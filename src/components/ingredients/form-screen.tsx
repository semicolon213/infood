"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createIngredient, updateIngredient } from "@/actions/ingredients";
import { IngredientForm } from "./form";
import { ingredientFormSchema, formErrors, type IngredientFormDraft } from "./form-input";

export function IngredientFormScreen({ id, initial, unitLocked = false, returnTo = "/ingredients" }: { id?: string; initial?: IngredientFormDraft; unitLocked?: boolean; returnTo?: "/ingredients" | "/receive" }) {
  const router = useRouter();
  const destination = id ? `/ingredients/${id}` : returnTo;
  return <IngredientForm initial={initial} unitLocked={unitLocked} onCancel={() => router.push(destination)}
    save={async (draft) => {
      const input = ingredientFormSchema.safeParse(draft);
      if (!input.success) return { ok: false, error: { code: "VALIDATION", message: "입력한 내용을 다시 확인해 주세요", fields: formErrors(input.error) } };
      return id ? updateIngredient({ ...input.data, id }) : createIngredient(input.data);
    }}
    onSaved={() => { toast.success(id ? "재료 정보를 수정했어요" : "재료를 등록했어요"); router.push(destination); router.refresh(); }} />;
}
