@echo off
rem ============================================================================
rem  Trading Terminal: start the local API + web client and open the browser.
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
cd /d "%~dp0.."

if not exist "dist\index.html" goto :err_nobuild
if not exist "dist-server\server\index.js" goto :err_nobuild

start "Trading Terminal" /min cmd /c "npm start"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5175"
exit /b 0

:err_nobuild
echo ERROR: the build is missing. Run build.bat first.
echo        If it fails, read the messages in that window and send them to me.
pause
exit /b 1
