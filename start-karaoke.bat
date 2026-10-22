@echo off
title SahaiBall Karaoke System
cd /d "%~dp0"
echo =======================================================
echo    Starting SahaiBall Karaoke System...
echo =======================================================
echo.
start http://localhost:3000
node server.js
pause
