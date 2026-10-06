@echo off
title AstroDX Song Compiler
echo ========================================================
echo        AstroDX Song Package Compiler (.adx)
echo ========================================================
echo.
echo Starting local engine on http://localhost:5173 ...
echo.

where python >nul 2>nul
if %errorlevel% equ 0 (
    start "" http://localhost:5173
    python "%~dp0server.py"
) else (
    echo Python not found in PATH, launching directly in browser...
    start "" "%~dp0index.html"
)
pause
