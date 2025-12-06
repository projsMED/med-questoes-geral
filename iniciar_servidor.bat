@echo off
title Servidor Python

echo Iniciando servidor Python na porta 8000...
start "" python -m http.server 8000

:: Aguarda alguns segundos para o servidor subir
timeout /t 2 >nul

echo Abrindo navegador...
start http://localhost:8000

echo Servidor iniciado. Pressione CTRL+C na janela do servidor para parar.
pause >nul
