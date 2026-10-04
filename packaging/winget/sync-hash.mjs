/**
 * 用 Release 上真实产物的哈希回填 winget manifest。
 *
 * 为什么必须跑这个：本地 `tauri build` 出来的 exe 和 CI 上构建的 exe
 * 哈希不同（构建时间戳、路径都会进二进制）。manifest 里填错哈希，
 * winget 安装时会直接报 "Installer hash mismatch"。
 *
 * 不猜文件名——tauri-action 上传时会把产物名规范化（空格变点号，
 * `AI Radar_...exe` 变成 `AI.Radar_...exe`），靠猜必然 404。
 * 这里直接问 GitHub API 要真实的资产清单。
 *
 * 用法：
 *   node packaging/winget/sync-hash.mjs v0.1.0
 *   node packaging/winget/sync-hash.mjs v0.1.0 --ext msi
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(HERE, "manifests/y/yubin1-0-4-6/AI-Radar");
const REPO = "yubin1-0-4-6/AI-Radar";
const H = { Accept: "application/vnd.github+json", "User-Agent": "ai-radar-packaging" };

const tag = process.argv[2];
if (!tag) {
  console.error("用法: node packaging/winget/sync-hash.mjs <tag> [--ext exe|msi]");
  process.exit(1);
}
const extArg = process.argv.includes("--ext")
  ? process.argv[process.argv.indexOf("--ext") + 1]
  : "exe";

/** 1. 问 API 要真实资产清单 */
const relRes = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers: H });
if (!relRes.ok) {
  console.error(`查不到 tag ${tag} 的 Release：${relRes.status} ${relRes.statusText}`);
  console.error("确认 Release 已发布（不是 draft）且仓库为公开，否则匿名请求会被拒。");
  process.exit(1);
}
const rel = await relRes.json();
if (rel.draft) {
  console.error(`${tag} 仍是草稿，匿名访问拿不到资产。先解除草稿。`);
  process.exit(1);
}

console.log(`${tag} 现有资产：`);
for (const a of rel.assets) {
  console.log(`  - ${a.name}  ${(a.size / 1048576).toFixed(2)} MB`);
}

/** 2. 选出 Windows 安装器（排除自动生成的源码包） */
const win = rel.assets.filter(
  (a) => a.name.toLowerCase().endsWith(`.${extArg}`) && !/source code|\.sha256$/i.test(a.name),
);
if (!win.length) {
  console.error(`没有找到 .${extArg} 资产`);
  process.exit(1);
}
if (win.length > 1) {
  console.warn(`有 ${win.length} 个 .${extArg} 资产，取第一个：${win[0].name}`);
}
const asset = win[0];
const url = asset.browser_download_url;
console.log(`\n选中: ${asset.name}\n${url}`);

/** 3. 下载并算 SHA256 */
const binRes = await fetch(url, { headers: H });
if (!binRes.ok) {
  console.error(`下载失败 ${binRes.status} ${binRes.statusText}`);
  process.exit(1);
}
const buf = Buffer.from(await binRes.arrayBuffer());
const sha = createHash("sha256").update(buf).digest("hex");
console.log(`大小 ${buf.length} bytes\nSHA256 ${sha}`);

/** 4. 回填 manifest */
const file = join(PKG_DIR, "AI-Radar.installer.yaml");
let y = await readFile(file, "utf8");
y = y
  .replace(/^\s*#.*$/gm, "")
  .replace(/^InstallerSha256:.*$/m, `InstallerSha256: ${sha}`)
  .replace(/^InstallerUrl:.*$/m, `InstallerUrl: ${url}`);
await writeFile(file, y, "utf8");

const pv = join(PKG_DIR, "AI-Radar.yaml");
await writeFile(
  pv,
  (await readFile(pv, "utf8")).replace(
    /^PackageVersion:.*$/m,
    `PackageVersion: ${tag.replace(/^v/, "")}`,
  ),
  "utf8",
);

console.log(`\n已更新:\n  ${file}\n  ${pv}`);
console.log("\n下一步：");
console.log("  winget source update");
console.log("  winget run Microsoft.WinGet.Lint");
console.log(`  然后把 ${PKG_DIR} 整个目录复制到 microsoft/winget-pkgs 提 PR`);