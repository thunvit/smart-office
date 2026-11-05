@echo off
chcp 65001 >nul
title SmartOffice - Khoi tao du lieu moi
cd /d "%~dp0"
set PORT=3000

if exist "data\smartoffice.db" (
  echo.
  echo  [CANH BAO] Da ton tai du lieu trong thu muc data.
  echo  De khoi tao du lieu moi, hay sao luu roi xoa hoac doi ten thu muc "data" truoc.
  echo.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo  [LOI] May tinh chua cai Node.js. Tai tai https://nodejs.org/vi/download
  pause
  exit /b 1
)
set NO_DEMO=1
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"
node server.js
pause
