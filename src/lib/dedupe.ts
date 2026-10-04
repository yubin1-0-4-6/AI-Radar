export const uid = (...parts: (string | number)[]): string =>
  parts
    .join("::")
    .toLowerCase()
    .replace(/[^a-z0-9一-龥:._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);

/** 链接归一化：去掉追踪参数与末尾斜杠，让同一文章能被稳定去重。 */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|ref_src|source|fbclid|gclid|mc_|s$|share)/i.test(k)) u.searchParams.delete(k);
    }
    return (u.origin + u.pathname + u.search).replace(/\/$/, "");
  } catch {
    return raw;
  }
}

export function dedupe<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const titleKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9一-龥]+/g, "")
    .slice(0, 72);