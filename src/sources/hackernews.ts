import { getJson } from "../lib/http";
import { clip } from "../lib/xml";
import { uid } from "../lib/dedupe";
import { guessVendor, judgeLeak } from "../classify";
import type { IntelItem } from "../types";

interface Hit {
  objectID: string;
  title?: string | null;
  url?: string | null;
  story_url?: string | null;
  author?: string | null;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
  story_text?: string | null;
}

const AI = /\b(ai|llm|gpt|claude|gemini|llama|mistral|qwen|deepseek|model|transformer|diffusion|inference|agent|rag|fine-?tun|prompt|token|embedding|rag)\b/i;

/** HN 用 Algolia 搜索接口，一次拿到标题，不用逐条回源。 */
export async function fetchHackerNews(): Promise<IntelItem[]> {
  const since = Math.floor(Date.now() / 1000) - 3 * 86400;
  const url =
    "https://hn.algolia.com/api/v1/search?tags=story" +
    `&numericFilters=created_at_i%3E${since},points%3E60&hitsPerPage=80`;
  const res = await getJson<{ hits: Hit[] }>(url, { timeoutMs: 25000 });

  const out: IntelItem[] = [];
  for (const h of res.hits ?? []) {
    const title = (h.title ?? "").trim();
    if (!title) continue;
    const storyUrl = h.url || h.story_url;
    const link = storyUrl || `https://news.ycombinator.com/item?id=${h.objectID}`;
    const text = `${title} ${h.story_text ?? ""}`;
    if (!AI.test(text)) continue;
    const leak = judgeLeak(text);
    out.push({
      id: uid("hn", h.objectID),
      kind: leak.isLeak ? "leak-rumor" : "ecosystem",
      source: "hackernews",
      sourceLabel: "Hacker News",
      title,
      url: link,
      summary: clip(h.story_text ?? "", 300) || undefined,
      author: h.author ?? undefined,
      publishedAt: (h.created_at_i ?? 0) * 1000,
      confidence: leak.isLeak ? leak.confidence : undefined,
      vendor: guessVendor(text),
      stats: { points: h.points ?? 0, comments: h.num_comments ?? 0 },
      tags: ["社区热议"],
    });
  }
  return out.sort((a, b) => (b.stats?.points ?? 0) - (a.stats?.points ?? 0)).slice(0, 25);
}