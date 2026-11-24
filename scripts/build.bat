@echo off
rem ============================================================================
rem  Trading Terminal: install dependencies and build the web client + API server.
rem  Run from anywhere. Output: dist\ and dist-server\
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 goto :err_node
for /f "delims=" %%M in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%M"
if %NODE_MAJOR% LSS 20 goto :err_node

echo [1/3] Installing npm dependencies
call npm ci --no-audit --no-fund
if errorlevel 1 goto :err

echo [2/3] Building the web client
call npm run build
if errorlevel 1 goto :err

echo [3/3] Building the API server
call npm run build:server
if errorlevel 1 goto :err

echo.
echo Build finished.
echo   web client : dist\
echo   API server : dist-server\
echo Run start.bat to launch.
exit /b 0

:err_node
echo ERROR: Node.js 20.19 or newer is required. Install it from https://nodejs.org/
exit /b 1

:err
echo ERROR: build failed. Read the messages above.
exit /b 1
