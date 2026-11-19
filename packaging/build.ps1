# 一键构建：前端产物 → release 可执行文件 → 安装包
#
# 用法（在仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File packaging\build.ps1
#
# 前置：Node 18+、Rust（含 tauri 依赖的 C 链接器）、Inno Setup 6（仅出安装包时需要）

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '==> 安装前端依赖'
if (-not (Test-Path 'node_modules')) { npm install }

Write-Host '==> 构建 release（前端产物会被内嵌进可执行文件）'
npx tauri build --no-bundle
if ($LASTEXITCODE -ne 0) { throw 'tauri build 失败' }

$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Warning '未找到 Inno Setup 6（winget install JRSoftware.InnoSetup），跳过安装包。'
  exit 0
}

Write-Host '==> 生成安装包'
& $iscc 'packaging\nexterm.iss'
Write-Host '完成：installer\NexTerm-1.0.0-setup.exe'
