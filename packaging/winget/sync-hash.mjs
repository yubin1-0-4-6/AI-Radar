/**
 * 用 Release 上真实产物的哈希回填 winget manifest。
 *
 * 为什么必须跑这个：本地 `tauri build` 出来的 exe 和 CI 上构建的 exe
 * 哈希不同（构建时间戳、路径都会进二进制）。manifest 里填错哈希，
 * winget 安装时会直接报 "Installer hash mismatch"。
 *
 * 用法：
 *   node packaging/winget/sync-hash.mjs v0.1.0
 *   node packaging/winget/sync-hash.mjs v0.1.0 "AI Radar_0.1.0_x64-setup.exe"
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(HERE, "manifests/y/yubin1-0-4-6/AI-Radar");
const REPO = "yubin1-0-4-6/AI-Radar";

const tag = process.argv[2];
if (!tag) {
  console.error("用法: node packaging/winget/sync-hash.mjs <tag> [资产文件名]");
  process.exit(1);
}
const asset =
  process.argv[3] ?? `AI Radar_${tag.replace(/^v/, "")}_x64-setup.exe`;

// GitHub release 资产直链：tag + URL 编码后的文件名
const url = `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(asset)}`;

console.log(`拉取 ${url}`);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(
    `下载失败 ${res.status} ${res.statusText}\n` +
      `若这是私有仓库的 Release，未鉴权时必然 404——winget 要求安装包公开可下载。`,
  );
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const sha = createHash("sha256").update(buf).digest("hex");
console.log(`大小 ${buf.length} bytes\nSHA256 ${sha}`);

const file = join(PKG_DIR, "AI-Radar.installer.yaml");
const before = await readFile(file, "utf8");
const after = before
  .replace(/^InstallerSha256: .*$/m, `InstallerSha256: ${sha}`)
  .replace(/^InstallerUrl: .*$/m, `InstallerUrl: ${url}`)
  .replace(/^\s*# 本地构建的哈希.*$/m, "")
  .replace(/^\s*# 正式提交前必须.*$/m, "");
await writeFile(file, after, "utf8");

const pv = join(PKG_DIR, "AI-Radar.yaml");
await writeFile(
  pv,
  (await readFile(pv, "utf8")).replace(/^PackageVersion: .*$/m, `PackageVersion: ${tag.replace(/^v/, "")}`),
  "utf8",
);

console.log(`\n已更新 ${file}`);
console.log("\n下一步：");
console.log("  1. 把 manifests/y/yubin1-0-4-6/AI-Radar/ 整个目录复制到");
console.log("     microsoft/winget-pkgs 的同名路径下");
console.log("  2. winget run Microsoft.WinGet.Lint");
console.log("  3. 提交 PR（首次提交新发布者需要 Microsoft 审核，通常 1-3 天）");