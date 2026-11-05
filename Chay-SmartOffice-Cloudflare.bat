@echo off
chcp 65001 >nul
title SmartOffice - May chu (sau Cloudflare)
cd /d "%~dp0"
rem ==== Cau hinh khi chay sau Cloudflare Tunnel ====
set PORT=3000
set TRUST_PROXY=1
set PUBLIC_ORIGINS=https://smartoffice.vnptninhbinh.com.vn

where node >nul 2>nul
if errorlevel 1 (
  echo  [LOI] May tinh chua cai Node.js 22 tro len. Tai tai https://nodejs.org/vi/download
  pause
  exit /b 1
)
echo  SmartOffice chay tai http://localhost:%PORT%  -  cong khai: %PUBLIC_ORIGINS%
node server.js
echo  May chu SmartOffice da dung.
pause
