@echo off
rem Trading Terminal: stop the local API server listening on port 5175.
rem ASCII only, CRLF line endings.
setlocal
set "PORT=5175"
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /c:":%PORT%" ^| findstr LISTENING') do (
  set "FOUND=1"
  taskkill /f /pid %%P >nul 2>&1
)
if defined FOUND (
  echo Stopped Trading Terminal API.
) else (
  echo Nothing is listening on port %PORT%.
)
exit /b 0
