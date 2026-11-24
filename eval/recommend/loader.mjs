// Node 22.15+ 기본 API로 프로젝트의 TS·@/ 경로를 실행한다. 추가 런타임 의존성은 없다.
import { registerHooks, stripTypeScriptTypes, createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
if (typeof registerHooks !== "function") throw new Error("Node 22.15 이상이 필요합니다");
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate;
    if (specifier.startsWith("@/")) candidate = path.join(root, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) candidate = fileURLToPath(new URL(specifier, context.parentURL));
    if (candidate) {
      for (const value of [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]) {
        if (existsSync(value) && value.endsWith(".ts")) return nextResolve(pathToFileURL(value).href, context);
      }
    }
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL) throw error;
      try { return nextResolve(pathToFileURL(createRequire(context.parentURL).resolve(specifier)).href, context); }
      catch { throw error; }
    }
  },
  load(url, context, nextLoad) {
    // TypeScript bundler의 JSON import 동작을 앱 fixture에 한정해 맞춘다.
    if (url.startsWith(pathToFileURL(path.join(root, "src") + path.sep).href) && url.endsWith(".json")) {
      return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(JSON.parse(readFileSync(fileURLToPath(url), "utf8")))}` };
    }
    if (!url.endsWith(".ts")) return nextLoad(url, context);
    return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform" }) };
  },
});
