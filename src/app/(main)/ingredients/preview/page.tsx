import { notFound } from "next/navigation";
import { IngredientPreview } from "@/components/ingredients/preview";

// 개발 중 로그인한 담당자의 화면 검토 전용. 운영 빌드에서는 접근하지 못한다.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <IngredientPreview />;
}
