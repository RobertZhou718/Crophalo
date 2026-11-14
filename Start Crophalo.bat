@echo off
rem Double-click to start Crophalo on a Windows PC. The first start takes a few minutes: it sets up its own tools inside this folder.
rem Keep this window open: closing it, or Ctrl-C, stops Crophalo. Windows PowerShell does the work (scripts\start-windows.ps1);
rem "-ExecutionPolicy Bypass" counts for this one start only and changes no setting of the PC.
title Crophalo
cd /d "%~dp0" 2>nul
if not exist "%~dp0scripts\start-windows.ps1" goto notwhole
echo Starting Crophalo. Keep this window open: closing it stops Crophalo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1" %*
if errorlevel 1 goto failed
exit /b 0

:notwhole
echo This is not a whole Crophalo folder: scripts\start-windows.ps1 is missing.
echo If Crophalo came as a zip file: right-click the zip, choose "Extract All", then start it from the new folder.

:failed
echo.
echo Crophalo stopped. Read the lines above. The record of the setup is in runtime\setup.log inside this folder.
pause
exit /b 1
