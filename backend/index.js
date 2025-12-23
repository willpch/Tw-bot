// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Conectar ao banco de dados SQLite
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database/pontos.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados pontos.db');
    }
});

// Credenciais de login (hardcoded)
const USERNAME = process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.ADMIN_PASS || 'senha123lais';

// Endpoint de login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USERNAME && password === PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
});

// Endpoint do ranking
app.get('/ranking', (req, res) => {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'Mês obrigatório' });

    //console.log('Mês recebido:', month);

    db.all(`
    SELECT username, SUM(pontos) as total
    FROM pontos
    WHERE data LIKE ?
    GROUP BY username
    ORDER BY total DESC
  `, [`${month}-%`], (err, rows) => {
        if (err) {
            console.error('Erro na consulta:', err);
            return res.status(500).json({ error: 'Erro interno' });
        }

        //console.log('Dados do banco de dados:', rows);
        res.json(rows);
    });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Painel Backend rodando na porta ${PORT}`));