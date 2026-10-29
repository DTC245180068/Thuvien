@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
echo.
echo  ============================================
echo   SmartLib Backend - http://localhost:8000
echo  ============================================
echo.
python run.py
pause

