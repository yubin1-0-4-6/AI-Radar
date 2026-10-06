# winget 分发

## 前提：安装包必须公开可下载

winget 的客户端下载安装包时**不支持任何鉴权**，`InstallerUrl` 必须对匿名请求
返回 200。本仓库已公开，Release 资产可匿名下载；如果哪天仓库转私有，
winget 会立刻因为 404 而失效。

验证方式（不需要登录）：

```powershell
Invoke-WebRequest -Method Head -Uri <InstallerUrl> -UseBasicParsing
```

## 前提：`InstallerSha256` 必须是 CI 产物的哈希

本地 `tauri build` 和 GitHub Actions 构建出的 exe **哈希不同**
（构建时间戳、绝对路径都会进二进制）。填错哈希 winget 会直接报
`Installer hash mismatch`。

**每次 Release 跑完都要执行**，因为重新构建必然产生新的哈希：

```bash
node packaging/winget/sync-hash.mjs v0.1.2
```

脚本会下载 Release 资产、算 SHA256、回填 `InstallerSha256` 与 `InstallerUrl`，
同步 `PackageVersion`，并把版本目录改名到新版本号。

## 目录结构

winget 的规则是 manifest 路径必须匹配包名，**而且比直觉多一层版本目录**：

```
manifests/<首字母>/<Publisher>/<Package>/<版本号>/<完整 PackageIdentifier>.<类型>.yaml
```

三个容易写错的点（都真实踩过，代价是一轮 PR 校验失败）：

1. **`<Package>` 必须等于 PackageIdentifier 的第二段** —— 我们的标识符是
   `yubin1-0-4-6.AIRadar`，所以目录是 `AIRadar`，**不是** `AI-Radar`
2. **必须有一层以版本号命名的目录**，且要和 `PackageVersion` 一致
3. **文件名是完整标识符**，不是简称

当前 Publisher 是 `yubin1-0-4-6`（首字母 `y`），v0.1.1 的实际结构：

```
manifests/y/yubin1-0-4-6/AIRadar/0.1.1/
├── yubin1-0-4-6.AIRadar.yaml               # 包版本
├── yubin1-0-4-6.AIRadar.installer.yaml     # 安装器（哈希、URL、静默参数）
└── yubin1-0-4-6.AIRadar.locale.en-US.yaml  # 元信息、描述、标签
```

提交时把整个 `AIRadar/` 目录复制到
[`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) 仓库的同名路径。
`submit.ps1` 会自动带上版本目录并清掉旧布局的残留目录。

改版本号时 `node packaging/winget/sync-hash.mjs v0.1.2` 会连目录一起改名，
不用手动挪。

## 安装器类型说明

用的是 `InstallerType: nullsoft`（NSIS），而不是通用 `exe`：

- Tauri v2 的 Windows 安装包走 NSIS，`/S` 静默参数已在本机实测安装成功
- 历史上写过 `InstallerType: null` —— 那是错的，YAML 里 `null` 是空值，
  不是合法枚举值，校验器读到就崩
- 通用 `exe` 虽然也能跑，但 winget 对 `nullsoft` 有内置的 NSIS 处理逻辑，
  声明准确类型更符合规范

`Scope: user` 对应安装行为：`%LOCALAPPDATA%\AI Radar`，不写注册表不需要管理员权限
（与 `tauri.conf.json` 里 `nsis.installMode: currentUser` 一致）。

## 提交前检查

```powershell
winget source update
winget run Microsoft.WinGet.Lint
```

Lint 通过后提 PR。**首次提交新发布者需要 Microsoft 人工审核，通常 1-3 个工作日**，
审核通过后 `winget install yubin1-0-4-6.AIRadar` 即可使用。