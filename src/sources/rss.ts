import { get } from "../lib/http";
import { parseFeed } from "../lib/xml";
import { canonicalUrl, uid } from "../lib/dedupe";
import { judgeFree, judgeLeak } from "../classify";
import type { IntelItem, SourceId } from "../types";

export interface FeedSpec {
  id: SourceId;
  label: string;
  url: string;
  /** 官方源默认不算"泄漏"，除非命中信号 */
  vendor?: string;
}

/**
 * 已实测可用的官方源。
 * DeepSeek / Moonshot / 智谱 / MiniMax 的 "rss.xml" 实际返回前端渲染的 HTML，
 * Qwen 的 blog index.xml 已停更一年以上，均已改由 Google News 定向查询覆盖
 * （见 googlenews.ts）。
 */
export const FEEDS: FeedSpec[] = [
  { id: "openai", label: "OpenAI News", url: "https://openai.com/news/rss.xml", vendor: "OpenAI" },
  { id: "google", label: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", vendor: "Google" },
  { id: "mistral", label: "Mistral AI", url: "https://mistral.ai/rss.xml", vendor: "Mistral" },
  { id: "hf-blog", label: "HuggingFace Blog", url: "https://huggingface.co/blog/feed.xml" },
  { id: "simonwillison", label: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
];

/** 每个 feed 只保留近期内容并限量，避免历史存档塞满界面 */
export const FEED_MAX_AGE_DAYS = 21;
export const FEED_LIMIT = 25;

export async function fetchFeed(spec: FeedSpec): Promise<IntelItem[]> {
  const raw = await get(spec.url, {
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    timeoutMs: 25000,
  });
  const floor = Date.now() - FEED_MAX_AGE_DAYS * 86400e3;
  const entries = parseFeed(raw)
    .filter((e) => e.publishedAt >= floor)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, FEED_LIMIT);
  const out: IntelItem[] = [];
  for (const e of entries) {
    const url = e.link || `${spec.url}#${e.title}`;
    const text = `${e.title} ${e.summary}`;
    const leak = judgeLeak(text);
    const free = judgeFree(text);
    out.push({
      id: uid("feed", spec.id, canonicalUrl(url) || e.title),
      kind: leak.isLeak ? "leak-rumor" : free ? "model-free" : "vendor",
      source: spec.id,
      sourceLabel: spec.label,
      title: e.title,
      url: canonicalUrl(url),
      summary: e.summary || undefined,
      author: e.author,
      publishedAt: e.publishedAt,
      confidence: leak.isLeak ? leak.confidence : undefined,
      vendor: spec.vendor,
    });
  }
  return out;
}