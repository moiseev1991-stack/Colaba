@echo off
REM Run CI-like tests locally. Uses scripts\run-tests.ps1.
set "SCRIPT=%~dp0run-tests.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
