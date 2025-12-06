#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"

echo "Instalando dependências..."
npm install

if [ $? -ne 0 ]; then
  echo "Erro na instalação das dependências."
  exit 1
fi

echo "Iniciando o servidor..."
xdg-open http://localhost:3000 > /dev/null 2>&1 &
node server.js
