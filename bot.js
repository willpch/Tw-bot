/**
 * Bot de pontos da Twitch.
 *
 * Toda a lógica vive em src/: config, banco, API da Twitch, serviços, comandos
 * e watchers. Este arquivo só monta as peças.
 */
const tmi = require('tmi.js');

const config = require('./src/config');
const log = require('./src/logger');
const pool = require('./src/db');
const chat = require('./src/twitch/chat');
const schema = require('./src/services/schema');
const stream = require('./src/twitch/stream');
const anuncios = require('./src/watchers/anuncios');
const { despachar } = require('./src/commands/registry');

// Registra todos os comandos no registry.
require('./src/commands/list');

log.info(`Iniciando bot no canal #${config.twitch.canal} (fuso ${config.timezone})`);

const client = new tmi.Client({
    options: {
        // Era debug: true fixo, o que jogava todo o chat no stdout em produção.
        debug: config.twitch.debug,
    },
    connection: {
        secure: true,
        // O padrão do tmi.js é NÃO reconectar. Sem isto, qualquer queda de rede
        // ou restart do IRC da Twitch deixava o bot vivo no processo mas surdo
        // no chat, sem erro nenhum, até alguém reiniciar na mão.
        reconnect: true,
        maxReconnectAttempts: Infinity,
        maxReconnectInterval: 30000,
    },
    identity: {
        username: config.twitch.botUsername,
        password: config.twitch.oauthToken,
    },
    channels: [config.twitch.canal],
});

// ---------------------------------------------------------------------------
// Eventos de conexão
// ---------------------------------------------------------------------------
client.on('connected', (endereco, porta) => {
    log.info(`Conectado ao chat (${endereco}:${porta}).`);
});

client.on('disconnected', (motivo) => {
    log.aviso(`Desconectado do chat: ${motivo}. Tentando reconectar...`);
});

client.on('reconnect', () => {
    log.info('Reconectando ao chat...');
});

client.on('notice', (canal, id, mensagem) => {
    // Avisa de forma visível quando o token do chat é recusado.
    if (id === 'msg_login_unsuccessful' || /login authentication failed/i.test(mensagem)) {
        log.erro('A Twitch recusou o OAUTH_TOKEN do chat. Gere um novo token para o bot.');
    }
});

// ---------------------------------------------------------------------------
// Mensagens do chat
// ---------------------------------------------------------------------------
client.on('message', async (canal, tags, mensagem, ehDoProprioBot) => {
    if (ehDoProprioBot) return;

    await despachar({ client, canal, tags, mensagem });
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
async function iniciar() {
    // Falha cedo e com mensagem clara se o banco estiver inacessível, em vez de
    // descobrir isso no primeiro !ponto.
    try {
        const conexao = await pool.getConnection();
        await conexao.ping();
        conexao.release();
        log.info('Conexão com o banco OK.');
    } catch (erro) {
        log.erro('Não foi possível conectar ao banco:', erro.message);
        process.exit(1);
    }

    // Recusa subir com o schema antigo: a proteção contra ponto duplicado
    // depende da chave única no banco.
    await schema.exigir();

    // Toda mensagem enviada ao chat passa por esta fila, que respeita o rate
    // limit da Twitch (~20 mensagens / 30s).
    chat.configurar(client);

    await client.connect();

    // Aguarda a primeira leitura do estado da live antes de liberar o !ponto.
    await stream.iniciar();

    anuncios.iniciar();
}

// ---------------------------------------------------------------------------
// Encerramento e falhas
// ---------------------------------------------------------------------------
let encerrando = false;

async function encerrar(sinal) {
    if (encerrando) return;
    encerrando = true;

    log.info(`Recebido ${sinal}: encerrando...`);
    anuncios.parar();
    stream.parar();

    try {
        await client.disconnect();
    } catch (e) {
        // Já pode estar desconectado.
    }
    try {
        await pool.end();
    } catch (e) {
        // Pool já encerrado.
    }

    process.exit(0);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

process.on('uncaughtException', (erro) => {
    log.erro('Exceção não tratada:', erro && erro.stack ? erro.stack : erro);
});

process.on('unhandledRejection', (motivo) => {
    log.erro('Promise rejeitada não tratada:', motivo);
});

iniciar().catch((erro) => {
    log.erro('Falha na inicialização:', erro && erro.stack ? erro.stack : erro);
    process.exit(1);
});
