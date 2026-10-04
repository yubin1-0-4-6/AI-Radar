<#
.SYNOPSIS
  Submit the winget manifests under packaging/winget to microsoft/winget-pkgs.

.DESCRIPTION
  Flow: ensure fork -> sparse clone (avoids downloading the full history)
  -> copy manifests -> commit -> push -> open PR.

  First-time publishers require manual approval from Microsoft
  (usually 1-3 business days).

  Re-run this script for later versions (e.g. v0.1.2) to submit an
  incremental PR.

  NOTE: this file is intentionally pure ASCII. PowerShell 5.1 decodes
  .ps1 files without a BOM using the system ANSI codepage, which breaks
  string parsing on non-UTF-8 locales when non-ASCII characters appear.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File packaging/winget/submit.ps1
#>
[CmdletBinding()]
param(
  [string]$Version = "",
  [string]$WorkDir = "$env:TEMP\winget-submit"
)

$ErrorActionPreference = "Stop"

$Owner = "yubin1-0-4-6"
$Upstream = "microsoft/winget-pkgs"
$ManifestSrc = Join-Path $PSScriptRoot "manifests\y\$Owner\AI-Radar"
$TargetDir = "manifests/y/$Owner/AI-Radar"

# ---- 0. preflight ----
# gh writes to stderr on failure; with ErrorActionPreference=Stop that would
# become a terminating error before we ever inspect the exit code.
function Invoke-Native {
  param([string]$Exe, [string[]]$ArgList)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $Exe @ArgList *> $null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "gh not found. Install it: winget install --id GitHub.cli -e --source winget"
}
if ((Invoke-Native "gh" @("auth", "status")) -ne 0) {
  throw "gh is not logged in. Run: gh auth login"
}
if (-not (Test-Path $ManifestSrc)) { throw "manifest dir not found: $ManifestSrc" }

$pkgVer = (Select-String -Path (Join-Path $ManifestSrc "AI-Radar.yaml") -Pattern '^PackageVersion:\s*(.+)$').Matches[0].Groups[1].Value.Trim()
if ($Version) { $Version = $Version.TrimStart("v") }
if ($Version -and $Version -ne $pkgVer) {
  throw "Version=$Version does not match manifest PackageVersion=$pkgVer. Run sync-hash.mjs $Version first."
}
Write-Host "==> submitting version: $pkgVer"

# ---- 1. make sure the fork exists ----
$forkExists = (Invoke-Native "gh" @("api", "repos/$Owner/winget-pkgs")) -eq 0

if (-not $forkExists) {
  Write-Host "==> forking $Upstream ..."
  gh repo fork $Upstream --clone=false --remote=false
  if ($LASTEXITCODE -ne 0) { throw "fork failed" }
} else {
  Write-Host "==> fork already exists: $Owner/winget-pkgs"
}

# ---- 2. sparse clone ----
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
Write-Host "==> sparse-cloning your fork ..."
git clone --filter=blob:none --sparse "https://github.com/$Owner/winget-pkgs.git" $WorkDir *> $null
if ($LASTEXITCODE -ne 0) { throw "clone failed" }

Push-Location $WorkDir
try {
  git sparse-checkout set manifests/y *> $null
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()

  $dst = Join-Path $WorkDir ($TargetDir -replace "/", "\")
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item (Join-Path $ManifestSrc "*") $dst -Force
  Write-Host "==> copied to: $TargetDir"

  git add $TargetDir
  if ($LASTEXITCODE -ne 0) { throw "git add failed" }

  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "==> no diff vs upstream; $pkgVer may already be submitted. Done."
    return
  }

  git commit -m "New package: $Owner.AIRadar v$pkgVer" *> $null
  if ($LASTEXITCODE -ne 0) { throw "commit failed" }
  git push origin $branch *> $null
  if ($LASTEXITCODE -ne 0) { throw "push failed" }
  Write-Host "==> pushed to fork (branch $branch)"

  # ---- 3. open the PR ----
  $body = @(
    "AI Radar $pkgVer",
    "",
    "- InstallerSha256 and InstallerUrl cross-checked against the GitHub release asset digest",
    "- NSIS installer; silent switch /S verified on a real install",
    "- Scope: user (installs to %LOCALAPPDATA%, no admin required)",
    "- Installer is publicly downloadable (anonymous HEAD returns 200)"
  ) -join [Environment]::NewLine
  $bodyFile = Join-Path $WorkDir "pr-body.md"
  [System.IO.File]::WriteAllText($bodyFile, $body, (New-Object System.Text.UTF8Encoding($false)))

  gh pr create --repo $Upstream --head "$Owner`:$branch" --title "New package: $Owner.AIRadar v$pkgVer" --body-file $bodyFile
  if ($LASTEXITCODE -ne 0) { throw "failed to create PR" }
}
finally {
  Pop-Location
}