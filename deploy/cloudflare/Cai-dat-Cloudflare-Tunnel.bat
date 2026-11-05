@echo off
chcp 65001 >nul
title SmartOffice - Cai dat Cloudflare Tunnel
rem Chay tep nay bang quyen Administrator (chuot phai > Run as administrator).
net session >nul 2>&1
if errorlevel 1 (
  echo  [LOI] Can chay bang quyen Administrator.
  pause
  exit /b 1
)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo  Dang cai dat cloudflared qua winget...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo  [LOI] Khong cai duoc tu dong. Tai thu cong tai:
    echo  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    pause
    exit /b 1
  )
  echo  Da cai xong. Dong cua so nay va chay lai tep de nhan lenh cloudflared.
  pause
  exit /b 0
)

echo.
echo  Tao tunnel tren trang Cloudflare: Zero Trust ^> Networks ^> Tunnels ^> Create a tunnel
echo  (loai Cloudflared, ten: smartoffice). Sao chep MA TOKEN o buoc "Install connector".
echo.
set /p CF_TOKEN= Dan ma token vao day roi nhan Enter: 
if "%CF_TOKEN%"=="" (
  echo  [LOI] Chua nhap ma token.
  pause
  exit /b 1
)
cloudflared service install %CF_TOKEN%
if errorlevel 1 (
  echo  [LOI] Cai dich vu that bai. Neu da cai truoc do, chay: cloudflared service uninstall  roi thu lai.
  pause
  exit /b 1
)
echo.
echo  Da cai Cloudflare Tunnel thanh dich vu Windows (tu khoi dong cung may).
echo  Tiep theo: tren trang Tunnel, muc Public Hostname, them:
echo     Subdomain: smartoffice   Domain: vnptninhbinh.com.vn   Service: HTTP  localhost:3000
pause
