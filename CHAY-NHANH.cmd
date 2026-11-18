@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Hay cai Node.js 24 LTS roi mo lai file nay.
  pause
  exit /b 1
)
node "scripts\start-frontend.mjs"
if errorlevel 1 (
  echo.
  echo Khoi dong chua thanh cong. Xem thong bao ben tren.
  pause
  exit /b 1
)
endlocal
