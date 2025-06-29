@echo off
REM Script para atualizar o repositório Git local e enviar mudanças para o GitHub

echo =====================================
echo Sincronizando com o GitHub (git pull)
echo =====================================
git pull origin main

echo.
echo ==============================
echo Adicionando alterações (add .)
echo ==============================
git add .

echo.
echo ============================================
echo Criando commit automático (com mensagem padrão)
echo ============================================
git commit -m "Atualização automática local"

echo.
echo ====================
echo Enviando para o GitHub
echo ====================
git push

echo.
echo ============
echo Finalizado!
echo ============
