@echo off
rem ============================================================================
rem  UNINSTALL. Stops the app, removes the program folders listed below and
rem  KEEPS the data folder.
rem
rem    uninstall.bat            stop the app, remove program files, keep data
rem    uninstall.bat /dryrun    show what would be removed, change nothing
rem    uninstall.bat /yes       no questions (for scripts)
rem    uninstall.bat /purge     also remove the data folder (asks you to type DELETE)
rem
rem  Keep this file ASCII only (no Cyrillic) and CRLF line endings.
rem ============================================================================
setlocal
set "ARG_PURGE=0"
set "ARG_YES=0"
set "ARG_DRY=0"
for %%A in (%*) do (
  if /i "%%~A"=="/purge" set "ARG_PURGE=1"
  if /i "%%~A"=="/yes" set "ARG_YES=1"
  if /i "%%~A"=="/dryrun" set "ARG_DRY=1"
)

rem ============================ SETTINGS ======================================
set "APP_NAME=Trading Terminal"
set "PROJECT_DIRNAME=trading_terminal-main"
set "STOP_CMD=scripts\stop.bat"
set "STATE_DIR=data"
rem ============================================================================

set "PROJECT=%~dp0%PROJECT_DIRNAME%\"
if exist "%~dp0.git" set "PROJECT=%~dp0"

echo.
echo %APP_NAME% uninstall
echo Project folder: %PROJECT%
echo.

if "%ARG_DRY%"=="1" goto :stop_skipped
if "%STOP_CMD%"=="" goto :stop_skipped
pushd "%PROJECT%"
call %STOP_CMD%
popd
:stop_skipped

if "%ARG_YES%"=="1" goto :confirmed
if "%ARG_DRY%"=="1" goto :confirmed
echo This removes the PROGRAM folders listed in this file. Data is kept.
set "ANSWER="
set /p "ANSWER=Continue? (y/n): "
if /i not "%ANSWER%"=="y" goto :cancelled
:confirmed

rem ---------------------------------------------------------------- PROGRAM FOLDERS
call :remove "%PROJECT%node_modules"
call :remove "%PROJECT%dist"
call :remove "%PROJECT%dist-server"
call :remove "%PROJECT%target"
call :remove "%~dp0trading_terminal-delta\node_modules"
call :remove "%~dp0trading_terminal-delta\dist"
call :remove "%~dp0trading_terminal-delta\dist-server"
call :remove "%~dp0trading_terminal-delta\target"
rem ---------------------------------------------------------------------------

if "%ARG_PURGE%"=="1" goto :purge_data
echo Data kept: %PROJECT%%STATE_DIR%
goto :done

:purge_data
if "%ARG_DRY%"=="1" goto :purge_dry
if "%ARG_YES%"=="1" goto :purge_now
set "ANSWER2="
set /p "ANSWER2=Type DELETE to remove the data folder for good: "
if not "%ANSWER2%"=="DELETE" goto :data_kept
:purge_now
call :remove "%PROJECT%%STATE_DIR%"
goto :done
:purge_dry
echo would remove data: %PROJECT%%STATE_DIR%
goto :done
:data_kept
echo Data kept: %PROJECT%%STATE_DIR%
goto :done

:cancelled
echo Cancelled. Nothing was removed.
exit /b 0

:done
echo.
echo Uninstall finished.
if "%ARG_YES%"=="0" pause
exit /b 0

rem ---------------------------------------------------------------- subroutines
:remove
if "%~1"=="" exit /b 0
if "%~1"=="%PROJECT%" exit /b 0
if "%~1"=="%PROJECT%\" exit /b 0
if not exist "%~1" exit /b 0
if "%ARG_DRY%"=="1" echo would remove: %~1
if "%ARG_DRY%"=="1" exit /b 0
echo removing: %~1
if exist "%~1\" (rd /s /q "%~1") else (del /f /q "%~1")
exit /b 0
