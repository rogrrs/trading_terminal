@echo off
rem ============================================================================
rem  Trading Terminal: build the Windows desktop application (Tauri v2).
rem  Installs the Rust toolchain if it is missing, then runs npm run desktop:build.
rem  Output: target\release\bundle\
rem  Dependencies are installed only when missing or out of date.
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

where cargo >nul 2>&1
if errorlevel 1 goto :install_rust
goto :rust_ready

:install_rust
echo Rust is not installed. Downloading the installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri https://win.rustup.rs/x86_64 -OutFile $env:TEMP\rustup-init.exe"
if not exist "%TEMP%\rustup-init.exe" goto :err_rust
echo Installing the stable toolchain (minimal profile)...
"%TEMP%\rustup-init.exe" -y --default-toolchain stable --profile minimal
if errorlevel 1 goto :err_rust
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>&1
if errorlevel 1 goto :err_rust

:rust_ready
echo Node:
node -v
echo Rust:
rustc --version
cargo --version
echo.

set "NEED_INSTALL=0"
if not exist "node_modules\.package-lock.json" set "NEED_INSTALL=1"
rem A half-installed node_modules (interrupted npm ci) has no .bin\tsc.cmd.
if not exist "node_modules\.bin\tsc.cmd" set "NEED_INSTALL=1"
if not exist "node_modules\.bin\vite.cmd" set "NEED_INSTALL=1"
if not exist "node_modules\.bin\cross-env.cmd" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { if ((Get-Item 'package-lock.json').LastWriteTimeUtc -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTimeUtc) { exit 1 } else { exit 0 } } catch { exit 1 }"
  if errorlevel 1 set "NEED_INSTALL=1"
)
if "%NEED_INSTALL%"=="0" goto :deps_ready
call npm install --prefer-offline --no-audit --no-fund
if errorlevel 1 goto :err
:deps_ready

call npm run desktop:build
if errorlevel 1 goto :err

echo.
echo Desktop build finished.
echo Installer: target\release\bundle\
exit /b 0

:err_node
echo ERROR: Node.js 20.19 or newer is required. Install it from https://nodejs.org/
if "%ARG_YES%"=="0" pause
exit /b 1

:err_rust
echo ERROR: could not install the Rust toolchain. Install it manually:
echo        https://rustup.rs  then open a new terminal and run this again.
if "%ARG_YES%"=="0" pause
exit /b 1

:err
echo ERROR: desktop build failed. Read the messages above.
echo        Microsoft Visual Studio C++ Build Tools are required:
echo        https://visualstudio.microsoft.com/visual-cpp-build-tools/
if "%ARG_YES%"=="0" pause
exit /b 1
