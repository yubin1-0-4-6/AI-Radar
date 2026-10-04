import { canonicalUrl, dedupe, titleKey } from "../lib/dedupe";
import type { FetchReport, IntelItem, SourceId, SourceResult } from "../types";
import { FEEDS, fetchFeed } from "./rss";
import { fetchAnthropic } from "./anthropic";
import { fetchHuggingFace } from "./huggingface";
import { fetchOpenRouter } from "./openrouter";
import { fetchHackerNews } from "./hackernews";
import { fetchReddit } from "./reddit";
import { fetchGitHub } from "./github";
import { fetchGoogleNews } from "./googlenews";

type Fetcher = () => Promise<IntelItem[]>;

interface Entry {
  source: SourceId;
  label: string;
  run: Fetcher;
  /** 默认是否开启 */
  on: boolean;
}

export const SOURCES: Entry[] = [
  ...FEEDS.map((f) => ({ source: f.id, label: f.label, run: () => fetchFeed(f), on: true })),
  { source: "anthropic", label: "Anthropic News", run: fetchAnthropic, on: true },
  { source: "huggingface", label: "HuggingFace 模型", run: fetchHuggingFace, on: true },
  { source: "openrouter", label: "OpenRouter 免费模型", run: fetchOpenRouter, on: true },
  { source: "hackernews", label: "Hacker News", run: fetchHackerNews, on: true },
  { source: "reddit-localllama", label: "Reddit 本地模型/泄漏线索", run: fetchReddit, on: true },
  { source: "github", label: "GitHub 开源项目", run: fetchGitHub, on: true },
  { source: "deepseek", label: "Google News · 国产大模型", run: fetchGoogleNews, on: true },
];

export type SourceToggle = Partial<Record<SourceId, boolean>>;

export interface FetchOptions {
  enabled?: Set<SourceId>;
  /** 同一事件被多个源转载时合并 */
  mergeDuplicates?: boolean;
}

/** 一键拉取：所有源并发跑，单源失败不影响整体。 */
export async function fetchAllIntel(opts: FetchOptions = {}): Promise<FetchReport> {
  const t0 = Date.now();
  const list = opts.enabled
    ? SOURCES.filter((s) => opts.enabled!.has(s.source))
    : SOURCES;

  const settled = await Promise.all(
    list.map(async (s): Promise<{ r: SourceResult; items: IntelItem[] }> => {
      const t = Date.now();
      try {
        const items = await s.run();
        return { r: { source: s.source, ok: true, count: items.length, ms: Date.now() - t }, items };
      } catch (e) {
        return {
          r: {
            source: s.source,
            ok: false,
            count: 0,
            ms: Date.now() - t,
            error: e instanceof Error ? e.message : String(e),
          },
          items: [],
        };
      }
    }),
  );

  const results = settled.map((x) => x.r);
  let items = settled.flatMap((x) => x.items);

  // 摘要常常就是标题本身（Google News 还会再缀上媒体名），留着只会重复显示一遍
  for (const i of items) {
    if (!i.summary) continue;
    const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}]/gu, "");
    const a = norm(i.summary);
    const t = norm(i.title);
    if (a.length < 12 || t.includes(a) || a.includes(t)) i.summary = undefined;
  }

  if (opts.mergeDuplicates !== false) {
    items = dedupe(items, (i) => canonicalUrl(i.url) || titleKey(i.title));
  }

  items.sort((a, b) => b.publishedAt - a.publishedAt);
  return { items, results, ms: Date.now() - t0 };
}

export type { Entry as SourceEntry };