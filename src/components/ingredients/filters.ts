import { IngredientFilter, StorageType } from "@/types/contracts";

export type CatalogFilters = { q: string; status: "all" | "soon" | "expired" | "low"; storage: "all" | "fridge" | "freezer" | "room" };
export const emptyFilters: CatalogFilters = { q: "", status: "all", storage: "all" };
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function readFilters(params: SearchParams): CatalogFilters {
  const q = IngredientFilter.shape.q.safeParse(first(params.q));
  const status = IngredientFilter.shape.status.safeParse(first(params.status));
  const storage = StorageType.safeParse(first(params.storage));
  return { q: q.success ? q.data ?? "" : "", status: status.success ? status.data ?? "all" : "all", storage: storage.success ? storage.data : "all" };
}

export function catalogHref(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.storage !== "all") params.set("storage", filters.storage);
  return `/ingredients${params.size ? `?${params}` : ""}`;
}

// 입고 화면 연결은 고정된 내부 경로만 허용한다.
export function registrationReturnTo(value: string | string[] | undefined): "/ingredients" | "/receive" {
  return first(value) === "/receive" ? "/receive" : "/ingredients";
}
