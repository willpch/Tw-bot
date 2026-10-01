const log = require('../logger');

/**
 * Fila de envio para o chat, respeitando o rate limit da Twitch.
 *
 * Uma conta comum pode enviar ~20 mensagens por 30 segundos. Numa corrida de
 * !ponto (a pontuação é decrescente, então todo mundo digita ao mesmo tempo) o
 * bot precisaria responder a dezenas de pessoas de uma vez: sem fila, a Twitch
 * descarta as mensagens excedentes — ou aplica timeout no bot por flood.
 *
 * A fila desacopla "registrar o ponto" de "responder no chat": o registro
 * sempre acontece; a resposta pode atrasar alguns segundos.
 */

const LIMITE_MENSAGENS = 18;        // margem sobre as 20 permitidas
const JANELA_MS = 30 * 1000;
const TAMANHO_MAX_FILA = 60;
const LIMITE_CARACTERES = 480;      // limite da Twitch é 500

const fila = [];
const enviadasEm = [];
let processando = false;
let client = null;

function configurar(clienteTmi) {
    client = clienteTmi;
}

function podeEnviarAgora() {
    const agora = Date.now();
    while (enviadasEm.length > 0 && agora - enviadasEm[0] > JANELA_MS) {
        enviadasEm.shift();
    }
    return enviadasEm.length < LIMITE_MENSAGENS;
}

function esperaAte() {
    if (enviadasEm.length === 0) return 0;
    return Math.max(JANELA_MS - (Date.now() - enviadasEm[0]) + 50, 50);
}

async function processar() {
    if (processando) return;
    processando = true;

    while (fila.length > 0) {
        if (!podeEnviarAgora()) {
            await new Promise((resolve) => setTimeout(resolve, esperaAte()));
            continue;
        }

        const { canal, texto } = fila.shift();

        try {
            await client.say(canal, texto);
            enviadasEm.push(Date.now());
        } catch (erro) {
            log.erro('[chat] falha ao enviar mensagem:', erro.message);
        }
    }

    processando = false;
}

/**
 * Enfileira uma mensagem.
 * @param {'normal'|'alta'} prioridade  'alta' entra na frente (anúncios)
 */
function enviar(canal, texto, prioridade = 'normal') {
    if (!client) {
        log.erro('[chat] fila usada antes de configurar o cliente tmi.');
        return;
    }

    const mensagem = { canal, texto: String(texto).slice(0, LIMITE_CARACTERES) };

    if (fila.length >= TAMANHO_MAX_FILA) {
        // Fila estourada: descarta a mensagem mais antiga de prioridade normal.
        // Perder uma resposta antiga é melhor que acumular atraso de minutos.
        const indice = fila.findIndex((m) => !m.alta);
        if (indice === -1) {
            log.aviso('[chat] fila cheia: mensagem descartada.');
            return;
        }
        fila.splice(indice, 1);
    }

    if (prioridade === 'alta') {
        mensagem.alta = true;
        const primeiroNormal = fila.findIndex((m) => !m.alta);
        if (primeiroNormal === -1) {
            fila.push(mensagem);
        } else {
            fila.splice(primeiroNormal, 0, mensagem);
        }
    } else {
        fila.push(mensagem);
    }

    processar().catch((erro) => log.erro('[chat] erro ao processar a fila:', erro.message));
}

function tamanhoDaFila() {
    return fila.length;
}

module.exports = { configurar, enviar, tamanhoDaFila };
