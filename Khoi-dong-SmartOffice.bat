@echo off
chcp 65001 >nul
title SmartOffice - May chu van phong so
cd /d "%~dp0"
set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [LOI] May tinh chua cai Node.js.
  echo  Vui long tai va cai dat Node.js ban LTS tai https://nodejs.org/vi/download
  echo  sau do chay lai tep nay.
  echo.
  start "" "https://nodejs.org/vi/download"
  pause
  exit /b 1
)

start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"
node server.js
echo.
echo  May chu SmartOffice da dung.
pause
