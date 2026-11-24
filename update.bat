@echo off
rem Trading Terminal: shortcut to scripts\update.bat
rem ASCII only, CRLF line endings.
setlocal
cd /d "%~dp0"
call "scripts\update.bat" %*
exit /b %ERRORLEVEL%
