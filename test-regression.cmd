@echo off
cd /d "%~dp0"
echo =================================================================
echo   OTP Platform - Master Regression Suite Runner
echo =================================================================
call pnpm.cmd test:regression
pause
