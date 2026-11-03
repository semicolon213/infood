import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "재고콕",
  description: "소형 식당·카페용 식재료 재고 관리와 AI 메뉴 추천",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 브라우저 확장 프로그램이 <html>에 속성을 넣어도 경고하지 않는다 (이 태그 한 단계만 해당)
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
