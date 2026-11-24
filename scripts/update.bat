@echo off
rem ============================================================================
rem  Trading Terminal: update the code from GitHub and rebuild.
rem
rem  - removes build output (dist, dist-server, target\release\bundle)
rem  - keeps node_modules and the Rust incremental cache, so nothing is
rem    re-downloaded unless package-lock.json changed
rem  - keeps the data folder (data\)
rem  - local edits are saved with git stash, never thrown away
rem
rem    update.bat              update and rebuild
rem    update.bat --desktop    update, rebuild and rebuild the desktop app
rem    update.bat /yes         no pause on errors (for scripts)
rem
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
set "ARG_YES=0"
set "ARG_DESKTOP=0"
for %%A in (%*) do (
  if /i "%%~A"=="/yes" set "ARG_YES=1"
  if /i "%%~A"=="--desktop" set "ARG_DESKTOP=1"
)
cd /d "%~dp0.."

if not exist ".git" goto :err_notrepo
where git >nul 2>&1
if errorlevel 1 goto :err_git

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
if "%BRANCH%"=="HEAD" set "BRANCH=main"
echo Branch: %BRANCH%

echo Fetching from GitHub...
git fetch --quiet origin "%BRANCH%"
if errorlevel 1 goto :err_fetch

rem ---- local edits ----------------------------------------------------------
set "DIRTY=0"
for /f %%C in ('git status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if "%DIRTY%"=="0" goto :clean_tree
echo Local changes are saved with git stash (nothing is lost).
git -c user.name=launcher -c user.email=launcher@localhost stash push -m "update"
if errorlevel 1 goto :err_stash
:clean_tree

git reset --hard "origin/%BRANCH%"
if errorlevel 1 goto :err_reset

rem ---- rebuild (build.bat replaces dist\ and dist-server\ atomically) ----
call "%~dp0build.bat" %*
if errorlevel 1 goto :err_build

if "%ARG_DESKTOP%"=="0" goto :done
echo.
echo Rebuilding the desktop application...
call "%~dp0build-desktop.bat" %*
if errorlevel 1 goto :err_build

:done
echo.
echo Update finished. Dependencies were kept, data folder was not touched.
if "%ARG_YES%"=="0" pause
exit /b 0

:err_notrepo
echo ERROR: this folder is not a git clone. Use start_main.bat or start_delta.bat instead.
if "%ARG_YES%"=="0" pause
exit /b 1

:err_git
echo ERROR: git is not installed. Install Git for Windows from https://git-scm.com/download/win
if "%ARG_YES%"=="0" pause
exit /b 1

:err_fetch
echo.
echo ERROR: could not reach GitHub. Check the internet and your GitHub access.
echo        Nothing was changed, the previous build still works.
if "%ARG_YES%"=="0" pause
exit /b 1

:err_stash
echo ERROR: could not save local changes with git stash. Nothing was changed.
if "%ARG_YES%"=="0" pause
exit /b 1

:err_reset
echo ERROR: could not apply the new code. Nothing was changed.
if "%ARG_YES%"=="0" pause
exit /b 1

:err_build
echo.
echo ERROR: update finished but the build failed. Read the messages above.
if "%ARG_YES%"=="0" pause
exit /b 1
