const mysql = require('mysql2/promise');
const config = require('./config');

/**
 * Pool de conexões, sempre com a API de promises.
 *
 * O código antigo misturava os dois estilos: pool.promise().query() na maior
 * parte dos comandos e pool.query() com callback no !addpontos.
 */
const pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 15000,
    timezone: 'local',
    charset: 'utf8mb4',
    // Sem isto o driver devolve DECIMAL como string e as somas viram
    // concatenação de texto.
    decimalNumbers: true,
});

module.exports = pool;
