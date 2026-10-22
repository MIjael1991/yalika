@echo off
title YALIKA - COMPARTIR ENCUESTAS
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\yalika-local\compartir-encuestas.ps1"
echo.
pause
