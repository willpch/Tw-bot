const pool = require('../db');
const config = require('../config');
const log = require('../logger');

/**
 * Confere na inicialização se o banco tem a estrutura que o bot depende.
 *
 * Isto existe porque a proteção contra ponto duplicado agora mora no BANCO
 * (UNIQUE KEY em username + dia), não no código. Se a migration não tiver sido
 * aplicada, o INSERT ... ON DUPLICATE KEY nunca dispara e voltam os registros
 * duplicados — silenciosamente. Melhor recusar a subir com uma mensagem clara
 * do que descobrir isso depois, com dados errados no ranking.
 */

async function colunaExiste(tabela, coluna) {
    const [linhas] = await pool.query(
        `SELECT 1
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
          LIMIT 1`,
        [config.db.database, tabela, coluna]
    );
    return linhas.length > 0;
}

async function indiceUnicoExiste(tabela, colunas) {
    const [linhas] = await pool.query(
        `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND NON_UNIQUE = 0
          GROUP BY INDEX_NAME`,
        [config.db.database, tabela]
    );
    const alvo = colunas.join(',');
    return linhas.some((l) => l.cols === alvo);
}

/**
 * @returns {Promise<string[]>} lista de problemas encontrados (vazia = tudo ok)
 */
async function verificar() {
    const problemas = [];

    if (!(await colunaExiste('pontos', 'dia'))) {
        problemas.push('a tabela `pontos` não tem a coluna gerada `dia`');
    }

    if (!(await indiceUnicoExiste('pontos', ['username', 'dia']))) {
        problemas.push('a tabela `pontos` não tem a chave única (username, dia) — sem ela o ponto pode ser duplicado');
    }

    if (!(await colunaExiste('pontos', 'criado_por'))) {
        problemas.push('a tabela `pontos` não tem a coluna `criado_por` (auditoria de quem lançou)');
    }

    if (!(await colunaExiste('meses_fechados', 'anunciado_em'))) {
        problemas.push('a tabela `meses_fechados` não tem a coluna `anunciado_em` — o anúncio do funcionário do mês não funciona');
    }

    if (!(await colunaExiste('meses_vips', 'vip_aplicado_em'))) {
        problemas.push('a tabela `meses_vips` não tem a coluna `vip_aplicado_em` — o VIP automático não funciona');
    }

    return problemas;
}

/** Encerra o processo se o schema estiver incompleto. */
async function exigir() {
    const problemas = await verificar();

    if (problemas.length === 0) {
        log.info('Estrutura do banco conferida.');
        return;
    }

    log.erro('O banco não está com a estrutura esperada:');
    problemas.forEach((p) => log.erro(`  - ${p}`));
    log.erro('Rode db/migrations/001_hardening.sql do projeto painel-bot (faça backup antes).');
    process.exit(1);
}

module.exports = { verificar, exigir };
