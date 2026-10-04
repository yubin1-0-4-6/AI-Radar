# winget 分发

## 当前状态：还差两步才能提交

1. **安装包必须公开可下载**
   winget 的客户端下载安装包时**不支持任何鉴权**。本仓库是私有的，
   `https://github.com/yubin1-0-4-6/AI-Radar/releases/download/...` 对匿名请求返回 404，
   manifest 里的 `InstallerUrl` 会失效。

   解法二选一：
   - 把仓库（或让 Release 产物）公开
   - 把安装包传到公开的对象存储/CDN，manifest 指向那里

2. **`InstallerSha256` 必须是 CI 产物的哈希**
   本地 `tauri build` 和 GitHub Actions 构建出的 exe **哈希不同**
   （构建时间戳、绝对路径都会进二进制）。填错哈希 winget 会直接报
   `Installer hash mismatch`。

   CI 跑完后执行：

   ```bash
   node packaging/winget/sync-hash.mjs v0.1.0
   ```

   脚本会下载 Release 资产、算 SHA256、回填 `InstallerSha256` 与 `InstallerUrl`，
   顺便同步 `PackageVersion`。

## 目录结构

winget 的规则是 manifest 路径必须匹配包名：

```
manifests/<首字母>/<Publisher>/<PackageIdentifier>/<PackageIdentifier>.<类型>.yaml
```

当前 Publisher 是 `yubin1-0-4-6`（首字母 `y`），所以：

```
manifests/y/yubin1-0-4-6/AI-Radar/
├── AI-Radar.yaml               # 包版本
├── AI-Radar.installer.yaml     # 安装器（哈希、URL、静默参数）
└── AI-Radar.locale.en-US.yaml  # 元信息、描述、标签
```

提交时把整个 `AI-Radar/` 目录复制到
[`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) 仓库的同名路径。

## 安装器类型说明

用的是 `InstallerType: null`（通用 EXE）+ NSIS 静默参数，而不是 `msi`：

- NSIS 安装器的 `/S` 已在本机实测过静默安装成功
- MSI 虽然更"标准"，但 Tauri 用 WiX 生成，其 ProductCode / Scope 需要实测确认，
  写错会让winget 报安装失败。通用 EXE + 已验证的开关是更稳的选择

`Scope: user` 对应安装行为：`%LOCALAPPDATA%\AI Radar`，不写注册表不需要管理员权限。

## 提交前检查

```powershell
winget source update
winget run Microsoft.WinGet.Lint
```

Lint 通过后提 PR。**首次提交新发布者需要 Microsoft 人工审核，通常 1-3 个工作日**，
审核通过后 `winget install yubin1-0-4-6.AIRadar` 即可使用。