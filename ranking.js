const pool = require('./db');

pool.query(`
  SELECT username, SUM(pontos) as total 
  FROM pontos 
  GROUP BY username 
  ORDER BY total DESC
`, (err, results) => {
  if (err) {
    console.error('Erro buscando ranking:', err.message);
    return;
  }

  console.log('\uD83C\uDFC6 Ranking de Pontos \uD83C\uDFC6');
  results.forEach((row, index) => {
    console.log(`#${index + 1} ${row.username}: ${row.total} pontos`);
  });
  pool.end();
});
