const dayjs = require('dayjs');
const pool = require('../db');

/**
 * Fechamento de mês — a ponte entre o painel e o bot.
 *
 * O bot ignorava completamente a tabela meses_fechados: o painel podia fechar
 * setembro e anunciar o funcionário do mês, e o bot continuava aceitando ponto
 * e !addpontos com data de setembro, mudando um ranking já divulgado.
 */

const NOMES_MESES = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function nomeDoMes(mes) {
    return NOMES_MESES[Number(mes)] || String(mes);
}

async function mesFechado(ano, mes) {
    const [linhas] = await pool.query(
        'SELECT id FROM meses_fechados WHERE ano = ? AND mes = ? LIMIT 1',
        [ano, mes]
    );
    return linhas.length > 0;
}

/** O mês corrente está fechado? (usado antes de registrar qualquer ponto) */
async function mesAtualFechado() {
    const agora = dayjs();
    return mesFechado(agora.year(), agora.month() + 1);
}

/**
 * Fechamentos que o painel registrou e o bot ainda não anunciou no chat.
 * anunciado_em = NULL é o sinal deixado pelo painel.
 */
async function fechamentosPendentes() {
    const [linhas] = await pool.query(
        `SELECT ano, mes, fechado_em
           FROM meses_fechados
          WHERE anunciado_em IS NULL
          ORDER BY ano ASC, mes ASC`
    );
    return linhas.map((l) => ({ ano: Number(l.ano), mes: Number(l.mes), fechadoEm: l.fechado_em }));
}

async function marcarAnunciado(ano, mes) {
    await pool.query(
        'UPDATE meses_fechados SET anunciado_em = NOW() WHERE ano = ? AND mes = ?',
        [ano, mes]
    );
}

/** VIPs escolhidos no painel que ainda não foram aplicados na Twitch. */
async function vipsPendentes(ano, mes) {
    const [linhas] = await pool.query(
        `SELECT username
           FROM meses_vips
          WHERE ano = ? AND mes = ? AND vip_aplicado_em IS NULL
          ORDER BY id`,
        [ano, mes]
    );
    return linhas.map((l) => l.username);
}

async function marcarVipAplicado(ano, mes, username) {
    await pool.query(
        'UPDATE meses_vips SET vip_aplicado_em = NOW() WHERE ano = ? AND mes = ? AND username = ?',
        [ano, mes, username]
    );
}

async function vipsDoMes(ano, mes) {
    const [linhas] = await pool.query(
        'SELECT username FROM meses_vips WHERE ano = ? AND mes = ? ORDER BY id',
        [ano, mes]
    );
    return linhas.map((l) => l.username);
}

module.exports = {
    nomeDoMes,
    mesFechado,
    mesAtualFechado,
    fechamentosPendentes,
    marcarAnunciado,
    vipsPendentes,
    marcarVipAplicado,
    vipsDoMes,
};
