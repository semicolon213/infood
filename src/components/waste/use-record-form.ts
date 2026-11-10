"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ActionError, ActionResult } from "@/lib/result";
import { updateRecordError } from "./form-input";

export function useRecordForm<Input, Output>(saveAction: (input: Input) => Promise<ActionResult<Output>>, onSaved: () => void) {
  const id = useId();
  const submitting = useRef(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Output | null>(null);
  const [loginAvailable, setLoginAvailable] = useState(false);
  useEffect(() => {
    if (result === null) return;
    const region = document.getElementById(id)?.querySelector<HTMLElement>("[data-record-result]");
    region?.focus({ preventScroll: true });
    region?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [id, result]);
  function report(next: ActionError) {
    setError(next);
    requestAnimationFrame(() => { const form = document.getElementById(id); (form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>("[data-record-error]"))?.focus(); });
  }
  async function submit(event: FormEvent<HTMLFormElement>, input: ActionResult<Input>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!input.ok) { report(input.error); return; }
    submitting.current = true;
    setPending(true); setError(null); setLoginAvailable(false);
    let response: ActionResult<Output>;
    try { response = await saveAction(input.data); }
    catch {
      setLoginAvailable(true);
      report({ code: "INTERNAL", message: "저장 결과를 확인하지 못했어요. 입력한 내용은 그대로예요. 기록을 확인한 뒤 다시 시도해 주세요" });
      submitting.current = false; setPending(false); return;
    }
    setPending(false);
    if (!response.ok) { report(response.error); submitting.current = false; return; }
    // 성공 뒤에는 새 기록을 명시적으로 시작할 때까지 재전송을 막는다.
    setResult(response.data);
    onSaved();
  }
  const props = (field: string) => ({ id: `${id}-${field}`, "aria-invalid": !!error?.fields?.[field], "aria-describedby": error?.fields?.[field] ? `${id}-${field}-error` : undefined });
  return { id, error, pending, result, loginAvailable, props, submit,
    edit: (fields: string[], removedIndex?: number) => setError((current) => updateRecordError(current, fields, removedIndex)),
    reset: () => { setResult(null); setError(null); setLoginAvailable(false); submitting.current = false; },
  };
}
