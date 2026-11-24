@echo off
rem ============================================================================
rem  Trading Terminal: update the code from GitHub and rebuild.
rem  The data folder is never touched. Local changes are saved with git stash.
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
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

set "DIRTY=0"
for /f %%C in ('git status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if "%DIRTY%"=="0" goto :clean
echo Local changes are saved with git stash (nothing is lost).
git -c user.name=launcher -c user.email=launcher@localhost stash push -m "update"
:clean
git reset --hard "origin/%BRANCH%"
if errorlevel 1 goto :err_reset

call "%~dp0build.bat"
if errorlevel 1 exit /b 1

if /i not "%~1"=="--desktop" goto :done
echo.
echo Rebuilding the desktop application...
call "%~dp0build-desktop.bat"
if errorlevel 1 exit /b 1

:done
echo.
echo Update finished. Data folder was not touched.
exit /b 0

:err_notrepo
echo ERROR: this folder is not a git clone. Use start_main.bat / start_delta.bat instead.
exit /b 1

:err_git
echo ERROR: git is not installed. Install Git for Windows from https://git-scm.com/download/win
exit /b 1

:err_fetch
echo ERROR: could not reach GitHub. Check the internet and your GitHub access.
exit /b 1

:err_reset
echo ERROR: could not apply the new code. Nothing was changed.
exit /b 1
