# 贡献指南

感谢你考虑为 AI Radar 贡献。这个项目是**桌面应用 + 情报抓取**两部分，抓取部分最容易出问题，所以特别欢迎修 bug、加情报源。

不管你打算改一行字还是加一个新数据源，下面几节都能用上。

---

## 提问与讨论

| 想做什么 | 去哪 |
|---|---|
| 问「这个功能怎么用」 | [Discussions](https://github.com/yubin1-0-4-6/AI-Radar/discussions) |
| 报 bug / 提功能建议 | [Issues](https://github.com/yubin1-0-4-6/AI-Radar/issues) |
| 报安全问题 | 见下方「报告安全问题」 |

提问前请先搜一遍 Discussions——常见问题多半已经有人问过了。

---

## 报告 Bug

### 先搜已有 Issue

包括已关闭的。重复报告会让修复进度变慢。

### 一份有用的报告包含什么

1. **你的系统**：Windows 版本、架构（x64 / ARM）
2. **AI Radar 版本**：关于对话框里能看到；不确定就填 `?`
3. **复现步骤**：从哪一步开始、做了什么、期望什么
4. **实际结果**：报错文字请**完整贴出**，不要只写「报错了」
5. **截图**：如果有界面问题

### 抓取类问题请额外提供

情报源相关的问题最有价值的是**哪一步坏了**。本地跑一次自检：

```powershell
npm run probe
```

它会逐个源打印成功/失败和耗时。把输出贴进 Issue，能省掉一轮来回。

如果只有某一个源失败，请写明**源名**和错误信息。抓取逻辑有大量平台差异的兜底，所以偶尔某个源会失效——这不是你的问题，我们想修。

---

## 报告安全问题

**请不要用公开 Issue 报告安全漏洞。** 通过 <https://github.com/yubin1-0-4-6/AI-Radar/security/advisories/new> 私下报告，我们会先修复再公开。

---

## 提功能建议

先开 Issue 讨论，**别直接写代码**。尤其是改分类逻辑或加数据源——这两块和现有实现耦合较深，先对齐方向能省你不少时间。

描述里请说明：想解决什么使用场景。需求越具体越好判断。

---

## 贡献代码

### 环境准备

需要：

| 工具 | 版本 | 说明 |
|---|---|---|
| [Node.js](https://nodejs.org/) | 20 或更高 | 前端与打包脚本 |
| [Rust](https://rustup.rs/) | 1.77 或更高 | 桌面外壳。Windows 还要装 [MSVC C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（Tauri 需要它链接） |
| [Git](https://git-scm.com/) | 任意 | |

Windows 上用 PowerShell 即可，不需要额外终端配置。

### 拉取与安装

```powershell
git clone https://github.com/yubin1-0-4-6/AI-Radar.git
cd AI-Radar
npm install
```

> 除非换了依赖或删了 `node_modules`，否则不用重复跑 `npm install`。

### 本地运行

```powershell
npm run dev      # 浏览器预览，改前端自动热更新
npm run app      # 桌面版（含托盘、通知），改代码需重启
npm run app:build  # 打包 Windows 安装包
```

**改 Rust 代码前先关掉正在运行的程序**——它是托盘常驻的，exe 被占用会导致打包报 `os error 32`：

```powershell
Get-Process ai-radar -ErrorAction SilentlyContinue | Stop-Process -Force
```

### 提交前的检查

项目**没有单元测试**，目前的把关手段是两个，请都跑一遍：

```powershell
npm run typecheck   # TypeScript 类型检查，必须无报错
npm run probe       # 联网自检 12 个情报源，必须全部可用
```

`npm run probe` 要求外网连通。如果你在离线环境跑，它会全部报失败，属正常现象。

改动界面请顺手看一眼浏览器窄屏（< 820px）下是否正常，侧栏会收起。

### 代码约定

- **TypeScript 开了 `strict`**，别用 `any` 绕过类型检查；确实需要时写注释说明原因
- **不要引入新依赖**，除非现有方案真的做不到。加之前先在 Issue 里说明理由——维护成本是长期负担
- **PowerShell 脚本必须保持纯 ASCII**（不含中文字符）。PowerShell 5.1 会按系统 ANSI 码页解码无 BOM 的 `.ps1`，非 ASCII 字符会直接把语法解析搞崩
- 数据源适配器保持**一个源一个文件**，实现 `(source: SourceId) => Promise<IntelItem[]>`
- 新增源必须遵守源码里已有的约定，包括**用唯一 User-Agent**（部分站点按 UA 做风控，见 `src/lib/http.ts`）

### 提交信息规范

用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>: <简短说明>

type 取值：
  feat        新功能
  fix         修 bug
  docs        只改文档
  refactor    重构，行为不变
  chore       配置、脚本、依赖等
  perf        性能
```

例子：

```
feat: 加一个 Leak / 无证据 过滤开关
fix: 标题里的中文变成乱码
chore(packaging): 同步 v0.1.2 的安装器哈希
```

破坏性变更加 `!`，如 `feat(api)!: 重命名某个导出`。

---

## 提交 Pull Request

1. 从 `main` 切一个新分支：`git checkout -b feat/my-change`
2. 改动 → 跑上面两个检查 → commit → `git push -u origin feat/my-change`
3. 开 PR，标题沿用提交信息规范

**PR 描述请写清三件事**：改了什么、为什么、怎么验证的。

### 提交前自查

- [ ] `npm run typecheck` 无报错
- [ ] `npm run probe` 源全通（或说明为何不通）
- [ ] 新增情报源已在 `src/sources/index.ts` 注册，且 README 数据源表格已更新
- [ ] 没有把 `dist/`、`src-tauri/target/`、`node_modules/` 提交进来
- [ ] 没有密钥、token、个人路径
- [ ] 改动只涉及一个主题

---

## 关于 AI 辅助

这个项目大量使用 AI agent 协助开发，**完全接受 AI 产出的 PR**，不要求标注。

两点请注意：

1. **你自己要能解释这处改动**。评审时大概率会问动机，答不上来的 PR 很难被合并。
2. **不要为了让检查通过而放宽检查**。比如把 `typecheck` 改成非严格模式、把源失败静默吞掉——这类改动会被直接拒绝。

提交前请自己跑一遍 `npm run typecheck` 和 `npm run probe`，不要依赖 agent 声称跑过了。

---

## 维护者发版流程

> 仅维护者需要。外部贡献者到「提交 PR」为止即可，发版由维护者处理。

**推代码 ≠ 用户能拿到新版安装包。** 只有打 tag 才会触发自动化打包。

```powershell
node scripts/bump-version.mjs 0.1.2     # 四处版本号一次改齐
npm run typecheck && npm run probe
git add -A && git commit -m "feat: 0.1.2"

git tag -a v0.1.2 -m "0.1.2 说明"
git push origin main && git push origin v0.1.2
```

等 6–8 分钟，确认 <https://github.com/yubin1-0-4-6/AI-Radar/actions> 变绿，
且 <https://github.com/yubin1-0-4-6/AI-Radar/releases> 下 exe 和 deb 都在。

### winget 哈希必须同步

**这一步绝对不能漏。** 每次重新构建产出的 exe 哈希都不同（构建时间戳、绝对路径会写进二进制），
不同步的话 `winget install` 会直接报 `Installer hash mismatch` 失败：

```powershell
node packaging/winget/sync-hash.mjs v0.1.2
git add packaging/winget && git commit -m "chore(packaging): 同步 v0.1.2 哈希" && git push
```

版本号要改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` **四个文件**，
漏掉 `Cargo.lock` 会让 CI 的 `--locked` 构建失败，所以务必用脚本。

已经发出的 tag 不要用 `--force` 覆盖，那会让安装包和代码对不上。

---

## 排查桌面版

正式配置**不带**调试端口，需要时用叠加配置启用：

```powershell
npm run app:cdp                                   # 带 WebView2 调试端口启动
node scripts/cdp-probe.mjs                        # 读页面真实状态：源成功率、DOM、报错
node scripts/capture-screenshot.mjs out.png 1.5 leak  # 从桌面端截图（分类可选）
```

---

## 已知需要人工介入的环节

| 环节 | 说明 |
|---|---|
| winget 首次审核 | Microsoft 人工审查，1–3 个工作日。之后走增量 PR，快得多 |
| winget Validation 偶发失败 | 见过 `internal error`（Microsoft 侧流水线问题），等其处理或推空提交重跑 |
| macOS 构建 | 矩阵里暂时关闭：job 报成功但产不出资产，根因未查。恢复方法见 `.github/workflows/release.yml` 注释 |
| 浏览器预览模式 | `npm run dev` 下 Mistral 源会失败（Vite dev proxy 的已知问题），桌面版不受影响 |

---

## 致谢

感谢所有提 Issue、给建议、提交 PR 的人。

这个项目最核心的价值依赖于**各个站点的公开接口保持可用**。如果哪天你发现某个源失效，
哪怕只是改了几行解析规则，也请提 PR——这比什么都重要。
