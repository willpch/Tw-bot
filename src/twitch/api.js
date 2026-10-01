const axios = require('axios');
const config = require('../config');
const auth = require('./auth');
const log = require('../logger');

/**
 * Cliente da API Helix com retry, backoff e renovação de token no 401.
 *
 * Antes cada chamada montava os headers na mão com o token fixo, e um 401 por
 * token expirado era tratado como se fosse falha de rede — o bot tentava três
 * vezes o mesmo token inválido e desistia.
 */

const BASE = 'https://api.twitch.tv/helix';
const TIMEOUT_MS = 15000;
const MAX_TENTATIVAS = 3;

function dormir(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} caminho  ex.: '/streams'
 * @param {object} opcoes   { metodo, params, dados, tipoToken: 'app'|'user' }
 */
async function helix(caminho, opcoes = {}) {
    const {
        metodo = 'get',
        params = {},
        dados = undefined,
        tipoToken = 'app',
    } = opcoes;

    let tokenRenovado = false;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        const token = tipoToken === 'user' ? await auth.getUserToken() : await auth.getAppToken();

        if (!token) {
            throw new Error(`Sem token do tipo "${tipoToken}" para chamar ${caminho}.`);
        }

        try {
            const resposta = await axios({
                method: metodo,
                url: BASE + caminho,
                params,
                data: dados,
                timeout: TIMEOUT_MS,
                headers: {
                    'Client-ID': config.twitch.clientId,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            return resposta.data;
        } catch (erro) {
            const status = erro.response && erro.response.status;

            // 401: token expirado ou revogado. Renova e tenta de novo — uma vez.
            if (status === 401 && !tokenRenovado) {
                tokenRenovado = true;
                auth.invalidar(tipoToken);
                log.aviso(`[api] 401 em ${caminho}: renovando token e tentando novamente.`);
                continue;
            }

            // 429: respeita o momento de reset informado pela Twitch.
            if (status === 429) {
                const reset = Number(erro.response.headers['ratelimit-reset']) * 1000;
                const espera = Number.isFinite(reset) ? Math.max(reset - Date.now(), 1000) : 5000;
                log.aviso(`[api] rate limit em ${caminho}: aguardando ${Math.round(espera / 1000)}s.`);
                await dormir(Math.min(espera, 30000));
                continue;
            }

            // 4xx que não seja 401/429 não melhora com retry.
            if (status && status >= 400 && status < 500) {
                throw erro;
            }

            if (tentativa === MAX_TENTATIVAS) {
                throw erro;
            }

            // Falha de rede ou 5xx: backoff exponencial (2s, 4s).
            await dormir(2000 * tentativa);
        }
    }

    throw new Error(`Falha ao chamar ${caminho} após ${MAX_TENTATIVAS} tentativas.`);
}

/** true se o canal está ao vivo agora. */
async function streamOnline(login) {
    const dados = await helix('/streams', { params: { user_login: login } });
    return Array.isArray(dados.data) && dados.data.length > 0;
}

/** ID numérico de um login da Twitch (null se não existir). */
async function idDoUsuario(login) {
    const dados = await helix('/users', { params: { login } });
    const usuario = dados.data && dados.data[0];
    return usuario ? usuario.id : null;
}

/**
 * Concede VIP no canal. Exige user token com escopo channel:manage:vips.
 * @returns {'ok'|'ja_era'|'sem_permissao'|'sem_vaga'|'usuario_invalido'}
 */
async function concederVip(broadcasterId, userId) {
    try {
        await helix('/channels/vips', {
            metodo: 'post',
            params: { broadcaster_id: broadcasterId, user_id: userId },
            tipoToken: 'user',
        });
        return 'ok';
    } catch (erro) {
        const status = erro.response && erro.response.status;
        const mensagem = (erro.response && erro.response.data && erro.response.data.message) || '';

        if (status === 409 || /already/i.test(mensagem)) return 'ja_era';
        if (status === 401 || status === 403) return 'sem_permissao';
        if (status === 422) return 'sem_vaga';
        if (status === 400) return 'usuario_invalido';
        throw erro;
    }
}

module.exports = { helix, streamOnline, idDoUsuario, concederVip };
