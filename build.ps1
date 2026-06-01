#Requires -Version 5.1
<#
.SYNOPSIS
  Build Video Hub App for Windows with correct exe/installer icons.

.DESCRIPTION
  Run this script in an elevated (Administrator) PowerShell terminal.
  It clears the electron-builder winCodeSign cache, removes the previous
  release output, and runs the full npm electron build pipeline.

.EXAMPLE
  Right-click PowerShell -> Run as administrator, then:
  cd "C:\Users\cmfc3\Documents\VS Projects\Video-Hub-App"
  .\build.ps1
#>

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

if (-not (Test-Administrator)) {
    Write-Host "This build must be run as Administrator (required for electron-builder icon embedding)." -ForegroundColor Red
    Write-Host "Right-click PowerShell and choose 'Run as administrator', then run .\build.ps1 again." -ForegroundColor Yellow
    exit 1
}

Set-Location $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm was not found in PATH. Install Node.js and reopen this terminal." -ForegroundColor Red
    exit 1
}

Write-Step "Project: $PSScriptRoot"
Write-Step "Clearing electron-builder winCodeSign cache"
$winCodeSignCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
if (Test-Path $winCodeSignCache) {
    Remove-Item -Recurse -Force $winCodeSignCache
    Write-Host "Removed $winCodeSignCache"
} else {
    Write-Host "No winCodeSign cache to remove."
}

Write-Step "Removing previous release output"
$releaseDir = Join-Path $PSScriptRoot "release"
if (Test-Path $releaseDir) {
    Remove-Item -Recurse -Force $releaseDir
    Write-Host "Removed $releaseDir"
} else {
    Write-Host "No release folder to remove."
}

Write-Step "Running npm run electron"
npm run electron
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "Build completed successfully." -ForegroundColor Green
    Write-Host "Outputs:" -ForegroundColor Green
    Write-Host "  - release\win-unpacked\Video Hub App 3.exe"
    Write-Host "  - release\Video Hub App 3 Setup 3.2.1.exe"
    Write-Host "  - release\Video Hub App 3 3.2.1.exe"
} else {
    Write-Host ""
    Write-Host "Build failed with exit code $exitCode." -ForegroundColor Red
}

exit $exitCode
