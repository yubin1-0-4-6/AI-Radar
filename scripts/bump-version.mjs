/**
 * 一次改齐四处版本号：package.json / Cargo.toml / Cargo.lock / tauri.conf.json
 *
 * 手改这四个地方最容易漏，尤其是 Cargo.lock —— 漏了会导致 CI 的
 * `cargo --locked` 失败。用这个脚本就不会漏。
 *
 * 用法：
 *   node scripts/bump-version.mjs 0.1.2
 *   node scripts/bump-version.mjs v0.1.2      # v 前缀可省略
 */
import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2];
if (!raw) {
  console.error("用法: node scripts/bump-version.mjs <version>");
  process.exit(1);
}
const next = raw.replace(/^v/, "").trim();
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`版本号格式不对: "${raw}"（应为 x.y.z）`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const lock = readFileSync("src-tauri/Cargo.lock", "utf8");
const lockVer = lock.match(/name = "ai-radar"\nversion = "(.+?)"/)?.[1];

if (pkg.version === next && conf.version === next && lockVer === next) {
  console.log(`四处已经是 ${next}，无需改动`);
  process.exit(0);
}

writeFileSync("package.json", readFileSync("package.json", "utf8").replace(
  /"version": ".*?"/,
  `"version": "${next}"`,
));

writeFileSync("src-tauri/Cargo.toml", readFileSync("src-tauri/Cargo.toml", "utf8").replace(
  /^version = ".*?"$/m,
  `version = "${next}"`,
));

writeFileSync("src-tauri/Cargo.lock", lock.replace(
  /(name = "ai-radar"\nversion = ")(.+?)(")/,
  `$1${next}$3`,
));

writeFileSync("src-tauri/tauri.conf.json", readFileSync("src-tauri/tauri.conf.json", "utf8").replace(
  /"version": ".*?"/,
  `"version": "${next}"`,
));

// 复核
const after = {
  "package.json": JSON.parse(readFileSync("package.json", "utf8")).version,
  "tauri.conf.json": JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version,
  "Cargo.toml": readFileSync("src-tauri/Cargo.toml", "utf8").match(/^version = "(.+?)"/m)[1],
  "Cargo.lock": readFileSync("src-tauri/Cargo.lock", "utf8").match(
    /name = "ai-radar"\nversion = "(.+?)"/,
  )[1],
};
for (const [k, v] of Object.entries(after)) console.log(`  ${k.padEnd(18)}: ${v}`);
const vals = Object.values(after);
console.log(
  vals.every((v) => v === next)
    ? `\n四处版本号已统一为 ${next}`
    : `\n四处不一致！${vals.join(", ")}`,
);
if (vals.some((v) => v !== next)) process.exit(1);