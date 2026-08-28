@echo off
title Hospital Management System (HMS)
echo ========================================================
echo   Starting Hospital Management System (HMS)...
echo ========================================================
echo.
cd /d "%~dp0"

:: Open default browser to the app after server starts
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000/"

:: Start dev server
call npm.cmd run dev
pause
