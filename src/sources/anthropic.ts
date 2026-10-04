import { get } from "../lib/http";
import { clip, stripTags } from "../lib/xml";
import { canonicalUrl, uid } from "../lib/dedupe";
import { judgeLeak } from "../classify";
import type { IntelItem } from "../types";

/**
 * Anthropic 没有官方 RSS，但其 /news 页面是服务端渲染的，
 * 卡片结构稳定，一条正则即可拿到 href + 日期 + 主题 + 标题。
 */
const CARD =
  /<a href="(\/news\/[a-z0-9-]+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
const TIME = /<time[^>]*>([^<]*)<\/time>/i;
const SUBJ = /subject[^>]*>([^<]*)</i;
const TITLE = /title[^>]*>([^<]*)</i;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseHumanDate(raw: string): number {
  const m = raw.trim().match(/([A-Za-z]{3})\w*\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return Date.now();
  const mo = MONTHS[m[1]!.toLowerCase()];
  if (mo === undefined) return Date.now();
  return new Date(Number(m[3]), mo, Number(m[2])).getTime();
}

export async function fetchAnthropic(): Promise<IntelItem[]> {
  const html = await get("https://www.anthropic.com/news", {
    accept: "text/html",
    timeoutMs: 25000,
  });
  const out: IntelItem[] = [];
  const seen = new Set<string>();
  CARD.lastIndex = 0;
  for (let m = CARD.exec(html); m; m = CARD.exec(html)) {
    const href = m[1]!;
    const inner = m[2]!;
    const title = stripTags(inner.match(TITLE)?.[1] ?? "").trim();
    if (!title || seen.has(href)) continue;
    seen.add(href);
    const date = parseHumanDate(inner.match(TIME)?.[1] ?? "");
    const subject = clip(stripTags(inner.match(SUBJ)?.[1] ?? "").trim(), 40);
    const url = canonicalUrl("https://www.anthropic.com" + href);
    const leak = judgeLeak(title);
    out.push({
      id: uid("anthropic", url),
      kind: leak.isLeak ? "leak-rumor" : "vendor",
      source: "anthropic",
      sourceLabel: "Anthropic News",
      title,
      url,
      summary: subject || undefined,
      publishedAt: date,
      confidence: leak.isLeak ? leak.confidence : undefined,
      vendor: "Anthropic",
      tags: subject ? [subject] : undefined,
    });
  }
  return out;
}