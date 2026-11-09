# PowerShell Script to create Lightweight Zero-Installer Local Browser Package
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Resolve-Path "$ScriptDir\.."
Set-Location $ProjectDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DONG GOI BAN CHAY NHANH TRINH DUYET LOCAL (ZIP)" -ForegroundColor Cyan
Write-Host "  Loai bo toan bo trinh cai dat & thu muc khong lien quan" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Next.js standalone build is ready
Write-Host "`n[1/5] Kiem tra ban build standalone..." -ForegroundColor Yellow
if (-not (Test-Path ".next\standalone")) {
    Write-Host "  Dang build Next.js..." -ForegroundColor Gray
    npm run build
}

if (-not (Test-Path ".next\standalone\.next\static")) {
    New-Item -ItemType Directory -Path ".next\standalone\.next\static" -Force | Out-Null
}
Copy-Item -Path ".next\static\*" -Destination ".next\standalone\.next\static\" -Recurse -Force
Write-Host "  OK: Da dong bo .next/static vao standalone." -ForegroundColor Green

# 2. Setup Clean Staging Directory
Write-Host "`n[2/5] Tao thu muc dong goi sieu nhe (khong chua file cai dat)..." -ForegroundColor Yellow
$DistLocal = "$ProjectDir\dist-local"
$LocalBundle = "$DistLocal\AI-Product-Studio-Local"

if (Test-Path $DistLocal) {
    Remove-Item $DistLocal -Recurse -Force
}
New-Item -ItemType Directory -Path $LocalBundle -Force | Out-Null
New-Item -ItemType Directory -Path "$LocalBundle\runtime" -Force | Out-Null

# 3. Copy only necessary runtime files
Write-Host "`n[3/5] Sao chep cac file can thiet de chay tren trinh duyet..." -ForegroundColor Yellow

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Copy server.js & package.json (with Cross-Platform Self-Healing Bootstrap injected at top of server.js)
$rawServerJs = [System.IO.File]::ReadAllText("$ProjectDir\.next\standalone\server.js", [System.Text.Encoding]::UTF8)
$bootstrapJs = @'
// --- CROSS-PLATFORM & MACOS SELF-HEALING BOOTSTRAP ---
(function () {
  const fs = require("fs");
  const path = require("path");
  try {
    const settingsPath = path.join(__dirname, "studio-settings.json");
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf8");
      if (raw.charCodeAt(0) === 0xfeff) {
        fs.writeFileSync(settingsPath, raw.slice(1), "utf8");
      }
    }
  } catch (e) {}

  if (process.platform === "darwin") {
    try {
      const { execSync } = require("child_process");
      const imgDir = path.join(__dirname, "node_modules", "@img");
      if (fs.existsSync(imgDir)) {
        execSync('xattr -cr "' + imgDir + '" 2>/dev/null || true');
        execSync('chmod -R 755 "' + imgDir + '" 2>/dev/null || true');
      }
      try {
        require("sharp");
      } catch (sharpErr) {
        console.log("[*] Dang tu dong cai dat thu vien Sharp cho macOS (" + process.arch + ")...");
        execSync(
          "npm install --no-save --os=darwin --cpu=" + process.arch + " sharp@0.34.5",
          { cwd: __dirname, stdio: "inherit" }
        );
      }
    } catch (e) {}
  }
})();
// -----------------------------------------------------
'@
[System.IO.File]::WriteAllText("$LocalBundle\server.js", $bootstrapJs + "`n" + $rawServerJs, $utf8NoBom)
Copy-Item -Path ".next\standalone\package.json" -Destination "$LocalBundle\package.json" -Force

# Copy .next folder (server chunks & static assets)
Copy-Item -Path ".next\standalone\.next" -Destination "$LocalBundle\.next" -Recurse -Force

# Copy node_modules (only standalone dependencies)
Copy-Item -Path ".next\standalone\node_modules" -Destination "$LocalBundle\node_modules" -Recurse -Force

# Copy embedded node.exe so target machine does NOT even need Node.js installed
$nodeSource = (Get-Command node).Source
Write-Host "  Tich hop san runtime Node.js tu: $nodeSource..." -ForegroundColor Gray
Copy-Item -Path $nodeSource -Destination "$LocalBundle\runtime\node.exe" -Force

# Ensure Darwin Sharp binaries are present so the folder can run on both Windows & Mac
$imgDir = "$LocalBundle\node_modules\@img"
$macTarballsDir = "$ScriptDir\mac-resources"
if (Test-Path $macTarballsDir) {
    Write-Host "  Tich hop them Sharp Darwin (de ho tro ca may Mac neu can)..." -ForegroundColor Gray
    $tempExtract = "$DistLocal\temp_extract"
    New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

    if (-not (Test-Path "$imgDir\sharp-darwin-arm64") -and (Test-Path "$macTarballsDir\img-sharp-darwin-arm64-0.34.5.tgz")) {
        tar -xzf "$macTarballsDir\img-sharp-darwin-arm64-0.34.5.tgz" -C $tempExtract
        Move-Item "$tempExtract\package" "$imgDir\sharp-darwin-arm64" -Force
    }
    if (-not (Test-Path "$imgDir\sharp-libvips-darwin-arm64") -and (Test-Path "$macTarballsDir\img-sharp-libvips-darwin-arm64-1.2.4.tgz")) {
        tar -xzf "$macTarballsDir\img-sharp-libvips-darwin-arm64-1.2.4.tgz" -C $tempExtract
        Move-Item "$tempExtract\package" "$imgDir\sharp-libvips-darwin-arm64" -Force
    }
    if (-not (Test-Path "$imgDir\sharp-darwin-x64") -and (Test-Path "$macTarballsDir\img-sharp-darwin-x64-0.34.5.tgz")) {
        tar -xzf "$macTarballsDir\img-sharp-darwin-x64-0.34.5.tgz" -C $tempExtract
        Move-Item "$tempExtract\package" "$imgDir\sharp-darwin-x64" -Force
    }
    if (-not (Test-Path "$imgDir\sharp-libvips-darwin-x64") -and (Test-Path "$macTarballsDir\img-sharp-libvips-darwin-x64-1.2.4.tgz")) {
        tar -xzf "$macTarballsDir\img-sharp-libvips-darwin-x64-1.2.4.tgz" -C $tempExtract
        Move-Item "$tempExtract\package" "$imgDir\sharp-libvips-darwin-x64" -Force
    }
    Remove-Item $tempExtract -Recurse -Force
}

# Clean settings & output directories
$cleanSettings = @{
    defaultProvider = "sangtao"
    sangtaoApiKey = ""
    geminiApiKey = ""
    geminiModel = "gemini-2.5-flash-image"
    openaiApiKey = ""
    openaiModel = "gpt-image-1"
    enableMockMode = $false
    outputDirectory = "output_collections"
} | ConvertTo-Json -Depth 3

[System.IO.File]::WriteAllText("$LocalBundle\studio-settings.json", $cleanSettings, $utf8NoBom)

if (-not (Test-Path "$LocalBundle\output_collections")) {
    New-Item -ItemType Directory -Path "$LocalBundle\output_collections" -Force | Out-Null
}

# 4. Create 1-Click Launchers (Windows & Mac) & Guide
Write-Host "`n[4/5] Tao file khoi dong 1-Click cho trinh duyet..." -ForegroundColor Yellow

# Windows launcher: Khoi-Dong-Studio.bat
$batContent = @'
@echo off
chcp 65001 > nul
title AI Product Studio - Trinh Duyet Local
cd /d "%~dp0"

echo ========================================================================
echo    AI E-COMMERCE PRODUCT STUDIO - KHOI DONG TRINH DUYET LOCAL
echo ========================================================================
echo.

:: 1. Kiem tra neu may chu da dang chay tren cong 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] May chu da san sang tai http://localhost:3000!
    echo [*] Dang mo trinh duyet vao localhost ngay lap tuc...
    start http://localhost:3000
    exit /b 0
)

:: 2. Tim Node.js (Uu tien node.exe tich hop san trong runtime\)
set "NODE_EXE=node"
if exist "%~dp0runtime\node.exe" (
    set "NODE_EXE=%~dp0runtime\node.exe"
) else (
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo [!] Khong tim thay Node.js trong may.
        echo [*] Vui long cai dat Node.js tai https://nodejs.org hoac copy node.exe vao runtime\
        pause
        exit /b 1
    )
)

echo [*] Runtime: %NODE_EXE%
echo [*] Dang khoi dong may chu Localhost tai http://localhost:3000...
echo [*] Trinh duyet se tu dong mo len sau 1-2 giay!
echo.
echo   - Dia chi truy cap: http://localhost:3000
echo   - De dung may chu:  Nhan to hop phim Ctrl + C hoac dong cua so nay.
echo ========================================================================
echo.

:: 3. Kiem tra thu vien node_modules can thiet
if not exist "%~dp0node_modules" (
    echo [!] Phat hien thieu thu vien node_modules.
    where npm >nul 2>nul
    if %errorlevel% equ 0 (
        echo [*] Dang tu dong chay 'npm install --omit=dev' de cai dat lai thu vien...
        call npm install --omit=dev
    ) else (
        echo [!] Can giu nguyen thu muc node_modules di kem ban zip de hoat dong.
        pause
        exit /b 1
    )
)

:: 4. Tu dong mo trinh duyet sau khi khoi dong
start "" cmd /c "ping 127.0.0.1 -n 2 >nul & start http://localhost:3000"

:: 5. Khoi chay server
set "PORT=3000"
set "HOSTNAME=0.0.0.0"
set "NODE_ENV=production"

"%NODE_EXE%" server.js
pause
'@
[System.IO.File]::WriteAllText("$LocalBundle\Khoi-Dong-Studio.bat", $batContent, $utf8NoBom)

# macOS launcher: Khoi-Dong-Studio-Mac.command (Unix LF, No BOM)
$macCommand = @'
#!/bin/bash
cd "$(dirname "$0")"

clear
echo "=========================================================="
echo "    AI E-COMMERCE PRODUCT IMAGE STUDIO (Local Browser)"
echo "=========================================================="
echo ""

# Gỡ cờ cách ly Gatekeeper & cấp quyền thực thi thư viện Sharp trên macOS
xattr -cr . 2>/dev/null || true
chmod -R 755 node_modules/@img 2>/dev/null || true

# Find Node.js
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
elif [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
elif [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM=$(ls -d "$HOME/.nvm/versions/node/"* 2>/dev/null | tail -n 1)
    if [ -x "$LATEST_NVM/bin/node" ]; then
        NODE_BIN="$LATEST_NVM/bin/node"
    fi
fi

if [ -z "$NODE_BIN" ]; then
    echo "[!] CHƯA TÌM THẤY NODE.JS TRÊN MÁY MAC CỦA BẠN."
    echo "    Vui lòng cài đặt Node.js từ https://nodejs.org hoặc gõ: brew install node"
    read -p "Bấm phím Enter để mở trang web tải Node.js..."
    open "https://nodejs.org"
    exit 1
fi

echo "[+] Đã phát hiện Node.js: $($NODE_BIN -v)"

# Kiểm tra thư viện node_modules
if [ ! -d "node_modules" ]; then
    echo "[!] Thiếu thư mục node_modules. Đang tự động chạy npm install..."
    npm install --omit=dev
fi

echo "[+] Đang khởi động AI Product Studio Server trên cổng 3000..."

export PORT=3000
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"

# If already listening, open browser
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "[*] Cổng 3000 đang mở. Đang mở trình duyệt..."
    open "http://localhost:3000"
    exit 0
fi

(
    for i in {1..20}; do
        if curl -s http://localhost:3000 >/dev/null 2>&1 ; then
            echo "[+] Studio đã sẵn sàng! Đang mở trình duyệt..."
            open "http://localhost:3000"
            break
        fi
        sleep 0.5
    done
) &

echo "[*] Server đang chạy... (Nhấn Ctrl+C để dừng)"
echo "----------------------------------------------------------"
"$NODE_BIN" server.js
'@
[System.IO.File]::WriteAllText("$LocalBundle\Khoi-Dong-Studio-Mac.command", $macCommand.Replace("`r`n", "`n"), $utf8NoBom)

# User Guide: Huong-Dan-Chay-Nhanh.txt
$guide = @"
======================================================================
     AI E-COMMERCE PRODUCT IMAGE STUDIO - BẢN CHẠY NHANH LOCAL
                 (Dành cho máy chạy trực tiếp trình duyệt)
======================================================================

1. CÁCH SỬ DỤNG TRÊN WINDOWS:
   - Bước 1: Giải nén file 'AI-Product-Studio-Local.zip'.
   - Bước 2: Click đúp vào file 'Khoi-Dong-Studio.bat'.
   - Trình duyệt sẽ tự động mở lên tại địa chỉ: http://localhost:3000
   * Máy tính KHÔNG CẦN cài đặt Node.js trước (đã tích hợp sẵn trong runtime\).

2. CÁCH SỬ DỤNG TRÊN MÁY MAC (MACOS):
   - Bước 1: Giải nén file 'AI-Product-Studio-Local.zip'.
   - Bước 2: Click đúp vào file 'Khoi-Dong-Studio-Mac.command'.
   - Trình duyệt sẽ tự động mở lên tại: http://localhost:3000
   (Yêu cầu máy Mac có cài đặt Node.js từ https://nodejs.org).

3. ĐẶC ĐIỂM NỔI BẬT:
   - Bản rút gọn siêu nhẹ: Đã loại bỏ toàn bộ file code nguồn dev,
     file cài đặt (Installer), trình gỡ bỏ (Uninstall) phức tạp.
   - Không cài đặt rườm rà: Chạy trực tiếp, tắt là dừng máy chủ.
   - Thư mục lưu ảnh thành phẩm: output_collections/
======================================================================
"@
Set-Content -Path "$LocalBundle\Huong-Dan-Chay-Nhanh.txt" -Value $guide -Encoding UTF8

# 5. Compress into a Single Clean Zip
Write-Host "`n[5/5] Dang tao tap tin nen AI-Product-Studio-Local.zip..." -ForegroundColor Yellow
$zipOutput = "$DistLocal\AI-Product-Studio-Local.zip"
if (Test-Path $zipOutput) { Remove-Item $zipOutput -Force }

tar -a -cf $zipOutput -C $DistLocal "AI-Product-Studio-Local"
$zipSize = (Get-Item $zipOutput).Length / 1MB
$zipSizeFormatted = "{0:N2} MB" -f $zipSize
Write-Host "  OK: AI-Product-Studio-Local.zip ($zipSizeFormatted)" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  HOAN TAT DONG GOI BAN LOCAL NHANH!" -ForegroundColor Cyan
Write-Host "  1. Thu muc go sach: $LocalBundle" -ForegroundColor White
Write-Host "  2. Tap tin ZIP:     $zipOutput" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

