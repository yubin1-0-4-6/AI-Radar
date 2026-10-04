/**
 * 对全部情报源跑真实网络验证：pnpm probe
 * 不依赖 Tauri / 浏览器，直接在 Node 里执行 src/sources 的真实适配器。
 */
import { fetchAllIntel, SOURCES } from "../src/sources/index";
import { KIND_LABEL, CONFIDENCE_LABEL } from "../src/classify";
import type { IntelKind } from "../src/types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const OFF = "\x1b[0m";

const t = Date.now();
const report = await fetchAllIntel();

console.log(`\n${BOLD}AI Radar · 源健康度${OFF}  (${report.ms}ms)\n`);
const byLabel = new Map(SOURCES.map((s) => [s.source, s.label]));
let bad = 0;
for (const r of report.results) {
  const tag = r.ok ? `${GREEN}OK  ${OFF}` : `${RED}FAIL${OFF}`;
  if (!r.ok) bad++;
  console.log(
    `  ${tag} ${(byLabel.get(r.source) ?? r.source).padEnd(24)} ` +
      `${String(r.count).padStart(4)} 条  ${DIM}${r.ms}ms${OFF}` +
      (r.error ? `  ${RED}${r.error}${OFF}` : ""),
  );
}

const counts = new Map<IntelKind, number>();
for (const i of report.items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);

console.log(`\n${BOLD}分类分布${OFF}  共 ${report.items.length} 条`);
for (const k of [...counts.keys()].sort()) {
  console.log(`  ${CYAN}${KIND_LABEL[k].padEnd(14)}${OFF} ${counts.get(k)}`);
}

const leaks = report.items.filter((i) => i.kind === "leak-rumor");
if (leaks.length) {
  console.log(`\n${BOLD}${YELLOW}泄漏 / 匿名内测线索${OFF} (${leaks.length})`);
  for (const i of leaks.slice(0, 12)) {
    const c = i.confidence !== undefined ? CONFIDENCE_LABEL[i.confidence] : "-";
    console.log(`  [${c}] ${i.title}`);
    console.log(`      ${DIM}${i.sourceLabel} · ${new Date(i.publishedAt).toISOString().slice(0, 10)}${OFF}`);
  }
}

const free = report.items.filter((i) => i.kind === "model-free");
if (free.length) {
  console.log(`\n${BOLD}${GREEN}免费可用模型${OFF} (${free.length})`);
  for (const i of free.slice(0, 12)) {
    console.log(`  ${i.title}  ${DIM}${i.model?.contextLength ? Math.round(i.model.contextLength / 1000) + "k ctx" : ""}${OFF}`);
  }
}

const recent = report.items.filter((i) => Date.now() - i.publishedAt < 3 * 86400e3);
console.log(`\n${BOLD}近 3 天${OFF}: ${recent.length} 条`);

console.log(
  `\n${bad === 0 ? GREEN : YELLOW}${report.results.length - bad}/${report.results.length} 源可用${OFF} · 总耗时 ${((Date.now() - t) / 1000).toFixed(1)}s\n`,
);
process.exit(bad === 0 ? 0 : 1);