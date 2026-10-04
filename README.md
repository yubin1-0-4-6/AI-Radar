# AI Radar · 全球 AI 情报雷达

一键拉取全球 AI 最新情报：**新发布模型** / **免费可用模型** / **泄漏与匿名内测线索**，
外加官方发布与开源生态。Tauri + React 桌面应用，托盘常驻。

## 关于"匿名内测模型"的诚实说明

不存在"全球匿名内测模型"的权威接口——未发布的模型不会出现在任何公开 API 里。
本应用能提供的是**可验证的公开痕迹**，并对每一条标注可信度：

| 标记 | 含义 | 数据来源 |
|---|---|---|
| `未发布权重` | 仓库名含 `preview/internal/alpha/ngl/codename` 等未发布标记，或带 `ngl` 标签 | HuggingFace API |
| `有说法·未证实` | 社区/媒体出现明确说法但无官方确认 | Reddit、HN、Google News |
| `有证据·多源印证` | 命中权重/截图/多源交叉描述 | 同上 |

这些**不是厂商官方确认**，UI 上会一直显示。把它当线索雷达，不当新闻源。

## 数据源（13 个，全部实测通过，单轮约 2 秒）

| 源 | 覆盖 |
|---|---|
| HuggingFace API | 热门模型 / 新上传模型 / 未发布权重线索 |
| OpenRouter API | 免费可调用模型（prompt 与 completion 定价均为 0）+ 新上架 |
| Anthropic News | 官方发布（无 RSS，解析服务端渲染页面） |
| OpenAI / Google AI / Mistral / HuggingFace Blog 官方 RSS | 官方发布 |
| Simon Willison | 独立评测与观察 |
| Hacker News（Algolia） | 社区热议 |
| Reddit r/LocalLLaMA / r/MachineLearning / r/singularity | 本地模型与泄漏讨论 |
| GitHub Search | 近期新出现的 AI 开源项目 |
| Google News RSS（6 组定向查询，中英双语） | 国产模型动态、**内测**、**泄漏**、免费可用 |

已实测不可用并已替换的方案：DeepSeek / Moonshot / 智谱 / MiniMax 的 `rss.xml`
返回的是前端渲染 HTML，Qwen 的 `index.xml` 停更一年以上——统一改由 Google News 覆盖。

### 已下线的板块

- **论文 / arXiv**（`cs.AI`、`cs.CL`、`cs.LG`）暂时移除。
  恢复只需三步：`src/types.ts` 的 `IntelKind` 加回 `"paper"`、`SourceId` 加回 `"arxiv"`；
  `src/classify.ts` 的 `KIND_LABEL`、`src/ui/Sidebar.tsx` 的 `ORDER` 与 `DOT`、
  `src/ui/ItemCard.tsx` 的 `KIND_STYLE` 各加一行；再把 `fetchArxiv` 注册进
  `src/sources/index.ts` 的 `SOURCES` 并补回适配器文件。

## 运行

```bash
npm install
npm run probe     # 对全部源跑真实网络验证，打印健康度报告
npm run dev       # 浏览器预览模式（无托盘/通知）
npm run app       # 桌面应用（Tauri）
npm run app:build # 打包 Windows 安装包（nsis + msi）
```

已构建产物：

```
src-tauri/target/release/bundle/nsis/AI Radar_0.1.0_x64-setup.exe   (2.3 MB)
src-tauri/target/release/bundle/msi/AI Radar_0.1.0_x64_en-US.msi    (3.2 MB)
```

桌面模式依赖 Rust（本机已装 rustc 1.99.0）。若需重装：

```powershell
winget install --id Rustlang.Rustup -e --source winget
```

### 桌面端排查

```bash
npm run app:cdp                # 带 WebView2 调试端口启动
node scripts/cdp-probe.mjs     # 从运行中的页面读真实状态（源成功率、DOM、报错）
```

正式配置**不带**调试端口（`src-tauri/tauri.conf.json`），
需要时用 `src-tauri/tauri.cdp.json` 叠加启用。

### 已知限制

- `pnpm dev` 浏览器预览下 **Mistral 源会失败**：Vite dev proxy 对该路径有异常行为。
  桌面模式走 `tauri-plugin-http` 直连，不受影响（`npm run probe` 里始终正常）。
- Google News 的条目链接是 `news.google.com` 跳转地址，点击后在系统浏览器打开可正常到达原文。
- Reddit 按 UA 做风控，必须用唯一 User-Agent（见 `src/lib/http.ts`），
  高频刷新可能触发临时限流，下次刷新会自动恢复。

## 踩过的坑（都已在代码里注释）

1. **`tauri-plugin-http` 的 `http:default` 不放开任何 origin**，只启用 fetch 能力。
   不在 capability 里显式写 `allow: [{ "url": "https://**" }]`，运行时所有请求都会报
   `url not allowed on the configured scope`。
2. **RSS 的 `<title><![CDATA[...]]></title>`** 会被朴素的剥标签逻辑整段吃掉，
   必须先剥 CDATA 壳（`src/lib/xml.ts` 的 `unwrapCdata`）。
3. **Atom feed 双重转义**（`&lt;p&gt;`）：只剥一次标签会把标签当正文显示，
   "解码 → 剥标签"要跑两轮。
4. **Google News 标题里塞零宽字符**做防抓取，必须显式清除。
5. **Google News 对 `OR` 的处理很脆弱**：`内测 大模型` 返回 36 条，
   `内测 大模型 OR 灰度 公测` 只剩 1 条。查询串是逐条实测调出来的。
6. **Vite 的 watcher 会盯到 `src-tauri/target/`**，Windows 上文件锁直接 `EBUSY` 崩掉，
   必须在 `server.watch.ignored` 里排除。
7. **GitHub 用 `pushed_at` 当时间戳会让老仓库永远排第一**，必须用 `created_at`
   并把时间过滤下推给 GitHub 服务端（`created:>`）。

## 结构

```
src/
  lib/http.ts          统一 HTTP（Tauri / 浏览器 proxy / Node 三态）
  lib/xml.ts           零依赖 RSS 2.0 + Atom 解析（含 CDATA、零宽字符）
  sources/             各情报源适配器，一个源一个文件
  classify.ts          分类引擎：泄漏信号强度、免费判定、厂商识别
  store.ts             本地持久化（已读 / 收藏 / 设置）
  shell.ts             托盘、通知、外部链接（Tauri 能力入口）
scripts/
  probe.ts             真实网络健康度验证
  make-icon.mjs        零依赖生成应用图标
src-tauri/             托盘常驻 / 角标 / 通知 / 外部链接白名单
```

数据全部在本地，不上传任何内容。