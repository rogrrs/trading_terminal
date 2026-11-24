@echo off
rem Trading Terminal: shortcut to scripts\start.bat
rem ASCII only, CRLF line endings.
setlocal
cd /d "%~dp0"
call "scripts\start.bat" %*
exit /b %ERRORLEVEL%
