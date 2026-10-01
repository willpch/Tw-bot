const dayjs = require('dayjs');
const pool = require('../db');
const config = require('../config');

/**
 * Tudo que envolve pontos no banco.
 *
 * Duas mudanças importantes em relação ao código anterior:
 *
 * 1. As consultas filtravam com `data LIKE '2026-09-%'` ou YEAR()/MONTH(),
 *    o que impede o uso de índice e força varredura da tabela inteira. Agora é
 *    faixa: `data >= inicio AND data < fim`.
 *
 * 2. O total mostrado no chat somava só SUM(pontos), enquanto o site somava
 *    pontos + horas_extras * multiplicador. Os dois nunca batiam. Agora o
 *    cálculo é o mesmo nos dois lugares.
 */

const MULT = config.pontos.multHoraExtra;

function hoje() {
    return dayjs().format('YYYY-MM-DD');
}

function agora() {
    return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

function limitesDoMes(ano, mes) {
    const inicio = dayjs(`${ano}-${String(mes).padStart(2, '0')}-01`);
    return [inicio.format('YYYY-MM-DD HH:mm:ss'), inicio.add(1, 'month').format('YYYY-MM-DD HH:mm:ss')];
}

/**
 * Registra o ponto do dia.
 *
 * O fluxo antigo era: SELECT "já bateu hoje?" e, se não, COUNT de quantos já
 * bateram e INSERT. Três consultas sem transação nem restrição no banco, então:
 *  - dois !ponto quase simultâneos da mesma pessoa inseriam dois registros;
 *  - duas pessoas batendo ponto no mesmo instante liam o mesmo COUNT e
 *    recebiam exatamente a mesma pontuação.
 *
 * Agora quem decide é a UNIQUE KEY (username, dia): o INSERT ou vence ou não
 * acontece. A pontuação é derivada de quantos registros do dia têm id menor
 * que o nosso — os ids são únicos e crescentes, então dois pontos batidos no
 * mesmo milissegundo recebem posições diferentes.
 *
 * @returns {{status:'ok'|'ja_bateu', pontos?:number, posicao?:number}}
 */
async function baterPonto(username) {
    const dia = hoje();

    const [insercao] = await pool.query(
        `INSERT INTO pontos (username, \`data\`, pontos, criado_por, criado_em)
         VALUES (?, ?, 0, 'bot', NOW())
         ON DUPLICATE KEY UPDATE id = id`,
        [username, agora()]
    );

    // affectedRows 0 = a chave única barrou: já existe registro dessa pessoa hoje.
    if (insercao.affectedRows === 0) {
        return { status: 'ja_bateu' };
    }

    const id = insercao.insertId;

    const [linhas] = await pool.query(
        'SELECT COUNT(*) AS anteriores FROM pontos WHERE dia = ? AND id < ?',
        [dia, id]
    );
    const anteriores = Number(linhas[0].anteriores) || 0;

    const pontos = Math.max(0, config.pontos.pontosBase - anteriores);

    await pool.query('UPDATE pontos SET pontos = ? WHERE id = ?', [pontos, id]);

    return { status: 'ok', pontos, posicao: anteriores + 1 };
}

/**
 * Soma pontos manualmente (!addpontos).
 *
 * Como só pode existir um registro por pessoa por dia, soma no registro do dia
 * em vez de criar outro. Guarda quem lançou: antes não havia como auditar.
 */
async function adicionarPontos(username, quantidade, autor) {
    const [resultado] = await pool.query(
        `INSERT INTO pontos (username, \`data\`, pontos, criado_por, criado_em)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
             pontos = pontos + VALUES(pontos),
             atualizado_por = VALUES(criado_por),
             atualizado_em = NOW()`,
        [username, agora(), quantidade, autor]
    );

    const [linhas] = await pool.query(
        'SELECT pontos FROM pontos WHERE username = ? AND dia = ? LIMIT 1',
        [username, hoje()]
    );

    return {
        criouRegistro: resultado.affectedRows === 1,
        totalDoDia: linhas.length ? Number(linhas[0].pontos) : quantidade,
    };
}

/** Total de uma pessoa em um mês, na mesma fórmula do site. */
async function totalDoMes(username, ano, mes) {
    const [inicio, fim] = limitesDoMes(ano, mes);
    const [linhas] = await pool.query(
        `SELECT ROUND(SUM(pontos) + SUM(COALESCE(horas_extras, 0)) * ?, 0) AS total
           FROM pontos
          WHERE username = ? AND \`data\` >= ? AND \`data\` < ?`,
        [MULT, username, inicio, fim]
    );
    return Number(linhas[0] && linhas[0].total) || 0;
}

/** Ranking do mês, já ordenado. */
async function rankingDoMes(ano, mes) {
    const [inicio, fim] = limitesDoMes(ano, mes);
    const [linhas] = await pool.query(
        `SELECT username,
                ROUND(SUM(pontos) + SUM(COALESCE(horas_extras, 0)) * ?, 0) AS total
           FROM pontos
          WHERE \`data\` >= ? AND \`data\` < ?
          GROUP BY username
          ORDER BY total DESC, username ASC`,
        [MULT, inicio, fim]
    );
    return linhas.map((l) => ({ username: l.username, total: Number(l.total) || 0 }));
}

/** Primeiro colocado de um mês (usado no anúncio do funcionário do mês). */
async function funcionarioDoMes(ano, mes) {
    const ranking = await rankingDoMes(ano, mes);
    return ranking.length ? ranking[0] : null;
}

/**
 * Dias consecutivos batendo ponto, contando a partir de hoje para trás.
 *
 * Olha no máximo 60 dias: é o suficiente para o aviso no chat e mantém a
 * consulta pequena.
 */
async function streakDeDias(username) {
    const [linhas] = await pool.query(
        `SELECT DATE_FORMAT(dia, '%Y-%m-%d') AS dia
           FROM pontos
          WHERE username = ? AND dia >= (CURDATE() - INTERVAL 60 DAY)
          ORDER BY dia DESC`,
        [username]
    );

    const dias = new Set(linhas.map((l) => l.dia));

    let streak = 0;
    let cursor = dayjs();
    while (dias.has(cursor.format('YYYY-MM-DD'))) {
        streak += 1;
        cursor = cursor.subtract(1, 'day');
    }

    return streak;
}

/**
 * Melhor colocação da pessoa nos meses deste ano.
 *
 * Feito com uma consulta agregada e a ordenação em memória, sem window
 * functions — assim funciona também em MySQL 5.7.
 */
async function melhorPosicaoDoAno(username, ano) {
    const [linhas] = await pool.query(
        `SELECT MONTH(\`data\`) AS mes,
                username,
                ROUND(SUM(pontos) + SUM(COALESCE(horas_extras, 0)) * ?, 0) AS total
           FROM pontos
          WHERE \`data\` >= ? AND \`data\` < ?
          GROUP BY MONTH(\`data\`), username
          ORDER BY mes ASC, total DESC, username ASC`,
        [MULT, `${ano}-01-01 00:00:00`, `${ano + 1}-01-01 00:00:00`]
    );

    const posicaoPorMes = new Map();
    const contador = new Map();

    // Comparação sem diferenciar maiúsculas: o MySQL usa collation _ci e o
    // painel pode ter gravado "Zephyr_Lib" enquanto o chat manda "zephyr_lib".
    const alvo = String(username).toLowerCase();

    linhas.forEach((linha) => {
        const mes = Number(linha.mes);
        const posicao = (contador.get(mes) || 0) + 1;
        contador.set(mes, posicao);
        if (String(linha.username).toLowerCase() === alvo && !posicaoPorMes.has(mes)) {
            posicaoPorMes.set(mes, posicao);
        }
    });

    let melhor = null;
    posicaoPorMes.forEach((posicao, mes) => {
        if (melhor === null || posicao < melhor.posicao) {
            melhor = { posicao, mes };
        }
    });

    return melhor;
}

module.exports = {
    hoje,
    agora,
    limitesDoMes,
    baterPonto,
    adicionarPontos,
    totalDoMes,
    rankingDoMes,
    funcionarioDoMes,
    streakDeDias,
    melhorPosicaoDoAno,
};
