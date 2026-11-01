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

# 2. Periksa Biner Utama GoCut
$gocutBin = "$ProjectRoot\build\bin\gocut.exe"
if (-not (Test-Path $gocutBin)) {
    Write-Host "`n[1/4] Biner GoCut belum tersedia di build/bin/gocut.exe. Membangun sekarang..." -ForegroundColor Yellow
    wails build
} else {
    Write-Host "`n[1/4] Biner GoCut ditemukan di $gocutBin." -ForegroundColor Green
}

# 3. Siapkan Biner Media Tools (FFmpeg & FFprobe untuk Offline Installer)
Write-Host "`n[2/4] Memeriksa FFmpeg & FFprobe di media-tools/..." -ForegroundColor Yellow
$mediaToolsDir = "$ProjectRoot\media-tools"
New-Item -ItemType Directory -Force -Path $mediaToolsDir | Out-Null
$ffmpegBin = "$mediaToolsDir\ffmpeg.exe"
$ffprobeBin = "$mediaToolsDir\ffprobe.exe"

if (-not (Test-Path $ffmpegBin) -or -not (Test-Path $ffprobeBin)) {
    $sysFfmpeg = Get-Command "ffmpeg.exe" -ErrorAction SilentlyContinue
    $sysFfprobe = Get-Command "ffprobe.exe" -ErrorAction SilentlyContinue
    if ($sysFfmpeg -and $sysFfprobe) {
        Write-Host "  -> Menyalin FFmpeg ($($sysFfmpeg.Source)) ke media-tools/..." -ForegroundColor Gray
        Copy-Item $sysFfmpeg.Source $ffmpegBin -Force
        Copy-Item $sysFfprobe.Source $ffprobeBin -Force
    } elseif (Test-Path "C:\ffmpeg\ffmpeg.exe") {
        Write-Host "  -> Menyalin FFmpeg dari C:\ffmpeg ke media-tools/..." -ForegroundColor Gray
        Copy-Item "C:\ffmpeg\ffmpeg.exe" $ffmpegBin -Force
        Copy-Item "C:\ffmpeg\ffprobe.exe" $ffprobeBin -Force
    }
}

if ((Test-Path $ffmpegBin) -and (Test-Path $ffprobeBin)) {
    Write-Host "  -> FFmpeg dan FFprobe siap dibundel offline ke GoCut-Setup-x64.exe." -ForegroundColor Green
} else {
    Write-Warning "FFmpeg atau FFprobe tidak ditemukan di sistem. Installer offline mungkin tidak memuat biner ffmpeg."
}

# 4. Cari Inno Setup Compiler (ISCC.exe)
Write-Host "`n[3/4] Memeriksa Inno Setup Compiler (ISCC)..." -ForegroundColor Yellow
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
    Write-Host "`n[4/4] Mengompilasi Dual Installers dengan Inno Setup ($iscc)..." -ForegroundColor Cyan
    
    # A. Web Downloader Installer (Online, < 3 MB, UI Identik)
    Write-Host "  -> Mengompilasi GoCut-WebSetup.exe (Web Installer)..." -ForegroundColor Yellow
    & $iscc "$ProjectRoot\installer\web_setup.iss"
    if ($LASTEXITCODE -eq 0) {
        $size = (Get-Item "$ProjectRoot\release\GoCut-WebSetup.exe").Length / 1MB
        Write-Host "     Berhasil! release\GoCut-WebSetup.exe ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
    } else {
        Write-Warning "Inno Setup gagal mengompilasi web_setup.iss."
    }

    # B. Full Offline Installer (Bundle 16 MB)
    Write-Host "  -> Mengompilasi GoCut-Setup-x64.exe (Full Offline Installer)..." -ForegroundColor Yellow
    & $iscc "$ProjectRoot\installer\setup.iss"
    if ($LASTEXITCODE -eq 0) {
        $size = (Get-Item "$ProjectRoot\release\GoCut-Setup-x64.exe").Length / 1MB
        Write-Host "     Berhasil! release\GoCut-Setup-x64.exe ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
    } else {
        Write-Warning "Inno Setup gagal mengompilasi setup.iss."
    }
} else {
    Write-Host "  -> Inno Setup (ISCC.exe) belum terpasang di sistem." -ForegroundColor DarkYellow
    Write-Host "     Pasang Inno Setup 6 untuk membangun installer secara otomatis." -ForegroundColor Gray
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "                  Build Selesai!                  " -ForegroundColor Cyan
Write-Host "Output tersedia di folder: release/" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
