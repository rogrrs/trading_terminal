@echo off
rem ============================================================================
rem  LAUNCHER. Double-click: it downloads, updates, installs and starts the app.
rem
rem  Built-in rules (do not remove them):
rem    - data folders are never deleted by this file;
rem    - local changes to tracked files are saved with git stash, never thrown away;
rem    - if a step fails, the window stays open and the log says why;
rem    - every step is written to the log file next to this file.
rem  Keep this file ASCII only (no Cyrillic) and CRLF line endings.
rem ============================================================================
if /i "%~1"=="--child" goto :main

rem The update may replace this very file, so the work runs from a copy in TEMP.
set "CHILD=%TEMP%\launcher_%RANDOM%%RANDOM%.bat"
copy /y "%~f0" "%CHILD%" >nul 2>&1
if not exist "%CHILD%" goto :main
call "%CHILD%" --child "%~dp0."
set "RC=%ERRORLEVEL%"
del "%CHILD%" >nul 2>&1
exit /b %RC%

:main
rem ============================ SETTINGS ======================================
set "APP_NAME=Trading Terminal"
set "REPO_URL=https://github.com/rogrrs/trading_terminal.git"
set "BRANCH=delta"
set "PROJECT_DIRNAME=trading_terminal-delta"
set "INSTALL_CMD=scripts\install.bat"
set "START_CMD=scripts\start.bat"
set "STOP_CMD=scripts\stop.bat"
set "STATE_DIR=data"
set "LOG_NAME=start_delta.log"
rem ============================================================================

set "HERE=%~dp0."
if /i "%~1"=="--child" set "HERE=%~2"
for %%I in ("%HERE%") do set "HERE=%%~fI"
set "LOG=%HERE%\%LOG_NAME%"
cd /d "%HERE%"

set "ONLINE=1"
set "INST_SHA="
set "CUR_SHA="
set "TARGET_SHA="
set "CUR_BRANCH="
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
if exist "%HERE%\.git" goto :in_place
set "TARGET=%HERE%\%PROJECT_DIRNAME%"
goto :have_target
:in_place
set "TARGET=%HERE%"
:have_target

call :say "=== %APP_NAME% launcher, branch %BRANCH%, %STAMP% ==="
call :say "Project folder: %TARGET%"

where git >nul 2>&1
if errorlevel 1 goto :err_git

if exist "%TARGET%\.git" goto :repo_present
if exist "%TARGET%" goto :err_notgit
call :say "Not downloaded yet. Cloning branch %BRANCH%. The first time can take a few minutes."
call :say "If GitHub asks you to sign in, use the window that opens."
git clone --branch %BRANCH% "%REPO_URL%" "%TARGET%"
if errorlevel 1 goto :err_clone
goto :repo_ready

:repo_present
git -C "%TARGET%" rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :err_notgit
for /f "delims=" %%B in ('git -C "%TARGET%" rev-parse --abbrev-ref HEAD') do set "CUR_BRANCH=%%B"
if not "%CUR_BRANCH%"=="%BRANCH%" goto :err_branch
call :say "Checking GitHub for a newer version of branch %BRANCH%"
git -C "%TARGET%" fetch --quiet origin %BRANCH%
if errorlevel 1 set "ONLINE=0"
if "%ONLINE%"=="0" call :say "WARNING: GitHub is not reachable. The installed version will be used."

:repo_ready
for /f %%S in ('git -C "%TARGET%" rev-parse HEAD') do set "CUR_SHA=%%S"
set "TARGET_SHA=%CUR_SHA%"
if "%ONLINE%"=="1" for /f %%S in ('git -C "%TARGET%" rev-parse origin/%BRANCH%') do set "TARGET_SHA=%%S"
if exist "%TARGET%\%STATE_DIR%\installed-sha.txt" set /p INST_SHA=<"%TARGET%\%STATE_DIR%\installed-sha.txt"
call :say "Installed commit: %INST_SHA%"
call :say "Commit to run:    %TARGET_SHA%"

if "%CUR_SHA%"=="%TARGET_SHA%" goto :no_update
call :say "A newer version is on GitHub. Updating the code. Your data stays."
call :stop_app
call :save_local_changes
git -C "%TARGET%" reset --hard origin/%BRANCH%
if errorlevel 1 goto :err_reset
set "CUR_SHA=%TARGET_SHA%"
call :say "Code updated to %TARGET_SHA%"
:no_update

set "NEED_INSTALL=0"
if not "%INST_SHA%"=="%TARGET_SHA%" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="1" goto :do_install
call :say "Already installed and up to date."
goto :start_app

:do_install
if "%INSTALL_CMD%"=="" goto :no_install_step
call :say "Installing: %INSTALL_CMD%"
pushd "%TARGET%"
call %INSTALL_CMD%
set "INST_RC=%ERRORLEVEL%"
popd
if not "%INST_RC%"=="0" goto :err_install
:no_install_step
if not exist "%TARGET%\%STATE_DIR%" mkdir "%TARGET%\%STATE_DIR%"
> "%TARGET%\%STATE_DIR%\installed-sha.txt" echo %TARGET_SHA%
call :say "Installation finished. Installed commit: %TARGET_SHA%"

:start_app
set "VER=unknown"
if exist "%TARGET%\VERSION" set /p VER=<"%TARGET%\VERSION"
call :say "Starting %APP_NAME%, version %VER%"
if "%START_CMD%"=="" goto :err_nostart
pushd "%TARGET%"
call %START_CMD%
set "START_RC=%ERRORLEVEL%"
popd
if not "%START_RC%"=="0" goto :err_start
call :say "Started. Details: %LOG%"
exit /b 0

:err_git
call :say "ERROR: git is not installed. Install Git for Windows from https://git-scm.com/download/win and run this file again."
goto :fail
:err_notgit
call :say "ERROR: the folder %TARGET% exists but is not a git copy of this repository. Nothing was changed. Rename or move that folder and run again."
goto :fail
:err_branch
call :say "ERROR: this folder is on branch %CUR_BRANCH%, but this file is for branch %BRANCH%. Put this file into another folder and run it there."
goto :fail
:err_clone
call :say "ERROR: download from GitHub failed. Check the internet and your GitHub access, then run again."
goto :fail
:err_reset
call :say "ERROR: could not apply the new code. Close all windows of the app and run this file again. Data was not touched."
goto :fail
:err_install
call :say "ERROR: installation failed. Read the messages above, fix the cause and run this file again."
goto :fail
:err_nostart
call :say "ERROR: START_CMD is empty. Set the start command in the SETTINGS block."
goto :fail
:err_start
call :say "ERROR: %APP_NAME% did not start. Read the messages above."
goto :fail
:fail
call :say "Stopped. Log: %LOG%"
pause
exit /b 1

rem ---------------------------------------------------------------- subroutines
:stop_app
if "%STOP_CMD%"=="" exit /b 0
call :say "Stopping %APP_NAME% before the update"
pushd "%TARGET%"
call %STOP_CMD%
popd
exit /b 0

:save_local_changes
set "DIRTY=0"
for /f %%C in ('git -C "%TARGET%" status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if "%DIRTY%"=="0" exit /b 0
call :say "Local changes to tracked files are saved with git stash (nothing is lost). See: git stash list"
git -C "%TARGET%" -c user.name=launcher -c user.email=launcher@localhost stash push -m "launcher-%STAMP%"
exit /b 0

:say
echo %~1
>>"%LOG%" echo [%date% %time%] %~1
exit /b 0
