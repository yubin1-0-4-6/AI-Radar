import { get } from "../lib/http";
import { parseFeed, stripTags, clip } from "../lib/xml";
import { uid } from "../lib/dedupe";
import { guessVendor, judgeFree, judgeLeak, judgeRelease } from "../classify";
import type { IntelItem, SourceId } from "../types";

/**
 * Google News RSS 定向查询。
 * 存在的意义：DeepSeek / Moonshot / 智谱 / MiniMax 等厂商没有可用官方 feed，
 * 但它们的发布与泄漏传闻都会被媒体报道，这条线补上了"全世界"覆盖面。
 * 链接是 news.google.com 的跳转地址，点击后在外部浏览器打开可正常到达原文。
 */
interface Query {
  id: SourceId;
  label: string;
  q: string;
  days: number;
  limit: number;
  locale: "zh-CN" | "en-US";
}

/**
 * 查询串是实测调出来的：Google News 对 OR 的处理很脆弱，
 * 例如 "内测 大模型 OR 灰度 公测" 会把结果从 36 条压到 1 条，所以保持单主题短查询。
 */
const QUERIES: Query[] = [
  { id: "zhipu", label: "匿名内测·中文", q: "内测 大模型", days: 7, limit: 30, locale: "zh-CN" },
  { id: "moonshot", label: "模型泄漏·中文", q: "大模型 泄漏", days: 14, limit: 20, locale: "zh-CN" },
  { id: "deepseek", label: "国产模型发布", q: "大模型 发布", days: 5, limit: 30, locale: "zh-CN" },
  {
    id: "minimax",
    label: "匿名内测·英文",
    q: "AI model internal testing OR anonymous beta AI",
    days: 7,
    limit: 30,
    locale: "en-US",
  },
  {
    id: "openai",
    label: "开源模型发布",
    q: "open source AI model release OR new LLM launch",
    days: 3,
    limit: 30,
    locale: "en-US",
  },
  {
    id: "simonwillison",
    label: "免费可用模型",
    q: "free AI model API OR open weights model",
    days: 7,
    limit: 25,
    locale: "en-US",
  },
];

const LOCALE: Record<Query["locale"], [string, string, string]> = {
  "zh-CN": ["zh-CN", "CN", "CN:zh-Hans"],
  "en-US": ["en-US", "US", "US:en"],
};

const feedUrl = (q: string, days: number, locale: Query["locale"]): string => {
  const [hl, gl, ceid] = LOCALE[locale];
  return (
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}` +
    `&hl=${hl}&gl=${gl}&ceid=${ceid}`
  );
};

/** Google News 标题形如「正文标题 - 媒体名」 */
function splitTitle(raw: string): { title: string; outlet?: string } {
  const i = raw.lastIndexOf(" - ");
  return i > 8
    ? { title: raw.slice(0, i).trim(), outlet: raw.slice(i + 3).trim() }
    : { title: raw.trim() };
}

export async function fetchGoogleNews(): Promise<IntelItem[]> {
  const floor = Date.now() - 15 * 86400e3;
  const settled = await Promise.allSettled(
    QUERIES.map(async (spec) => {
      const entries = parseFeed(await get(feedUrl(spec.q, spec.days, spec.locale), { timeoutMs: 25000 }));
      return entries
        .filter((e) => e.publishedAt >= floor)
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, spec.limit)
        .map<IntelItem>((e) => {
          const { title, outlet } = splitTitle(e.title);
          const text = `${title} ${e.summary}`;
          const leak = judgeLeak(text);
          const free = judgeFree(text);
          return {
            id: uid("gnews", e.link || title),
            kind: leak.isLeak ? "leak-rumor" : free ? "model-free" : judgeRelease(text) ? "vendor" : "ecosystem",
            source: spec.id,
            sourceLabel: `${spec.label} · ${outlet ?? "Google News"}`,
            title,
            url: e.link,
            summary: clip(stripTags(e.summary), 260) || undefined,
            publishedAt: e.publishedAt,
            confidence: leak.isLeak ? leak.confidence : undefined,
            vendor: guessVendor(text),
            tags: ["媒体报道"],
          };
        });
    }),
  );

  const out: IntelItem[] = [];
  const errs: string[] = [];
  settled.forEach((r) => {
    if (r.status === "fulfilled") out.push(...r.value);
    else errs.push(String(r.reason?.message ?? r.reason));
  });
  if (!out.length && errs.length) throw new Error(errs.join("; "));
  return out;
}