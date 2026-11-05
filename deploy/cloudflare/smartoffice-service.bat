@echo off
rem Tep do Task Scheduler goi khi may khoi dong. Khong can chay tay.
cd /d "%~dp0..\.."
set PORT=3000
set TRUST_PROXY=1
set PUBLIC_ORIGINS=https://smartoffice.vnptninhbinh.com.vn
if not exist data mkdir data
node server.js >> data\server.log 2>&1
