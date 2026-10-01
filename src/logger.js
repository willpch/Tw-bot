const fs = require('fs');
const path = require('path');

/**
 * Log simples com timestamp no fuso local.
 *
 * O arquivo ponto_errors.log crescia sem limite e estava versionado no git.
 * Agora é rotacionado ao passar de 2 MB e fica fora do controle de versão.
 */

const ARQUIVO = path.join(__dirname, '..', 'ponto_errors.log');
const TAMANHO_MAX = 2 * 1024 * 1024;

function agora() {
    return new Date().toLocaleString('pt-BR');
}

function info(mensagem, ...resto) {
    console.log(`[${agora()}] ${mensagem}`, ...resto);
}

function aviso(mensagem, ...resto) {
    console.warn(`[${agora()}] AVISO ${mensagem}`, ...resto);
}

function erro(mensagem, ...resto) {
    console.error(`[${agora()}] ERRO ${mensagem}`, ...resto);
}

function rotacionar() {
    try {
        const stat = fs.statSync(ARQUIVO);
        if (stat.size >= TAMANHO_MAX) {
            fs.renameSync(ARQUIVO, `${ARQUIVO}.1`);
        }
    } catch (e) {
        // Arquivo ainda não existe: nada a rotacionar.
    }
}

/** Registra em arquivo um erro ocorrido ao bater ponto, com a etapa que falhou. */
function logPontoError(username, mensagem, error, etapa) {
    const separador = '='.repeat(80);
    const entrada = [
        separador,
        `[${new Date().toISOString()}] ERRO AO BATER PONTO`,
        `Usuário    : ${username}`,
        `Mensagem   : ${mensagem}`,
        `Etapa      : ${etapa || 'desconhecida'}`,
        `Erro       : ${error && error.message ? error.message : String(error)}`,
        `Stack      : ${error && error.stack ? error.stack : 'N/A'}`,
        `SQL State  : ${error && error.sqlState ? error.sqlState : 'N/A'}`,
        `SQL Message: ${error && error.sqlMessage ? error.sqlMessage : 'N/A'}`,
        separador,
        '',
    ].join('\n');

    rotacionar();
    fs.appendFile(ARQUIVO, entrada, (fsErr) => {
        if (fsErr) console.error('Falha ao gravar log de erro:', fsErr.message);
    });

    console.error(entrada);
}

module.exports = { info, aviso, erro, logPontoError };
