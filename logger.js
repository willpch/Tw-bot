const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'ponto_errors.log');

function logPontoError(username, message, error, etapa) {
    const timestamp = new Date().toISOString();
    const separator = '='.repeat(80);

    const entry = [
        separator,
        `[${timestamp}] ERRO AO BATER PONTO`,
        `Usuário    : ${username}`,
        `Mensagem   : ${message}`,
        `Etapa      : ${etapa || 'desconhecida'}`,
        `Erro       : ${error && error.message ? error.message : String(error)}`,
        `Stack      : ${error && error.stack ? error.stack : 'N/A'}`,
        `SQL State  : ${error && error.sqlState ? error.sqlState : 'N/A'}`,
        `SQL Message: ${error && error.sqlMessage ? error.sqlMessage : 'N/A'}`,
        `SQL        : ${error && error.sql ? error.sql : 'N/A'}`,
        separator,
        ''
    ].join('\n');

    fs.appendFile(LOG_FILE, entry, (fsErr) => {
        if (fsErr) console.error('Falha ao gravar log de erro:', fsErr.message);
    });

    // Também loga no console para visibilidade imediata
    console.error(entry);
}

module.exports = { logPontoError };


