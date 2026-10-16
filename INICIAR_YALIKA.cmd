@echo off
setlocal
title YALIKA - INICIO LOCAL UNICO
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\yalika-local\iniciar-yalika.ps1"
set RC=%ERRORLEVEL%
echo.
if not "%RC%"=="0" (
  echo YALIKA no pudo iniciar completamente. Revisa el diagnostico anterior.
)
pause
exit /b %RC%
