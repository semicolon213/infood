import { Button } from "@/components/ui/button";

// proxy가 인증 만료 요청을 리다이렉트하면 ActionResult 대신 전송 예외가 올 수 있다.
// 새 창에서 로그인해 원래 화면의 초안을 유지하고 돌아와 재시도할 수 있게 한다.
export function MenuLoginRecovery() {
  return <div className="space-y-2">
    <p>로그인이 필요하면 새 창에서 로그인한 뒤 이 화면으로 돌아와 다시 시도해 주세요.</p>
    <Button asChild variant="outline" className="h-11"><a href="/login" target="_blank" rel="noopener noreferrer">다시 로그인 (새 창)</a></Button>
  </div>;
}
