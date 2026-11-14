@echo off
rem Double-click to type the free NASA Earthdata login again (or for the first time), then Crophalo starts as usual.
rem The same as "Start Crophalo.bat" with --login. Keep this window open: closing it, or Ctrl-C, stops Crophalo.
rem "-ExecutionPolicy Bypass" counts for this one start only and changes no setting of the PC.
title Crophalo
cd /d "%~dp0" 2>nul
if not exist "%~dp0scripts\start-windows.ps1" goto notwhole
echo Starting Crophalo. Keep this window open: closing it stops Crophalo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1" --login %*
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
