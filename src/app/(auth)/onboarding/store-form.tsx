"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStore } from "@/actions/store";

export function StoreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createStore({ name });
      if (result.ok) {
        router.replace("/");
        return;
      }
      if (result.error.code === "CONFLICT") {
        router.replace("/");
        return;
      }
      setError(result.error.fields?.name ?? result.error.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="store-name">매장 이름</Label>
        <Input
          id="store-name"
          placeholder="예: 김사장 한식당"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "store-name-error" : undefined}
          className="h-11 text-base"
        />
        {error && (
          <p id="store-name-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="h-[52px] w-full text-base" disabled={pending}>
        {pending ? "만드는 중…" : "시작하기"}
      </Button>
    </form>
  );
}
