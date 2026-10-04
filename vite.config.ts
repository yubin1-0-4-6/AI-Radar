import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 浏览器 dev 模式下，所有情报源统一走同源 proxy，两个原因：
 *  1. 这些站点大多不返回 CORS 头，浏览器直接发会被拦；
 *  2. fetch 禁止自定义 User-Agent（forbidden header），而 Reddit / Anthropic
 *     这类站点会按 UA 做风控，必须由 proxy 在服务端侧改写。
 * 打包成 Tauri 后由 tauri-plugin-http 承担这两件事，proxy 只服务于 `pnpm dev`。
 */
const UA = "windows:ai-radar:1.0 (open-source desktop intel client)";

const TARGETS: Record<string, string> = {
  "huggingface.co": "https://huggingface.co",
  "openrouter.ai": "https://openrouter.ai",
  "reddit.com": "https://www.reddit.com",
  "anthropic.com": "https://www.anthropic.com",
  "openai.com": "https://openai.com",
  "blog.google": "https://blog.google",
  "mistral.ai": "https://mistral.ai",
  "news.google.com": "https://news.google.com",
  "simonwillison.net": "https://simonwillison.net",
  "github.com": "https://api.github.com",
  "algolia.com": "https://hn.algolia.com",
};

const proxy = Object.fromEntries(
  Object.entries(TARGETS).map(([host, target]) => [
    `/p/${host}`,
    {
      target,
      changeOrigin: true,
      headers: { "User-Agent": UA },
      // connect 挂载 middleware 时可能已剥掉前缀，两种情况都兜住
      rewrite: (s: string) => s.replace(new RegExp(`^/p/${host.replace(/\./g, "\\.")}`), ""),
    },
  ]),
);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5180,
    strictPort: true,
    proxy,
    // Rust 编译产物在 src-tauri/target 里，Windows 上文件锁会让 watcher 直接 EBUSY 崩掉
    watch: { ignored: ["**/src-tauri/target/**", "**/dist/**"] },
  },
  build: { target: "chrome110", outDir: "dist", emptyOutDir: true },
});