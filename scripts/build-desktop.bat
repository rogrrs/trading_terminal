@echo off
rem ============================================================================
rem  Trading Terminal: build the Windows desktop application (Tauri v2).
rem  Installs the Rust toolchain if it is missing, then runs npm run desktop:build.
rem  Output: src-tauri\target\release\bundle\
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
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

call npm ci --no-audit --no-fund
if errorlevel 1 goto :err
call npm run desktop:build
if errorlevel 1 goto :err

echo.
echo Desktop build finished.
echo Installer: src-tauri\target\release\bundle\
exit /b 0

:err_node
echo ERROR: Node.js 20.19 or newer is required. Install it from https://nodejs.org/
exit /b 1

:err_rust
echo ERROR: could not install the Rust toolchain. Install it manually:
echo        https://rustup.rs  then open a new terminal and run this again.
exit /b 1

:err
echo ERROR: desktop build failed. Read the messages above.
echo        Microsoft Visual Studio C++ Build Tools are required:
echo        https://visualstudio.microsoft.com/visual-cpp-build-tools/
exit /b 1
