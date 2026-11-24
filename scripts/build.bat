@echo off
rem ============================================================================
rem  Trading Terminal: build the web client + API server.
rem
rem  - dependencies are installed ONLY when missing or out of date
rem    (package-lock.json newer than node_modules), so a routine rebuild
rem    downloads nothing
rem  - builds into dist.new / dist-server.new and swaps them in, so a failed
rem    build never leaves a half-removed working build
rem  - node_modules is never deleted
rem
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
set "ARG_YES=0"
for %%A in (%*) do if /i "%%~A"=="/yes" set "ARG_YES=1"
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 goto :err_node
for /f "delims=" %%M in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%M"
if %NODE_MAJOR% LSS 20 goto :err_node

rem ---- 1/4 dependencies -----------------------------------------------------
set "NEED_INSTALL=0"
if not exist "node_modules\.package-lock.json" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { if ((Get-Item 'package-lock.json').LastWriteTimeUtc -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTimeUtc) { exit 1 } else { exit 0 } } catch { exit 1 }"
  if errorlevel 1 set "NEED_INSTALL=1"
)

if "%NEED_INSTALL%"=="0" goto :deps_ready
echo [1/4] Installing dependencies (only when needed)
call npm install --prefer-offline --no-audit --no-fund
if errorlevel 1 goto :err_npm
goto :deps_ready

:deps_ready
if "%NEED_INSTALL%"=="0" echo [1/4] Dependencies are up to date, skipping npm install

rem ---- 2/4 clean staging dirs ----------------------------------------------
echo [2/4] Preparing clean output folders
if exist "dist.new" rd /s /q "dist.new"
if exist "dist-server.new" rd /s /q "dist-server.new"

rem ---- 3/4 web client -------------------------------------------------------
echo [3/4] Building the web client
call npm run build -- --outDir dist.new
if errorlevel 1 goto :err_build

rem ---- 4/4 API server -------------------------------------------------------
echo [4/4] Building the API server
call npx tsc -p tsconfig.server.json --outDir dist-server.new
if errorlevel 1 goto :err_build

rem ---- swap: the old build is replaced only after a successful build --------
if exist "dist" rd /s /q "dist"
if exist "dist" goto :err_swap
if not exist "dist.new" goto :err_swap
ren "dist.new" "dist"
if exist "dist-server" rd /s /q "dist-server"
if exist "dist-server" goto :err_swap
if not exist "dist-server.new" goto :err_swap
ren "dist-server.new" "dist-server"

echo.
echo Build finished.
echo   web client : dist\
echo   API server : dist-server\
exit /b 0

:err_node
echo ERROR: Node.js 20.19 or newer is required. Install it from https://nodejs.org/
if "%ARG_YES%"=="0" pause
exit /b 1

:err_npm
echo.
echo ERROR: dependency installation failed.
echo        Check the internet connection and run update.bat again.
echo        node_modules was NOT removed, so the previous build still works.
if exist "dist.new" rd /s /q "dist.new"
if exist "dist-server.new" rd /s /q "dist-server.new"
if "%ARG_YES%"=="0" pause
exit /b 1

:err_swap
echo.
echo ERROR: could not replace the old build. Close all app windows and run again.
if "%ARG_YES%"=="0" pause
exit /b 1

:err_build
echo.
echo ERROR: build failed. The previous build was kept, nothing was replaced.
if exist "dist.new" rd /s /q "dist.new"
if exist "dist-server.new" rd /s /q "dist-server.new"
if "%ARG_YES%"=="0" pause
exit /b 1
