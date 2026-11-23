@echo off
cd /d "%~dp0"
title MySQL Backup Studio

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado. Instale em https://nodejs.org/ e execute novamente.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando MySQL Backup Studio em http://127.0.0.1:3010
echo Pressione Ctrl+C para encerrar.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://127.0.0.1:3010'"
node src/server.js

pause
