@echo off
setlocal
title YALEKA - INICIO LOCAL UNICO
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\yalika-local\iniciar-yalika.ps1"
set RC=%ERRORLEVEL%
echo.
if not "%RC%"=="0" (
  echo YALEKA no pudo iniciar completamente. Revisa el diagnostico anterior.
)
pause
exit /b %RC%
