const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'pontos.db');
// Resolve caminho absoluto
const resolvedDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(__dirname, dbPath);
// Garante que o diretório existe
const dbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('Diretório do banco criado em:', dbDir);
}
console.log('Usando banco de dados em:', resolvedDbPath);

const db = new sqlite3.Database(resolvedDbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      data TEXT,
      pontos INTEGER
    )
  `);
});

module.exports = db;
