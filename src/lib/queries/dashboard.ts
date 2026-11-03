import "server-only";
import type { Dashboard } from "@/types/contracts";
import { STUB_DASHBOARD } from "./stub-data";

// 08_API_SPEC 8장. WBS 2.10 stub — 실제 구현은 4.1b (사용 가능 재고 기준, BR-05)
export async function getDashboard(): Promise<Dashboard> {
  return STUB_DASHBOARD;
}
