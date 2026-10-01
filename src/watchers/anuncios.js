const config = require('../config');
const log = require('../logger');
const api = require('../twitch/api');
const auth = require('../twitch/auth');
const stream = require('../twitch/stream');
const chat = require('../twitch/chat');
const pontosService = require('../services/pontos');
const mesesService = require('../services/meses');

/**
 * Anúncios automáticos no chat.
 *
 *  - Quando a live abre: avisa que o ponto foi liberado. Antes ninguém sabia
 *    que já podia bater ponto, e a pontuação é decrescente — quem não estava
 *    olhando perdia pontos.
 *
 *  - Quando o painel fecha um mês: anuncia o funcionário do mês e aplica os
 *    VIPs escolhidos direto na Twitch. Antes o VIP era apenas uma linha na
 *    tabela meses_vips e tinha que ser concedido na mão.
 */

let temporizadorFechamentos = null;

// ---------------------------------------------------------------------------
// Live abriu
// ---------------------------------------------------------------------------
function registrarAvisoDeLive() {
    stream.ao('online', () => {
        chat.enviar(
            config.twitch.canalChat,
            '🔔 A live começou e o ponto está LIBERADO! Use !ponto — quem bate primeiro leva mais pontos.',
            'alta'
        );
    });

    stream.ao('offline', () => {
        log.info('[anuncios] live encerrada: o ponto volta a ficar bloqueado.');
    });
}

// ---------------------------------------------------------------------------
// Funcionário do mês
// ---------------------------------------------------------------------------

/**
 * Concede os VIPs de um mês na Twitch.
 * @returns {Promise<string[]>} nomes efetivamente aplicados
 */
async function aplicarVips(ano, mes) {
    const pendentes = await mesesService.vipsPendentes(ano, mes);
    if (pendentes.length === 0) {
        return [];
    }

    if (!config.twitch.broadcasterId) {
        log.aviso('[anuncios] BROADCASTER_ID não definido: não é possível conceder VIP.');
        return [];
    }
    if (!config.twitch.refreshToken || !auth.podeRenovar()) {
        log.aviso(
            '[anuncios] sem TWITCH_REFRESH_TOKEN/CLIENT_SECRET: o VIP precisa ser dado à mão. '
            + 'Configure um refresh token com escopo channel:manage:vips para automatizar.'
        );
        return [];
    }

    const aplicados = [];

    for (const username of pendentes) {
        try {
            const userId = await api.idDoUsuario(username);
            if (!userId) {
                log.aviso(`[anuncios] usuário "${username}" não existe na Twitch: VIP ignorado.`);
                continue;
            }

            const resultado = await api.concederVip(config.twitch.broadcasterId, userId);

            if (resultado === 'ok' || resultado === 'ja_era') {
                await mesesService.marcarVipAplicado(ano, mes, username);
                if (resultado === 'ok') {
                    aplicados.push(username);
                }
                continue;
            }

            if (resultado === 'sem_permissao') {
                log.erro(
                    '[anuncios] a Twitch recusou a concessão de VIP (401/403). '
                    + 'O refresh token precisa ser do dono do canal e ter escopo channel:manage:vips.'
                );
                break; // os próximos vão falhar igual
            }
            if (resultado === 'sem_vaga') {
                log.aviso(`[anuncios] canal sem vagas de VIP: "${username}" não foi aplicado.`);
            }
        } catch (erro) {
            log.erro(`[anuncios] falha ao conceder VIP para "${username}":`, erro.message);
        }
    }

    return aplicados;
}

async function anunciarFechamento(fechamento) {
    const { ano, mes } = fechamento;
    const nomeMes = mesesService.nomeDoMes(mes);
    const canal = config.twitch.canalChat;

    const campeao = await pontosService.funcionarioDoMes(ano, mes);
    const vipsAplicados = await aplicarVips(ano, mes);
    const vipsDoMes = await mesesService.vipsDoMes(ano, mes);

    if (campeao) {
        chat.enviar(
            canal,
            `🏆 ${nomeMes} fechado! O funcionário do mês é @${campeao.username} `
            + `com ${campeao.total} pontos. Parabéns! 👑`,
            'alta'
        );
    } else {
        chat.enviar(canal, `📋 ${nomeMes} foi fechado. Não houve pontos registrados no mês.`, 'alta');
    }

    if (vipsDoMes.length > 0) {
        const lista = vipsDoMes.map((n) => `@${n}`).join(', ');
        const sufixo = vipsAplicados.length > 0 ? ' O VIP já está valendo! 🌟' : '';
        chat.enviar(canal, `🌟 VIP de ${nomeMes}: ${lista}.${sufixo}`, 'alta');
    }

    chat.enviar(canal, `Ranking completo em ${config.rankingUrl}`, 'alta');

    // Marca por último: se algo acima falhar, o anúncio é tentado de novo no
    // próximo ciclo em vez de se perder.
    await mesesService.marcarAnunciado(ano, mes);
    log.info(`[anuncios] fechamento de ${mes}/${ano} anunciado no chat.`);
}

async function verificarFechamentos() {
    try {
        const pendentes = await mesesService.fechamentosPendentes();
        for (const fechamento of pendentes) {
            await anunciarFechamento(fechamento);
        }
    } catch (erro) {
        log.erro('[anuncios] falha ao verificar fechamentos:', erro.message);
    }
}

// ---------------------------------------------------------------------------

function iniciar() {
    registrarAvisoDeLive();

    verificarFechamentos();
    temporizadorFechamentos = setInterval(verificarFechamentos, config.anuncios.intervaloMs);
    if (temporizadorFechamentos.unref) temporizadorFechamentos.unref();

    log.info(`[anuncios] verificando fechamentos a cada ${config.anuncios.intervaloMs / 1000}s`);
}

function parar() {
    if (temporizadorFechamentos) clearInterval(temporizadorFechamentos);
}

module.exports = { iniciar, parar };
