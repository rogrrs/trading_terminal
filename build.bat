@echo off
rem Trading Terminal: shortcut to scripts\build.bat
rem ASCII only, CRLF line endings.
setlocal
cd /d "%~dp0"
call "scripts\build.bat" %*
exit /b %ERRORLEVEL%
