const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'pontos.db');
const db = new sqlite3.Database(dbPath);

db.all(`
  SELECT username, SUM(pontos) as total 
  FROM pontos 
  GROUP BY username 
  ORDER BY total DESC
`, (err, rows) => {
  if (err) {
    console.error('Erro buscando ranking:', err.message);
    return;
  }
  
  console.log('🏆 Ranking de Pontos 🏆');
  rows.forEach((row, index) => {
    console.log(`#${index + 1} ${row.username}: ${row.total} pontos`);
  });
});
