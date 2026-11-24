@echo off
rem ============================================================================
rem  Trading Terminal: update the code from GitHub and rebuild.
rem  Runs from a TEMP copy, because the update rewrites the scripts on disk.
rem  Full description and options: scripts\update.bat
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal

set "ARG_YES=0"
set "ARG_DESKTOP=0"
for %%A in (%*) do (
  if /i "%%~A"=="/yes" set "ARG_YES=1"
  if /i "%%~A"=="--desktop" set "ARG_DESKTOP=1"
)

set "PROJECT=%~dp0"
if /i "%~1"=="--child" set "PROJECT=%~2"
if /i "%~1"=="--child" goto :child

set "WORK=%TEMP%\tt-update-%RANDOM%%RANDOM%"
mkdir "%WORK%" >nul 2>&1
copy /y "%~dp0scripts\*.bat" "%WORK%\" >nul 2>&1
if not exist "%WORK%\update.bat" goto :child
call "%WORK%\update.bat" --child "%PROJECT%"
set "RC=%ERRORLEVEL%"
rd /s /q "%WORK%" >nul 2>&1
exit /b %RC%

:child
set "PASS="
if "%ARG_YES%"=="1" set "PASS=/yes"
if "%ARG_DESKTOP%"=="1" set "PASS=%PASS% --desktop"
call "%PROJECT%scripts\update.bat" %PASS%
exit /b %ERRORLEVEL%
