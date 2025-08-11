const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();

// Configuração CORS mais específica
app.use(cors({
  origin: 'http://maia.maiascript.com', // ou '*' para desenvolvimento
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Servir arquivos estáticos
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Rotas API - IMPORTANTE: prefixo '/api'
app.use('/api', apiRoutes);

// Fallback route - deve vir depois das rotas API
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});