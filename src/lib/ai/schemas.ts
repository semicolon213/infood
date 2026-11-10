// AI 출력 스키마 (모델 ↔ 서버 계약, docs/08_API_SPEC.md 11장).
// 서버는 이 결과를 그대로 쓰지 않고 후처리(재고 대조 등)를 거쳐 응답 타입을 만든다.
import { z } from "zod";

const RecIngredientOut = z.object({
  ingredientId: z.uuid().nullable(), // 매장 재료 목록에 없으면 null
  name: z.string().min(1).max(30),
  qty: z.number().positive(), // 기본 단위
});

export const Recommendation = z.object({
  pushMenus: z
    .array(
      z.object({
        menuId: z.uuid(),
        reason: z.string().max(80),
        // 재료·수량은 받지 않는다. consumes는 서버가 1인분 전체 레시피로 채운다 (08_API_SPEC 11장, v0.3.2)
      }),
    )
    .max(3),
  newIdeas: z
    .array(
      z.object({
        name: z.string().max(30),
        ingredients: z.array(RecIngredientOut).min(1),
        steps: z.array(z.string().max(120)).min(1).max(8),
        suggestedPrice: z.number().int().positive().nullable(),
      }),
    )
    .max(3),
});
export type Recommendation = z.infer<typeof Recommendation>;

// 확장 FR-ING-04 (AI 보관일수 추천)
export const StorageSuggestion = z.object({
  storage: z.enum(["fridge", "freezer", "room"]), // SRS 1.3 온도 기준으로 판단
  defaultShelfDays: z.number().int().min(1).max(3650),
  category: z.enum(["vegetable", "meat", "seafood", "dairy", "sauce", "grain", "etc"]),
  unit: z.enum(["g", "ml", "ea"]),
  note: z.string().max(80),
});
export type StorageSuggestion = z.infer<typeof StorageSuggestion>;
