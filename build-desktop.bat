@echo off
rem Trading Terminal: shortcut to scripts\build-desktop.bat
rem ASCII only, CRLF line endings.
setlocal
cd /d "%~dp0"
call "scripts\build-desktop.bat" %*
exit /b %ERRORLEVEL%
