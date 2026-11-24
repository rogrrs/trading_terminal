@echo off
rem ============================================================================
rem  Trading Terminal: install hook used by the launchers.
rem  Installs npm dependencies and builds the web client and the API server.
rem  ASCII only, CRLF line endings.
rem ============================================================================
setlocal
cd /d "%~dp0.."
call "%~dp0build.bat" %*
exit /b %ERRORLEVEL%
