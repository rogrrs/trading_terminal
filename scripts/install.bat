@echo off
rem Trading Terminal: install Node dependencies and build web + server bundles.
rem ASCII only, CRLF line endings.
setlocal
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 goto :err_node

for /f "delims=" %%V in ('node -p "process.version"') do set "NODE_VERSION=%%V"
echo Node.js %NODE_VERSION%
for /f "delims=" %%M in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%M"
if %NODE_MAJOR% LSS 20 goto :err_node

echo Installing npm dependencies...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :err_npm

echo Building the web client...
call npm run build
if errorlevel 1 goto :err_build

echo Building the local API server...
call npm run build:server
if errorlevel 1 goto :err_build

echo.
echo Install finished. Run scripts\start.bat to launch the terminal.
exit /b 0

:err_node
echo ERROR: Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this again.
exit /b 1

:err_npm
echo ERROR: npm ci failed. Check the messages above and run this again.
exit /b 1

:err_build
echo ERROR: build failed. Check the messages above and run this again.
exit /b 1
