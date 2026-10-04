/**
 * 统一 HTTP 层。
 * - Tauri 环境：走 @tauri-apps/plugin-http，绕开 CORS，UA 可控。
 * - 浏览器开发环境：走 Vite proxy（同源），需要手动映射路径。
 * - Node（probe 脚本）：原生 fetch。
 */

const UA = "windows:ai-radar:1.0 (open-source desktop intel client)";

const BROWSER_PROXY: Record<string, string> = {
  "huggingface.co": "/p/huggingface.co",
  "openrouter.ai": "/p/openrouter.ai",
  "www.reddit.com": "/p/reddit.com",
  "www.anthropic.com": "/p/anthropic.com",
  "openai.com": "/p/openai.com",
  "blog.google": "/p/blog.google",
  "mistral.ai": "/p/mistral.ai",
  "news.google.com": "/p/news.google.com",
  "simonwillison.net": "/p/simonwillison.net",
  "api.github.com": "/p/github.com",
  "hn.algolia.com": "/p/algolia.com",
};

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let tauriFetch: typeof fetch | null = null;
try {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-http");
    tauriFetch = mod.fetch as unknown as typeof fetch;
  }
} catch {
  tauriFetch = null;
}

function rewrite(url: string): string {
  if (typeof window === "undefined") return url; // Node（probe 脚本）：直连
  if (isTauri()) return url;
  const host = new URL(url).host;
  const prefix = BROWSER_PROXY[host];
  return prefix ? prefix + url.slice(url.indexOf(host) + host.length) : url;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}

export interface GetOptions {
  timeoutMs?: number;
  accept?: string;
}

export async function get(url: string, opts: GetOptions = {}): Promise<string> {
  const { timeoutMs = 20000, accept } = opts;
  const doFetch = tauriFetch ?? fetch;
  const target = rewrite(url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await doFetch(target, {
      signal: ctl.signal,
      // 浏览器会忽略 User-Agent（forbidden header），dev 模式由 Vite proxy 补上
      headers: { "User-Agent": UA, Accept: accept ?? "*/*" },
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, opts: GetOptions = {}): Promise<T> {
  const raw = await get(url, { accept: "application/json", ...opts });
  return JSON.parse(raw) as T;
}