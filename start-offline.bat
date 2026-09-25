@echo off
title AI Video Editor Pro - Offline & Online
echo ========================================================
echo   AI Video Editor Pro - Professional Video Studio
echo   Offline & Online Mode Ready
echo ========================================================
echo.
echo Starting local server and opening studio in browser...
echo URL: http://127.0.0.1:8080
echo.

REM Open default browser
start "" "http://127.0.0.1:8080"

REM Run local server
python server.py

pause
