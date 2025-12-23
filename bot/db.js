const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'pontos.db');
const db = new sqlite3.Database(dbPath);

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
