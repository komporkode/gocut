# =====================================================================
# GoCut - Dual Installer Build Script
# 1. Full Offline Inno Setup Installer (GoCut-Setup-x64.exe)
# 2. Lightweight Web Downloader Installer (GoCut-WebSetup.exe)
# =====================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       GoCut - Building Dual Installers           " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Pastikan folder output release/ siap
New-Item -ItemType Directory -Force -Path "$ProjectRoot\release" | Out-Null

# 2. Build Web Downloader (< 6 MB)
Write-Host "`n[1/3] Building GoCut-WebSetup.exe (Web Downloader)..." -ForegroundColor Yellow
go build -ldflags="-s -w" -o "$ProjectRoot\release\GoCut-WebSetup.exe" "$ProjectRoot\installer\web_downloader"
if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item "$ProjectRoot\release\GoCut-WebSetup.exe").Length / 1MB
    Write-Host "  -> Berhasil! Ukuran: $([math]::Round($size, 2)) MB" -ForegroundColor Green
} else {
    Write-Error "Gagal membangun GoCut-WebSetup.exe"
}

# 3. Periksa Biner Utama GoCut
$gocutBin = "$ProjectRoot\build\bin\gocut.exe"
if (-not (Test-Path $gocutBin)) {
    Write-Host "`n[2/3] Biner GoCut belum tersedia di build/bin/gocut.exe. Membangun sekarang..." -ForegroundColor Yellow
    wails build
} else {
    Write-Host "`n[2/3] Biner GoCut ditemukan di $gocutBin." -ForegroundColor Green
}

# 4. Cari Inno Setup Compiler (ISCC.exe)
Write-Host "`n[3/3] Memeriksa Inno Setup Compiler (ISCC)..." -ForegroundColor Yellow
$isccPaths = @(
    "ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
)

$iscc = $null
foreach ($p in $isccPaths) {
    if (Get-Command $p -ErrorAction SilentlyContinue) {
        $iscc = $p
        break
    }
    if (Test-Path $p) {
        $iscc = $p
        break
    }
}

if ($iscc) {
    Write-Host "  -> Mengompilasi Full Offline Installer dengan Inno Setup ($iscc)..." -ForegroundColor Cyan
    & $iscc "$ProjectRoot\installer\setup.iss"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  -> Berhasil! release\GoCut-Setup-x64.exe siap didistribusikan." -ForegroundColor Green
    } else {
        Write-Warning "Inno Setup compiler menghasilkan kode keluar $LASTEXITCODE."
    }
} else {
    Write-Host "  -> Inno Setup (ISCC.exe) belum terpasang di sistem." -ForegroundColor DarkYellow
    Write-Host "     Untuk membuat GoCut-Setup-x64.exe secara otomatis, pasang Inno Setup 6 (https://jrsoftware.org/isdl.php)." -ForegroundColor Gray
    Write-Host "     Skrip installer sudah siap di: installer/setup.iss" -ForegroundColor Gray
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "                  Build Selesai!                  " -ForegroundColor Cyan
Write-Host "Output tersedia di folder: release/" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
