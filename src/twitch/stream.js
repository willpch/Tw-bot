const config = require('../config');
const api = require('./api');
const log = require('../logger');

/**
 * Acompanha se a live está no ar.
 *
 * O que havia antes: uma checagem sob demanda com cache de 15 MINUTOS. Duas
 * consequências visíveis para quem assiste:
 *  - nos primeiros minutos de live o bot ainda respondia "o canal precisa estar
 *    AO VIVO" para quem tentava bater ponto, justo na hora da corrida pelos
 *    pontos (que decrescem);
 *  - depois de a live encerrar, o ponto continuava sendo aceito por até 15 min.
 *
 * Agora há um poll contínuo a cada 60s: o estado nunca está mais de um minuto
 * atrasado, e a transição offline -> online também serve para anunciar no chat
 * que o ponto foi liberado.
 */

const estado = {
    online: false,
    // Último instante em que a API respondeu com sucesso.
    ultimoSucesso: 0,
    // Já fizemos a primeira leitura? Antes dela não emitimos evento, senão todo
    // restart do bot anunciaria "a live abriu" com a live já no ar.
    inicializado: false,
};

const ouvintes = { online: [], offline: [] };
let temporizador = null;

/** Registra um ouvinte para 'online' ou 'offline'. */
function ao(evento, callback) {
    if (ouvintes[evento]) {
        ouvintes[evento].push(callback);
    }
}

function emitir(evento) {
    ouvintes[evento].forEach((callback) => {
        try {
            const resultado = callback();
            if (resultado && typeof resultado.catch === 'function') {
                resultado.catch((e) => log.erro(`[stream] ouvinte de ${evento} falhou:`, e.message));
            }
        } catch (e) {
            log.erro(`[stream] ouvinte de ${evento} falhou:`, e.message);
        }
    });
}

async function checar() {
    try {
        const online = await api.streamOnline(config.twitch.canal);
        const anterior = estado.online;

        estado.online = online;
        estado.ultimoSucesso = Date.now();

        if (!estado.inicializado) {
            estado.inicializado = true;
            log.info(`[stream] estado inicial: ${online ? 'ONLINE' : 'OFFLINE'}`);
            return online;
        }

        if (online !== anterior) {
            log.info(`[stream] ${anterior ? 'ONLINE' : 'OFFLINE'} -> ${online ? 'ONLINE' : 'OFFLINE'}`);
            emitir(online ? 'online' : 'offline');
        }

        return online;
    } catch (erro) {
        log.aviso(`[stream] falha ao consultar a API: ${erro.message}`);
        return estado.online;
    }
}

/**
 * A live está no ar?
 *
 * Quando a API está fora, mantemos a última leitura por um tempo — não faz
 * sentido punir quem assiste por um problema nosso. Passada a tolerância, o
 * estado deixa de ser confiável e respondemos "offline", para não distribuir
 * ponto sem saber se a live existe.
 */
function estaOnline() {
    if (!estado.inicializado) {
        return false;
    }

    const desatualizadoHa = Date.now() - estado.ultimoSucesso;
    if (desatualizadoHa > config.stream.toleranciaFalhaMs) {
        log.aviso(
            `[stream] sem resposta da API há ${Math.round(desatualizadoHa / 60000)} min: `
            + 'tratando como offline.'
        );
        return false;
    }

    return estado.online;
}

/**
 * A primeira leitura é aguardada de propósito: sem isso, nos primeiros segundos
 * depois de subir o bot o estado ainda não estaria inicializado e o !ponto
 * responderia "o canal precisa estar AO VIVO" mesmo com a live no ar.
 */
async function iniciar() {
    await checar();
    temporizador = setInterval(checar, config.stream.pollMs);
    // Não segura o processo vivo só por causa do timer.
    if (temporizador.unref) temporizador.unref();
    log.info(`[stream] monitorando ${config.twitch.canal} a cada ${config.stream.pollMs / 1000}s`);
}

function parar() {
    if (temporizador) clearInterval(temporizador);
}

module.exports = { iniciar, parar, checar, estaOnline, ao };
