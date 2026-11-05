@echo off
chcp 65001 >nul
rem Dang ky SmartOffice tu chay khi may khoi dong (Task Scheduler). Chay bang quyen Administrator.
net session >nul 2>&1
if errorlevel 1 (
  echo  [LOI] Can chay bang quyen Administrator.
  pause
  exit /b 1
)
schtasks /Create /F /TN "SmartOffice" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "\"%~dp0smartoffice-service.bat\""
if errorlevel 1 (
  echo  [LOI] Khong tao duoc tac vu.
  pause
  exit /b 1
)
schtasks /Run /TN "SmartOffice"
echo  Da dang ky va khoi dong tac vu "SmartOffice". Nhat ky: thu muc data\server.log
pause
