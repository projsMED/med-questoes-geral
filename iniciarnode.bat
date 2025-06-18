@echo off
cd /d %~dp0

echo.
echo Instalando dependências com npm...
call npm install
if %errorlevel% neq 0 (
    echo Houve um erro ao instalar as dependências.
    pause
    exit /b %errorlevel%
)

echo.
echo Iniciando o servidor com node server.js...
start "" http://localhost:3000
call node server.js

if %errorlevel% neq 0 (
    echo Houve um erro ao iniciar o servidor.
)

echo.
pause
