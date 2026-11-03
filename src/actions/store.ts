"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/result";

const CreateStoreInput = z.object({
  name: z.string().trim().min(1, "매장 이름을 입력해 주세요").max(50, "50자 이내로 입력해 주세요"),
});

// FR-AUTH-02: 최초 로그인 시 매장 생성 (docs/08_API_SPEC.md 2장)
export async function createStore(input: { name: string }): Promise<ActionResult<{ storeId: string }>> {
  const parsed = CreateStoreInput.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "매장 이름을 다시 확인해 주세요", {
      name: parsed.error.issues[0]?.message ?? "매장 이름을 다시 확인해 주세요",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "다시 로그인해 주세요");

  const { data, error } = await supabase
    .from("stores")
    .insert({ owner_id: user.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error) {
    // owner_id unique 위반 = 이미 매장이 있음
    if (error.code === "23505") return fail("CONFLICT", "이미 매장이 있어요");
    return fail("INTERNAL", "매장을 만들지 못했어요. 잠시 후 다시 시도해 주세요");
  }
  return ok({ storeId: data.id });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
