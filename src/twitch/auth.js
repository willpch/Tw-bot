const axios = require('axios');
const config = require('../config');
const log = require('../logger');

/**
 * Tokens da API da Twitch, com renovação automática.
 *
 * O bot usava um ACCESS_TOKEN fixo lido do .env e nunca renovado. Token de
 * usuário da Twitch expira em ~4h. Quando expirava, a checagem de "a live está
 * no ar?" falhava nas três tentativas e caía no cache velho — então o bot
 * passava a liberar ponto com a live offline, ou a barrar todo mundo, sem
 * nenhum aviso de que a causa era o token.
 *
 * Dois tipos de token:
 *  - app token (client_credentials): suficiente para ler /streams e /users.
 *  - user token (refresh_token): necessário para agir como o dono do canal,
 *    como conceder VIP (escopo channel:manage:vips).
 */

const URL_TOKEN = 'https://id.twitch.tv/oauth2/token';
// Renova um pouco antes de expirar, para nunca usar um token no limite.
const MARGEM_MS = 5 * 60 * 1000;

const cache = {
    app: { token: null, expiraEm: 0 },
    user: { token: null, expiraEm: 0 },
};

let avisouTokenFixo = false;

function podeRenovar() {
    return Boolean(config.twitch.clientSecret);
}

/**
 * Token de aplicação. Renovado sozinho quando há CLIENT_SECRET.
 */
async function getAppToken() {
    if (!podeRenovar()) {
        // Sem CLIENT_SECRET não há como renovar: usa o token fixo do .env para
        // o bot continuar funcionando, mas deixa claro que vai expirar.
        if (!avisouTokenFixo) {
            avisouTokenFixo = true;
            log.aviso(
                'CLIENT_SECRET não definido: usando ACCESS_TOKEN fixo, que expira em algumas horas. '
                + 'Defina CLIENT_SECRET no .env para o bot renovar o token sozinho.'
            );
        }
        if (!config.twitch.accessTokenFixo) {
            throw new Error('Sem CLIENT_SECRET e sem ACCESS_TOKEN: não há como falar com a API da Twitch.');
        }
        return config.twitch.accessTokenFixo;
    }

    if (cache.app.token && Date.now() < cache.app.expiraEm) {
        return cache.app.token;
    }

    const resposta = await axios.post(URL_TOKEN, null, {
        params: {
            client_id: config.twitch.clientId,
            client_secret: config.twitch.clientSecret,
            grant_type: 'client_credentials',
        },
        timeout: 15000,
    });

    const { access_token: token, expires_in: expiraEmSegundos } = resposta.data;
    cache.app = {
        token,
        expiraEm: Date.now() + (Number(expiraEmSegundos) || 3600) * 1000 - MARGEM_MS,
    };

    log.info(`[auth] app token renovado (validade ~${Math.round((Number(expiraEmSegundos) || 3600) / 60)} min)`);
    return token;
}

/**
 * Token de usuário, obtido a partir do refresh token.
 * Só é necessário para conceder VIP.
 */
async function getUserToken() {
    if (!config.twitch.refreshToken || !podeRenovar()) {
        return null;
    }

    if (cache.user.token && Date.now() < cache.user.expiraEm) {
        return cache.user.token;
    }

    const resposta = await axios.post(URL_TOKEN, null, {
        params: {
            client_id: config.twitch.clientId,
            client_secret: config.twitch.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: config.twitch.refreshToken,
        },
        timeout: 15000,
    });

    const { access_token: token, expires_in: expiraEmSegundos } = resposta.data;
    cache.user = {
        token,
        expiraEm: Date.now() + (Number(expiraEmSegundos) || 14400) * 1000 - MARGEM_MS,
    };

    log.info('[auth] user token renovado');
    return token;
}

/** Descarta o token em cache para forçar renovação na próxima chamada. */
function invalidar(tipo) {
    if (cache[tipo]) {
        cache[tipo] = { token: null, expiraEm: 0 };
    }
}

module.exports = { getAppToken, getUserToken, invalidar, podeRenovar };
