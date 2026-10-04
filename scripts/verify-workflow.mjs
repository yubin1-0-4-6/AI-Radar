/** 校验 release.yml 里内嵌的 github-script 是否为合法 JS（把 ${{ }} 占位替换成字面量） */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const lines = readFileSync(".github/workflows/release.yml", "utf8").split("\n");
const start = lines.findIndex((l) => l.trim() === "script: |");
if (start < 0) {
  console.error("找不到 script: | 块");
  process.exit(1);
}
const indent = lines[start + 1].match(/^ */)[0].length;
const body = [];
for (let i = start + 1; i < lines.length; i++) {
  const l = lines[i];
  if (l.trim() === "") { body.push(""); continue; }
  const ind = l.match(/^ */)[0].length;
  if (ind < indent) break;
  body.push(l.slice(indent));
}

const src = body.join("\n").replace(/\$\{\{[^}]*\}\}/g, "X");
const wrapped = `(async () => {\n${src}\n})();`;
const tmp = ".tmp-verify.mjs";
writeFileSync(tmp, wrapped, "utf8");

try {
  // 只验语法，不执行
  new (Function.constructor)(`return async () => {\n${src}\n};`)();
  console.log("内嵌 JS 语法 OK  (" + src.split("\n").length + " 行)");
} catch (e) {
  console.error("内嵌 JS 语法错误: " + e.message);
  process.exitCode = 1;
} finally {
  unlinkSync(tmp);
}