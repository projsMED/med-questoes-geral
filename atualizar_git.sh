#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"

echo "====================================="
echo "Sincronizando com o GitHub (git pull)"
echo "====================================="
git pull origin main

echo
echo "=============================="
echo "Adicionando alterações (sem node_modules)"
echo "=============================="
git add . ':!node_modules'

echo
echo "============================================"
echo "Criando commit automático (com mensagem padrão)"
echo "============================================"
git commit -m "Atualização automática local"

echo
echo "===================="
echo "Enviando para o GitHub"
echo "===================="
git push

echo
echo "============"
echo "Finalizado!"
echo "============"
