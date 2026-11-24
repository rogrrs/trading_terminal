@echo off
rem Trading Terminal: shortcut to scripts\start-desktop.bat
rem ASCII only, CRLF line endings.
setlocal
cd /d "%~dp0"
call "scripts\start-desktop.bat" %*
exit /b %ERRORLEVEL%
