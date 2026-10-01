const config = require('../config');
const log = require('../logger');
const chat = require('../twitch/chat');

/**
 * Registro e despacho de comandos.
 *
 * Antes havia um único handler de 'message' com ~170 linhas de ifs encadeados
 * sem return nem else: toda mensagem do chat era testada contra as sete
 * condições, e acrescentar cooldown, permissão ou um comando novo significava
 * mexer no meio do bloco.
 *
 * Aqui cada comando declara nomes, permissão, cooldown e handler.
 */

const comandos = new Map();

// chave -> instante do último uso
const ultimoUsoPorPessoa = new Map();
const ultimoUsoGlobal = new Map();

/** Limpa registros antigos de cooldown para o Map não crescer sem fim. */
function limparCooldownsAntigos() {
    const limite = Date.now() - 60 * 60 * 1000;
    ultimoUsoPorPessoa.forEach((quando, chave) => {
        if (quando < limite) ultimoUsoPorPessoa.delete(chave);
    });
}
setInterval(limparCooldownsAntigos, 15 * 60 * 1000).unref();

/**
 * @param {object} def
 * @param {string[]} def.nomes       ex.: ['!ponto', '!batendoponto']
 * @param {'todos'|'admin'} [def.permissao]
 * @param {number} [def.cooldownMs]  0 desliga o cooldown por pessoa
 * @param {string} [def.descricao]
 * @param {Function} def.handler     async (ctx) => void
 */
function registrar(def) {
    def.nomes.forEach((nome) => {
        comandos.set(nome.toLowerCase(), def);
    });
}

function ehAdmin(tags) {
    const username = (tags.username || '').toLowerCase();
    if (username === config.twitch.canal) return true;               // dono do canal
    if (config.comandos.admins.includes(username)) return true;      // lista no .env
    // Mods do canal passaram a poder usar os comandos administrativos: antes só
    // a dona do canal conseguia, o que travava a moderação.
    if (tags.mod === true) return true;
    return Boolean(tags.badges && tags.badges.broadcaster);
}

function cooldownRestante(def, nomeUsado, username) {
    const agora = Date.now();

    // Cooldown global: protege comandos de leitura pesada de spam.
    //
    // Precisa ser 0 para o !ponto. A pontuação é decrescente, então numa corrida
    // dezenas de pessoas digitam !ponto no mesmo segundo — um cooldown global
    // descartaria silenciosamente o ponto de quase todas elas. O que limita o
    // volume de RESPOSTA nesse caso é a fila de chat (src/twitch/chat.js), não
    // o cooldown: o registro do ponto sempre acontece.
    const globalMs = def.cooldownGlobalMs === undefined
        ? config.comandos.cooldownGlobalMs
        : def.cooldownGlobalMs;

    const ultimoGlobal = ultimoUsoGlobal.get(nomeUsado) || 0;
    if (globalMs > 0 && agora - ultimoGlobal < globalMs) {
        return globalMs - (agora - ultimoGlobal);
    }

    const cooldownUsuario = def.cooldownMs === undefined
        ? config.comandos.cooldownUsuarioMs
        : def.cooldownMs;

    if (cooldownUsuario > 0) {
        const chave = `${nomeUsado}:${username}`;
        const ultimo = ultimoUsoPorPessoa.get(chave) || 0;
        if (agora - ultimo < cooldownUsuario) {
            return cooldownUsuario - (agora - ultimo);
        }
    }

    return 0;
}

function marcarUso(nomeUsado, username) {
    const agora = Date.now();
    ultimoUsoGlobal.set(nomeUsado, agora);
    ultimoUsoPorPessoa.set(`${nomeUsado}:${username}`, agora);
}

/**
 * Processa uma mensagem do chat.
 * @returns {Promise<boolean>} true se era um comando conhecido
 */
async function despachar({ client, canal, tags, mensagem }) {
    const texto = String(mensagem || '').trim();
    if (!texto.startsWith('!')) {
        return false;
    }

    const partes = texto.split(/\s+/);
    const nomeUsado = partes[0].toLowerCase();
    const def = comandos.get(nomeUsado);

    if (!def) {
        return false;
    }

    const username = (tags.username || '').toLowerCase();

    if (def.permissao === 'admin' && !ehAdmin(tags)) {
        chat.enviar(canal, `@${username}, você não tem permissão para usar este comando.`);
        return true;
    }

    // Admin não fica preso a cooldown.
    if (!ehAdmin(tags)) {
        const restante = cooldownRestante(def, nomeUsado, username);
        if (restante > 0) {
            // Silencioso de propósito: responder "aguarde" a cada tentativa
            // vira spam e conta contra o rate limit do chat.
            return true;
        }
    }

    marcarUso(nomeUsado, username);

    const ctx = {
        client,
        canal,
        tags,
        username,
        mensagem: texto,
        nomeUsado,
        args: partes.slice(1),
        /** Responde mencionando quem chamou (passa pela fila de rate limit). */
        responder(msg) {
            chat.enviar(canal, `@${username}, ${msg}`);
        },
        /** Fala no chat sem mencionar ninguém. */
        dizer(msg) {
            chat.enviar(canal, msg);
        },
    };

    try {
        await def.handler(ctx);
    } catch (erro) {
        log.erro(`[comando ${nomeUsado}] falhou:`, erro.message);
        ctx.responder('deu erro aqui do meu lado. Tenta de novo em instantes.');
    }

    return true;
}

module.exports = { registrar, despachar, ehAdmin };
