import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const sha256Text = (value) => sha256(value.replace(/\r\n/g, "\n"));
export const cliArgs = (args = process.argv.slice(2)) => args[0] === "--" ? args.slice(1) : args;
export const markdown = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
export const isMain = (url) => Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(url);

// describe 문맥은 전달하지 않는다. 축약 번호는 직전 접두사에만 연결한다.
export function expandIds(text, kind = "test") {
  const prefix = kind === "test" ? "(?:UT-[A-Z]+|IT-[A-Z]+|UI-REG|E2E|DB|NFT)" : "(?:FR-[A-Z]+|NFR|BR|DR|UC|AUTH|ING|MENU|STK|USE|DASH|REC|ORD)";
  const pattern = new RegExp(`(${prefix})-(\\d+)((?:\\s*[~～·,]\\s*(?:${prefix}-)?\\d+)*)`, "g");
  const result = new Set();
  for (const match of text.matchAll(pattern)) {
    let currentPrefix = match[1]; let previous = Number(match[2]); let width = match[2].length;
    const add = (n) => result.add(`${kind === "requirement" && !/^(FR-|NFR$|BR$|DR$|UC$)/.test(currentPrefix) ? "FR-" : ""}${currentPrefix}-${String(n).padStart(width, "0")}`);
    add(previous);
    const tail = new RegExp(`([~～·,])\\s*(?:(${prefix})-)?(\\d+)`, "g");
    for (const part of match[3].matchAll(tail)) {
      if (part[2]) currentPrefix = part[2];
      const next = Number(part[3]); width = Math.max(width, part[3].length);
      if (part[1] === "~" || part[1] === "～") {
        if (next < previous || next - previous > 100) throw new Error(`ID 범위가 잘못됐어요: ${match[0]}`);
        for (let n = previous + 1; n <= next; n++) add(n);
      } else add(next);
      previous = next;
    }
  }
  return [...result];
}

export function relativeSource(file, root) {
  const normalized = file.replaceAll("\\", "/");
  const base = root.replaceAll("\\", "/").replace(/\/$/, "");
  const windows = /^[A-Za-z]:\//.test(base);
  const compare = (s) => windows ? s.toLowerCase() : s;
  let relative;
  if (!normalized.startsWith("/") && !/^[A-Za-z]:/.test(normalized)) relative = normalized;
  else if (compare(normalized).startsWith(`${compare(base)}/`)) relative = normalized.slice(base.length + 1);
  else throw new Error("러너 파일 경로가 지정 루트 밖이에요. --runner-root를 실제 실행 루트로 지정해 주세요");
  if (!relative.startsWith("src/") || relative.split("/").some((p) => p === ".." || p === ".")) throw new Error(`분류할 수 없는 소스 경로예요: ${relative}`);
  return relative;
}

export function levelOf(file) {
  if (file === "src/lib/supabase/db.test.ts") return "DB";
  if (file.startsWith("src/components/") || file.endsWith("/sales-form.test.ts")) return "화면 입력 보조";
  if (file.startsWith("src/actions/") || file.startsWith("src/lib/queries/") || file.startsWith("src/app/api/")) return "통합";
  if (file.startsWith("src/lib/") || file.startsWith("src/types/")) return "단위";
  throw new Error(`검사 수준이 정의되지 않은 경로예요: ${file}`);
}
