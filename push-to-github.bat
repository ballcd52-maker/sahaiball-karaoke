@echo off
title Push SahaiBall Karaoke to GitHub
cd /d "%~dp0"
echo =======================================================
echo    Pushing SahaiBall Karaoke to GitHub...
echo =======================================================
echo.
echo If a window pops up, click "Sign in with your browser" to authorize.
echo.
"C:\Program Files\Git\cmd\git.exe" push -u origin main
echo.
echo =======================================================
echo    Push completed!
echo =======================================================
pause
