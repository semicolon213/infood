import { expect, test } from "@playwright/test";

// 앱 골격 확인 (WBS 2.4). 로그인 이후 흐름(E2E-01~08)은 각 기능 작업에서 추가한다.
test("미로그인으로 첫 화면에 오면 로그인 화면으로 간다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "로그인 링크 받기" })).toBeVisible();
});

test("잘못된 이메일이면 안내를 보여 준다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("not-an-email");
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await expect(page.getByText("이메일 주소를 다시 확인해 주세요")).toBeVisible();
});
