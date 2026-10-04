/** 从运行中的桌面应用（WebView2 CDP）直接抓图，得到的是桌面端真实渲染结果 */
import { writeFileSync } from "node:fs";

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) {
  console.error("no page target:", JSON.stringify(targets));
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
await new Promise((r) => ws.addEventListener("open", r));

// 等数据拉完再截，避免拍到加载态
const evalExpr = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};
for (let i = 0; i < 60; i++) {
  const n = await evalExpr("document.querySelectorAll('.card').length");
  if (n > 10) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const info = await evalExpr(
  "JSON.stringify({cards:document.querySelectorAll('.card').length, status:document.querySelector('.top__status')?.textContent?.trim()})",
);
console.log("page state:", info);

// 视口拉到 1440x960，截图更有展示力；scale 1.5 是清晰度与体积的平衡点
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 960,
  deviceScaleFactor: Number(process.argv[3] ?? 1.5),
  mobile: false,
});
await new Promise((r) => setTimeout(r, 1200));
// 回到顶部，保证标题栏与搜索框完整入镜
await evalExpr("document.querySelector('.main').scrollTo(0,0); window.scrollTo(0,0); true");
await new Promise((r) => setTimeout(r, 600));

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
const out = process.argv[2] ?? "docs/screenshot.png";
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`saved ${out} (${(Buffer.from(shot.data, "base64").length / 1024).toFixed(0)} KB)`);

ws.close();
process.exit(0);