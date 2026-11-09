@echo off
chcp 65001 > nul
title AI Product Studio - Localhost:3000
cd /d "%~dp0"

echo ========================================================================
echo    AI PRODUCT STUDIO - KHOI DONG NHANH CHE DO LOCALHOST
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

:: 2. Kiem tra moi truong Node.js
set "NODE_EXE=node"
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%~dp0runtime\node.exe" (
        set "NODE_EXE=%~dp0runtime\node.exe"
    ) else (
        echo [!] Khong tim thay Node.js trong he thong.
        echo [*] Vui long cai dat Node.js tai: https://nodejs.org
        pause
        exit /b 1
    )
)

:: 3. Tu dong kiem tra va cai dat thu vien neu thieu node_modules
if not exist "%~dp0node_modules" (
    echo [*] Phat hien chua co thu vien node_modules.
    echo [*] Dang tu dong chay 'npm install' de tai va cai dat cac thu vien can thiet...
    call npm install
    if %errorlevel% neq 0 (
        echo [!] Co loi khi cai dat thu vien qua npm install.
        pause
        exit /b 1
    )
    echo [OK] Da cai dat xong toan bo thu vien!
)

:: 4. Tu dong kiem tra va bien dich ban build neu chua co
if not exist "%~dp0.next\standalone\server.js" (
    echo [*] Chua co ban build production. Dang tu dong chay 'npm run build'...
    call npm run build
    if %errorlevel% neq 0 (
        echo [!] Loi khi bien dich du an Next.js.
        pause
        exit /b 1
    )
    if exist "%~dp0.next\static" (
        xcopy /E /I /Y "%~dp0.next\static" "%~dp0.next\standalone\.next\static" >nul 2>nul
    )
    echo [OK] Da bien dich xong ban build production!
)
if not exist "%~dp0.next\standalone\.next\static" (
    if exist "%~dp0.next\static" (
        xcopy /E /I /Y "%~dp0.next\static" "%~dp0.next\standalone\.next\static" >nul 2>nul
    )
)

echo [*] Dang khoi dong may chu Localhost tai http://localhost:3000...
echo [*] Trinh duyet se tu dong mo ngay khi may chu khoi dong.
echo.
echo   - Dia chi truy cap: http://localhost:3000
echo   - De dung may chu:  Nhan to hop phim Ctrl + C hoac dong cua so nay.
echo ========================================================================
echo.

:: 5. Tu dong mo localhost trong trinh duyet sau 1-2 giay
start "" cmd /c "ping 127.0.0.1 -n 2 >nul & start http://localhost:3000"

:: 6. Khoi chay server toc do cao
set "PORT=3000"
set "HOSTNAME=0.0.0.0"
set "NODE_ENV=production"

if exist "%~dp0.next\standalone\server.js" (
    "%NODE_EXE%" "%~dp0.next\standalone\server.js"
) else (
    call npm run start
)

pause
