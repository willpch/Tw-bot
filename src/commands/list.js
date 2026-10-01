const dayjs = require('dayjs');
const config = require('../config');
const log = require('../logger');
const stream = require('../twitch/stream');
const pontosService = require('../services/pontos');
const mesesService = require('../services/meses');
const { registrar } = require('./registry');

/**
 * Definição dos comandos do chat.
 */

function limparUsername(bruto) {
    return String(bruto || '').replace(/^@/, '').trim().toLowerCase();
}

/** Texto do streak — apenas informativo, não vale pontos. */
function frasePeloStreak(streak) {
    if (streak >= 30) return ` 🔥 ${streak} dias seguidos, isso é lenda!`;
    if (streak >= 7)  return ` 🔥 ${streak} dias seguidos!`;
    if (streak >= 2)  return ` 🔥 ${streak} dias seguidos!`;
    return '';
}

// ---------------------------------------------------------------------------
// !ponto
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!ponto', '!batendoponto'],
    descricao: 'Bate o ponto do dia',
    cooldownMs: 10000,
    // Sem cooldown global: numa corrida dezenas de pessoas batem ponto no mesmo
    // segundo e nenhuma pode ser descartada. Quem segura o volume de respostas
    // é a fila de chat.
    cooldownGlobalMs: 0,
    handler: async (ctx) => {
        const etapas = [];
        try {
            etapas.push('verificar se o mês está fechado');
            // O bot não consultava meses_fechados: dava para registrar ponto em
            // um mês já fechado e divulgado pelo painel.
            if (await mesesService.mesAtualFechado()) {
                ctx.responder('o mês já foi fechado, não é mais possível bater ponto nele.');
                return;
            }

            etapas.push('verificar se a live está no ar');
            if (!stream.estaOnline()) {
                ctx.responder('o canal precisa estar AO VIVO para bater o ponto!');
                return;
            }

            etapas.push('registrar o ponto');
            const resultado = await pontosService.baterPonto(ctx.username);

            if (resultado.status === 'ja_bateu') {
                ctx.responder('você já bateu o ponto hoje!');
                return;
            }

            etapas.push('calcular o streak');
            const streakDias = await pontosService.streakDeDias(ctx.username);
            const avisoStreak = frasePeloStreak(streakDias);

            // Primeiro do dia ganha destaque no chat.
            if (resultado.posicao === 1) {
                ctx.dizer(
                    `🥇 PRIMEIRO PONTO DO DIA! @${ctx.username} abriu o expediente e levou `
                    + `${resultado.pontos} pontos!${avisoStreak}`
                );
                return;
            }

            ctx.responder(
                `ponto batido! Você ganhou ${resultado.pontos} pontos `
                + `(${resultado.posicao}º do dia).${avisoStreak}`
            );
        } catch (erro) {
            log.logPontoError(ctx.username, ctx.mensagem, erro, etapas[etapas.length - 1]);
            ctx.responder('não consegui registrar seu ponto agora. Tente novamente em instantes.');
        }
    },
});

// ---------------------------------------------------------------------------
// !meuspontos
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!meuspontos'],
    descricao: 'Mostra seus pontos, posição e streak',
    handler: async (ctx) => {
        const agora = dayjs();
        const anoAtual = agora.year();
        const mesAtual = agora.month() + 1;
        const mesPassado = agora.subtract(1, 'month');

        const [ranking, totalPassado, streakDias, melhor] = await Promise.all([
            pontosService.rankingDoMes(anoAtual, mesAtual),
            pontosService.totalDoMes(ctx.username, mesPassado.year(), mesPassado.month() + 1),
            pontosService.streakDeDias(ctx.username),
            pontosService.melhorPosicaoDoAno(ctx.username, anoAtual),
        ]);

        // Sem diferenciar maiúsculas: o MySQL usa collation _ci, então o painel
        // pode ter gravado o nome com outra caixa que o chat.
        const indice = ranking.findIndex(
            (linha) => String(linha.username).toLowerCase() === ctx.username
        );
        const totalAtual = indice >= 0 ? ranking[indice].total : 0;

        const partes = [`este mês você tem ${totalAtual} pontos`];

        if (indice >= 0) {
            partes.push(`está em #${indice + 1} de ${ranking.length}`);

            // Quanto falta para o colocado imediatamente acima — é isso que faz
            // a pessoa querer voltar amanhã.
            if (indice > 0) {
                const faltam = ranking[indice - 1].total - totalAtual;
                partes.push(
                    faltam > 0
                        ? `faltam ${faltam} pts para o #${indice}`
                        : `empatado com o #${indice}`
                );
            } else {
                const perseguidor = ranking[1];
                partes.push(
                    perseguidor
                        ? `liderando com ${totalAtual - perseguidor.total} pts de vantagem 👑`
                        : 'liderando sozinho 👑'
                );
            }
        } else {
            partes.push('ainda fora do ranking deste mês');
        }

        partes.push(`mês passado: ${totalPassado} pts`);

        if (streakDias >= 2) {
            partes.push(`sequência atual: ${streakDias} dias 🔥`);
        }

        if (melhor && melhor.posicao <= 3) {
            partes.push(`melhor colocação em ${anoAtual}: #${melhor.posicao} (${mesesService.nomeDoMes(melhor.mes)})`);
        }

        ctx.responder(`${partes.join(' · ')}.`);
    },
});

// ---------------------------------------------------------------------------
// !pontos <usuario>  (admin)
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!pontos'],
    permissao: 'admin',
    descricao: 'Consulta os pontos de outra pessoa',
    handler: async (ctx) => {
        const alvo = limparUsername(ctx.args[0]);
        if (!alvo) {
            ctx.responder('use: !pontos nomedousuario');
            return;
        }

        const agora = dayjs();
        const mesPassado = agora.subtract(1, 'month');

        const [totalAtual, totalPassado] = await Promise.all([
            pontosService.totalDoMes(alvo, agora.year(), agora.month() + 1),
            pontosService.totalDoMes(alvo, mesPassado.year(), mesPassado.month() + 1),
        ]);

        ctx.responder(
            `@${alvo} tem ${totalAtual} pontos este mês e ${totalPassado} no mês passado.`
        );
    },
});

// ---------------------------------------------------------------------------
// !addpontos <usuario> <quantidade>  (admin)
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!addpontos'],
    permissao: 'admin',
    descricao: 'Adiciona pontos manualmente',
    handler: async (ctx) => {
        const alvo = limparUsername(ctx.args[0]);
        const quantidade = parseInt(ctx.args[1], 10);

        if (!alvo || !Number.isFinite(quantidade)) {
            ctx.responder('use: !addpontos usuario quantidade');
            return;
        }
        if (quantidade <= 0) {
            ctx.responder('a quantidade precisa ser maior que zero.');
            return;
        }
        // Não havia teto: !addpontos usuario 999999 era aceito sem questionar.
        if (quantidade > config.pontos.addPontosMax) {
            ctx.responder(`o máximo por vez é ${config.pontos.addPontosMax} pontos.`);
            return;
        }

        const agora = dayjs();
        if (await mesesService.mesFechado(agora.year(), agora.month() + 1)) {
            ctx.responder('o mês atual está fechado no painel. Reabra antes de lançar pontos.');
            return;
        }

        // criado_por / atualizado_por guardam quem lançou — antes não havia
        // nenhum rastro de autoria.
        const resultado = await pontosService.adicionarPontos(alvo, quantidade, ctx.username);

        ctx.responder(
            `adicionado ${quantidade} pontos para @${alvo}! `
            + `Total de hoje: ${resultado.totalDoDia}.`
        );
    },
});

// ---------------------------------------------------------------------------
// !ranking
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!ranking', '!rank'],
    descricao: 'Link do ranking completo',
    handler: async (ctx) => {
        ctx.dizer(`Para ver tabela de pontos e funcionários do mês: ${config.rankingUrl}`);
    },
});

// ---------------------------------------------------------------------------
// !ola
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!ola', '!olá'],
    descricao: 'Cumprimento',
    handler: async (ctx) => {
        ctx.responder('Olá! Como você está? Use !regrasponto para ver como funciona o ponto.');
    },
});

// ---------------------------------------------------------------------------
// !regrasponto
// ---------------------------------------------------------------------------
registrar({
    nomes: ['!regrasponto', '!regras'],
    descricao: 'Explica as regras do ponto',
    handler: async (ctx) => {
        ctx.dizer(
            `📋 Bata o ponto uma vez por dia enquanto a live estiver no ar. `
            + `Quem bate o ponto primeiro leva mais: começa em ${config.pontos.pontosBase} pontos `
            + `e cai 1 ponto a cada pessoa que já bateu. `
            + `Use !ponto para bater, !meuspontos para ver sua posição e sequência, `
            + `e !ranking para a tabela completa. 📋`
        );
    },
});
