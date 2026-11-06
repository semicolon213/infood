import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { IngredientFormScreen } from "@/components/ingredients/form-screen";
import { registrationReturnTo } from "@/components/ingredients/filters";

export default async function Page({ searchParams }: PageProps<"/ingredients/new">) {
  const returnTo = registrationReturnTo((await searchParams).returnTo);
  return <>
    <PageHeader title="재료 등록" action={<Button asChild variant="ghost" className="h-11"><Link href={returnTo}>{returnTo === "/receive" ? "입고로" : "목록"}</Link></Button>} />
    <main className="p-4"><IngredientFormScreen returnTo={returnTo} /></main>
  </>;
}
