@echo off
rem ============================================================================
rem  Trading Terminal: launch the built desktop application.
rem  Looks for the .exe in the Cargo workspace target folder (repo root) first.
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
cd /d "%~dp0.."

set "EXE="
if "%EXE%"=="" if exist "target\release\trading-terminal.exe" set "EXE=target\release\trading-terminal.exe"
if "%EXE%"=="" if exist "target\release\Trading Terminal.exe" set "EXE=target\release\Trading Terminal.exe"
if "%EXE%"=="" if exist "target\debug\trading-terminal.exe" set "EXE=target\debug\trading-terminal.exe"
if "%EXE%"=="" if exist "src-tauri\target\release\trading-terminal.exe" set "EXE=src-tauri\target\release\trading-terminal.exe"
if "%EXE%"=="" if exist "src-tauri\target\debug\trading-terminal.exe" set "EXE=src-tauri\target\debug\trading-terminal.exe"
if "%EXE%"=="" goto :err

echo Starting %EXE%
start "" "%EXE%"
exit /b 0

:err
echo ERROR: the desktop build is missing. Run build-desktop.bat first.
exit /b 1
