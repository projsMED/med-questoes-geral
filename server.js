// Gera o quizes.json automaticamente ao iniciar o servidor
require('./gerar-quizes-json.js');

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve arquivos estáticos (como quizes-da-nuvem/ e quizes.json)
app.use(express.static(__dirname));

// Rota principal: envia o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});