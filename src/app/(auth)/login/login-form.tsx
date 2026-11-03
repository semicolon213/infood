"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const Email = z.email();

// FR-AUTH-01: 이메일 매직링크 로그인. 서버 액션 없이 클라이언트 SDK로 요청한다 (08_API_SPEC 2장).
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Email.safeParse(email.trim()).success) {
      setError("이메일 주소를 다시 확인해 주세요");
      return;
    }
    setError(null);
    setStatus("sending");

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (otpError) {
      setStatus("idle");
      setError(
        otpError.status === 429
          ? "잠시 후 다시 시도해 주세요. 메일을 너무 자주 보냈어요"
          : "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요",
      );
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="font-semibold">메일을 보냈어요</p>
        <p className="text-sm text-muted-foreground">
          {email}로 보낸 링크를 이 휴대폰에서 눌러 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.
        </p>
        <Button variant="outline" className="h-11 w-full" onClick={() => setStatus("idle")}>
          다른 이메일로 받기
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="owner@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
          className="h-11 text-base"
        />
        {error && (
          <p id="email-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="h-[52px] w-full text-base" disabled={status === "sending"}>
        {status === "sending" ? "보내는 중…" : "로그인 링크 받기"}
      </Button>
    </form>
  );
}
