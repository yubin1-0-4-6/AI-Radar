/** 极简 RSS 2.0 / Atom 解析器（零依赖）。容忍不规范的现实世界 feed。 */

export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  author?: string;
  publishedAt: number;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
  "#x2F": "/",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z#0-9]+);/g, (m, name) => ENTITIES[name] ?? m);
}

function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** Google News 标题会塞入一批零宽字符做防抓取，必须清掉 */
const INVISIBLE = /[\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

const stripMarkup = (s: string): string =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

const tidy = (s: string): string =>
  s
    .replace(INVISIBLE, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

/**
 * Atom feed 经常把 HTML 双重转义成 &lt;p&gt;，只剥一次标签会把标签当正文显示出来，
 * 所以"解码 → 剥标签"要跑两轮。
 */
export function stripTags(html: string): string {
  return tidy(stripMarkup(decodeEntities(stripMarkup(decodeEntities(html)))));
}

export function clip(s: string, max = 400): string {
  const t = tidy(s);
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function pick(block: string, ...tags: string[]): string | undefined {
  for (const tag of tags) {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (m) return unwrapCdata(m[1]);
  }
  return undefined;
}

/** RSS 里 CDATA 很常见，先剥壳再剥标签，否则整段会被当成一个标签删掉。 */
export function unwrapCdata(raw: string): string {
  const t = raw.trim();
  return t.startsWith("<![CDATA[") && t.endsWith("]]>")
    ? t.slice(9, -3)
    : t;
}

/** Atom 的 href 属性形式 */
function atomLink(block: string): string | undefined {
  const m = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m?.[1];
}

export function parseDate(raw: string | undefined): number {
  if (!raw) return Date.now();
  const t = Date.parse(raw.trim());
  if (!Number.isNaN(t)) return t;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
}

export function parseFeed(xml: string): FeedEntry[] {
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []),
  ];
  const out: FeedEntry[] = [];
  for (const b of blocks) {
    const rawTitle = pick(b, "title");
    if (!rawTitle) continue;
    const title = stripTags(rawTitle);
    if (!title) continue;
    const link =
      atomLink(b)?.trim() ||
      pick(b, "link", "guid")?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() ||
      pick(b, "id")?.trim() ||
      "";
    const body = pick(b, "content:encoded", "content", "description", "summary");
    out.push({
      title,
      link: link.startsWith("http") ? link : "",
      summary: body ? clip(stripTags(body)) : "",
      author: pick(b, "dc:creator", "author")?.replace(/<[^>]+>/g, "").trim() || undefined,
      publishedAt: parseDate(pick(b, "pubDate", "published", "updated", "dc:date")),
    });
  }
  return out;
}