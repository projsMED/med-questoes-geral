@echo off
REM Script para atualizar o repositório Git local e enviar mudanças para o GitHub
REM Exibe pause apenas em caso de erro

echo =====================================
echo Sincronizando com o GitHub (git pull)
echo =====================================
git pull origin main
if errorlevel 1 (
    echo ERRO: falha no git pull.
    pause
    exit /b 1
)

echo.
echo ==============================
echo Adicionando alterações (add .)
echo ==============================
git add .
if errorlevel 1 (
    echo ERRO: falha no git add.
    pause
    exit /b 1
)

echo.
echo ============================================
echo Criando commit automático (mensagem padrão)
echo ============================================
git commit -m "Atualização automática local"
if errorlevel 1 (
    echo ERRO: falha no git commit (talvez nao haja mudancas para commitar).
    pause
    exit /b 1
)

echo.
echo ====================
echo Enviando para o GitHub
echo ====================
git push
if errorlevel 1 (
    echo ERRO: falha no git push.
    pause
    exit /b 1
)

echo.
echo ============
echo Finalizado sem erros!
echo ============
