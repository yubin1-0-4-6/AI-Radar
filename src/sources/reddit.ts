import { get } from "../lib/http";
import { clip, parseFeed, stripTags } from "../lib/xml";
import { canonicalUrl, uid } from "../lib/dedupe";
import { guessVendor, judgeFree, judgeLeak } from "../classify";
import type { IntelItem, SourceId } from "../types";

/**
 * 泄漏 / 匿名内测线索的主战场。
 * Reddit 的 .json 接口对第三方客户端全站 403，但 .rss 可用 —— 必须用唯一 User-Agent，
 * 见 lib/http.ts 里的 UA。
 */
const SUBS: { sub: string; sort: "hot" | "new"; id: SourceId; label: string }[] = [
  { sub: "LocalLLaMA", sort: "hot", id: "reddit-localllama", label: "r/LocalLLaMA · 热门" },
  { sub: "LocalLLaMA", sort: "new", id: "reddit-localllama", label: "r/LocalLLaMA · 最新" },
  { sub: "MachineLearning", sort: "hot", id: "reddit-singularity", label: "r/MachineLearning" },
  { sub: "singularity", sort: "hot", id: "reddit-singularity", label: "r/singularity" },
];

const url = (sub: string, sort: "hot" | "new") =>
  `https://www.reddit.com/r/${sub}/${sort}/.rss?limit=50`;

async function one(sub: string, sort: "hot" | "new", spec: (typeof SUBS)[number]) {
  const entries = parseFeed(await get(url(sub, sort), { timeoutMs: 20000 }));
  return entries.map((e) => {
    const link = e.link.split("?")[0]!;
    const text = `${e.title} ${e.summary}`;
    const leak = judgeLeak(text);
    const free = judgeFree(text);
    return {
      id: uid("reddit", link || e.title),
      kind: leak.isLeak ? ("leak-rumor" as const) : free ? ("model-free" as const) : ("ecosystem" as const),
      source: spec.id,
      sourceLabel: spec.label,
      title: e.title,
      url: canonicalUrl(link),
      summary: clip(stripTags(e.summary), 400) || undefined,
      author: e.author,
      publishedAt: e.publishedAt,
      confidence: leak.isLeak ? leak.confidence : undefined,
      vendor: guessVendor(text),
      tags: [sort === "new" ? "最新" : "热门"],
    } satisfies IntelItem;
  });
}

export async function fetchReddit(): Promise<IntelItem[]> {
  const settled = await Promise.allSettled(SUBS.map((s) => one(s.sub, s.sort, s)));
  const out: IntelItem[] = [];
  const errs: string[] = [];
  settled.forEach((r) => {
    if (r.status === "fulfilled") out.push(...r.value);
    else errs.push(String(r.reason?.message ?? r.reason));
  });
  if (!out.length && errs.length) throw new Error(errs.join("; "));
  // 线索类优先，其余按时间取前 60 条，避免社区灌水挤掉重点
  return [...out].sort((a, b) => {
    const rank = (x: typeof a) => (x.kind === "leak-rumor" ? 2 : x.kind === "model-free" ? 1 : 0);
    return rank(b) - rank(a) || b.publishedAt - a.publishedAt;
  }).slice(0, 60);
}