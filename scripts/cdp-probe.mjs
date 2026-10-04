/** 通过 WebView2 的 CDP 端口读页面真实状态，用于诊断前端是否真的跑起来了 */
const PORT = 9222;

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) {
  console.log("no page target:", JSON.stringify(targets, null, 2));
  process.exit(1);
}
console.log("target:", page.title, "|", page.url);

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
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method === "Runtime.consoleAPICalled") {
    console.log("  [console]", msg.params.type, msg.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (msg.method === "Runtime.exceptionThrown") {
    console.log("  [EXCEPTION]", msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
});

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Log.enable");

const evalExpr = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return "THREW: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

console.log("\nisTauri        :", await evalExpr('"__TAURI_INTERNALS__" in window'));
console.log("location       :", await evalExpr("location.href"));
console.log("root children  :", await evalExpr("document.getElementById('root')?.childElementCount ?? -1"));
console.log("body text      :", JSON.stringify(await evalExpr("document.body.innerText.slice(0,400)")));
console.log("localStorage   :", await evalExpr("Object.keys(localStorage).join(',') || '(empty)'"));
console.log("cards          :", await evalExpr("document.querySelectorAll('.card').length"));
console.log("status line    :", JSON.stringify(await evalExpr("document.querySelector('.top__status')?.textContent ?? ''")));
console.log("error line     :", JSON.stringify(await evalExpr("document.querySelector('.top__err')?.textContent ?? ''")));
console.log("failed sources :", await evalExpr("document.querySelectorAll('.src__led--bad').length"));
console.log("\ndirect fetch test:");
console.log(
  await evalExpr(
    'fetch("https://huggingface.co/api/models?limit=1").then(r=>"fetch ok "+r.status).catch(e=>"fetch FAIL "+e.message)',
  ),
);
console.log(
  await evalExpr(
    'import("/node_modules/.vite/deps/@tauri-apps_plugin-http.js").then(m=>"plugin-http import ok, typeof fetch="+typeof m.fetch).catch(e=>"plugin import FAIL "+e.message)',
  ),
);

ws.close();
process.exit(0);