@echo off
REM --------------------------------------------
REM  gerar-quizes.bat
REM  Gera quizes.json a partir dos .txt em quizes-da-nuvem
REM --------------------------------------------

:: Vai para a pasta onde o .bat está
cd /d "%~dp0"

:: Executa o script Node
node gerar-quizes-json.js

:: Mantém a janela aberta até que você pressione uma tecla
echo.
echo Pressione qualquer tecla para fechar…
pause > nul
