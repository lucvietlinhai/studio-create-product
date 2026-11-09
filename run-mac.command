#!/bin/bash
cd "$(dirname "$0")"

clear
echo "=========================================================="
echo "    AI E-COMMERCE PRODUCT IMAGE STUDIO (Local Browser)"
echo "=========================================================="
echo ""

# 1. Gỡ cờ cách ly Gatekeeper & cấp quyền thực thi trên macOS
xattr -cr . 2>/dev/null || true

# 2. Tìm Node.js
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

# 3. Tự động cài đặt thư viện nếu thiếu
if [ ! -d "node_modules" ]; then
    echo "[*] Phát hiện chưa có node_modules. Đang tự động chạy 'npm install'..."
    npm install
fi

# 4. Tự động kích hoạt Sharp cho macOS nếu thiếu
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] && [ ! -d "node_modules/@img/sharp-darwin-arm64" ]; then
    echo "[*] Đang cài đặt thư viện xử lý ảnh Sharp cho Apple Silicon (arm64)..."
    npm install --no-save --os=darwin --cpu=arm64 sharp
elif [ "$ARCH" = "x86_64" ] && [ ! -d "node_modules/@img/sharp-darwin-x64" ]; then
    echo "[*] Đang cài đặt thư viện xử lý ảnh Sharp cho Mac Intel (x64)..."
    npm install --no-save --os=darwin --cpu=x64 sharp
fi

chmod -R 755 node_modules/@img 2>/dev/null || true

# 5. Tự động biên dịch bản build nếu chưa có
if [ ! -f "server.js" ] && [ ! -f ".next/standalone/server.js" ]; then
    echo "[*] Chưa có bản build production. Đang tự động chạy 'npm run build'..."
    npm run build
    if [ -d ".next/static" ] && [ -d ".next/standalone" ]; then
        mkdir -p .next/standalone/.next/static
        cp -R .next/static/* .next/standalone/.next/static/ 2>/dev/null || true
    fi
fi

export PORT=3000
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"

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

echo "[*] Server đang chạy tại http://localhost:3000 (Nhấn Ctrl+C để dừng)"
echo "----------------------------------------------------------"
if [ -f "server.js" ]; then
    "$NODE_BIN" server.js
elif [ -f ".next/standalone/server.js" ]; then
    "$NODE_BIN" .next/standalone/server.js
else
    npm run start
fi