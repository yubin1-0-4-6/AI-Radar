# 修改代码后如何提交与发版

## 日常：改了代码怎么推上去

```powershell
cd C:\OpenCode1\ai-radar

npm run typecheck     # 先确保类型通过
npm run probe         # 再确认 12 个源还能正常拉取

git add -A
git commit -m "feat: 你这次改了什么"
git push
```

到这就结束了。GitHub 上会出现新提交，Actions 会跑一遍工作流（但只有推 tag 才出安装包，推分支只跑构建）。

提交身份已经配好了（仓库级，noreply 邮箱）：

```
user.name  = yubin1-0-4-6
user.email = yubin1-0-4-6@users.noreply.github.com
```

---

## 发一个新版本：光推代码是不够的

**改了代码 ≠ 用户能拿到新版安装包。** 必须走完这四步：

```powershell
# 1. 版本号四份文件一起改（别手改，用脚本）
node scripts/bump-version.mjs 0.1.2
npm run typecheck
git add -A
git commit -m "feat: 0.1.2"

# 2. 打 tag 并推送 —— 这一步才触发安装包构建
git tag -a v0.1.2 -m "0.1.2 改了 xxx"
git push origin main
git push origin v0.1.2

# 3. 等 GitHub Actions 跑完（约 6-8 分钟，两个平台）
#    看这里：https://github.com/yubin1-0-4-6/AI-Radar/actions
#    跑完后确认 Releases 里 v0.1.2 的 exe 和 deb 都在

# 4. 同步 winget manifest 的哈希 —— 见下节，不做这步 winget 会坏
node packaging/winget/sync-hash.mjs v0.1.2
git add packaging/winget
git commit -m "chore(packaging): 同步 v0.1.2 的安装器哈希"
git push
```

---

## 最容易踩的坑：winget 哈希不同步

**每次重新构建产出的 exe 哈希都不一样**（构建时间戳、绝对路径都会进二进制）。
所以新版本发布后，如果不跑第 4 步，winget 会直接报：

```
Installer hash mismatch
```

表现为：`winget install yubin1-0-4-6.AIRadar` 直接失败。

`sync-hash.mjs` 会从 GitHub API 拉真实资产清单（**不猜文件名**，因为
tauri-action 上传时会把空格换成点号），下载后算 SHA256 并回填 manifest。

跑完可以这样独立核对，不依赖脚本：

```powershell
$url = "https://github.com/yubin1-0-4-6/AI-Radar/releases/download/v0.1.2/AI.Radar_0.1.2_x64-setup.exe"
$declared = ((Get-Content packaging\winget\manifests\y\yubin1-0-4-6\AI-Radar\AI-Radar.installer.yaml |
              Select-String '^InstallerSha256:').Line -split ': ')[1].Trim()
$real = (Get-FileHash <下载下来的文件> -Algorithm SHA256).Hash.ToLower()
$real -eq $declared
```

---

## 本机调试注意事项

**① 改 Rust 侧代码前先关掉程序**
程序是托盘常驻的，exe 被占用会让 `tauri build` 报 `os error 32`：

```powershell
Get-Process ai-radar -ErrorAction SilentlyContinue | Stop-Process -Force
```

**② 别动正式配置里的调试端口**
`src-tauri/tauri.conf.json` 保持不带 `additionalBrowserArgs`。
需要连 CDP 排查时用叠加配置：

```powershell
npm run app:cdp                              # 带调试端口启动
node scripts/cdp-probe.mjs                   # 读页面真实状态（源成功率 / DOM / 报错）
node scripts/capture-screenshot.mjs out.png 1.5 leak   # 从桌面端截图
```

**③ 已安装的版本和仓库代码无关**
你本机装的是 Release 里 CI 构建的那份。改完代码要看到效果，
要么跑 `npm run app`（开发版），要么走上面的发版流程装新版。

---

## 发版后自查清单

```powershell
# Release 是否发布（非草稿）
gh api repos/yubin1-0-4-6/AI-Radar/releases/tags/v0.1.2 --jq '.draft, .assets[].name'

# winget 哈希是否与 GitHub 官方 digest 一致
gh api repos/yubin1-0-4-6/AI-Radar/releases/tags/v0.1.2 --jq '.assets[]|select(.name|endswith(".exe")).digest'

# 和 manifest 里写的对比，应该一致
```

---

## 已知需要人工介入的环节

| 环节 | 说明 |
|---|---|
| winget PR 首次审核 | Microsoft 人工审查，1–3 个工作日。后续版本走增量 PR，快很多 |
| winget Validation 偶发失败 | 见过 `internal error`（Microsoft 侧问题），等他们处理或推空提交重跑 |
| macOS 构建 | 目前矩阵里关掉了，job 报成功但产不出资产，根因未查。需要时按 workflow 注释加回 |
