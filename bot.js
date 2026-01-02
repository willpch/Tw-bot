require('dotenv').config();
const tmi = require('tmi.js');
const axios = require('axios');
const dayjs = require('dayjs');
const pool = require('./db'); // agora usando pool do mysql2

// Adição: logs de diagnóstico para facilitar debug de caminho e ambiente
console.log('Iniciando bot.js');
console.log('Arquivo atual:', __filename);
console.log('Diretório atual:', process.cwd());

// Captura de exceções não tratadas para facilitar diagnóstico
process.on('uncaughtException', (err) => {
    console.error('Exceção não tratada:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Promise rejeitada não tratada:', reason);
});

// Configurações do bot
const CHANNEL_NAME = process.env.CHANNEL_NAME;
const BOT_USERNAME = process.env.BOT_USERNAME;
const OAUTH_TOKEN = process.env.OAUTH_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const BROADCASTER_ID = process.env.BROADCASTER_ID;

const client = new tmi.Client({
    options: {debug: true},
    identity: {
        username: BOT_USERNAME,
        password: OAUTH_TOKEN
    },
    channels: [CHANNEL_NAME]
});

client.connect();

async function isStreamOnline() {
    const url = `https://api.twitch.tv/helix/streams?user_login=${CHANNEL_NAME}`;
    const res = await axios.get(url, {
        headers: {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
    });
    return res.data.data.length > 0;
}

async function isUserSub(username) {
    try {
        const userUrl = `https://api.twitch.tv/helix/users?login=${username}`;
        const userRes = await axios.get(userUrl, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });

        const userId = userRes.data.data[0]?.id;
        if (!userId) return false;

        const subUrl = `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${BROADCASTER_ID}&user_id=${userId}`;
        const subRes = await axios.get(subUrl, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });

        return subRes.data.data.length > 0;
    } catch (error) {
        console.error('Erro verificando sub:', error.message);
        return false;
    }
}

// ---------------------
// Eventos de mensagem
// ---------------------
client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    const username = tags.username;
    const today = dayjs().format('YYYY-MM-DD');
    const currentMonth = dayjs().format('YYYY-MM');
    const lastMonth = dayjs().subtract(1, 'month').format('YYYY-MM');

    if (message.toLowerCase().startsWith('!pontos ')) {
        if (tags.username !== CHANNEL_NAME) {
            client.say(channel, `@${tags.username}, você não tem permissão para usar este comando.`);
            return;
        }

        const parts = message.trim().split(' ');
        if (parts.length < 2) {
            client.say(channel, `@${tags.username}, use: !pontos nomedousuario`);
            return;
        }

        const usuario = parts[1].replace('@', '').toLowerCase();
        try {
            const [rowsAtual] = await pool.promise().query(
                `SELECT SUM(pontos) as totalMesAtual
                 FROM pontos
                 WHERE username = ?
                   AND data LIKE ?`,
                [usuario, `${currentMonth}-%`]
            );
            const [rowsPassado] = await pool.promise().query(
                `SELECT SUM(pontos) as totalMesPassado
                 FROM pontos
                 WHERE username = ?
                   AND data LIKE ?`,
                [usuario, `${lastMonth}-%`]
            );
            client.say(channel, `@${tags.username}, o usuário @${usuario} tem ${(rowsAtual[0]?.totalMesAtual || 0)} pontos este mês e ${(rowsPassado[0]?.totalMesPassado || 0)} pontos no mês passado.`);
        } catch (err) {
            console.error('Erro ao buscar pontos:', err.message);
            client.say(channel, `@${tags.username}, erro ao buscar pontos de @${usuario}.`);
        }
    }

    if (message.toLowerCase().startsWith('!addpontos')) {
        if (tags.username !== CHANNEL_NAME) {
            client.say(channel, `@${tags.username}, você não tem permissão para usar este comando.`);
            return;
        }

        const parts = message.trim().split(' ');
        if (parts.length < 3) {
            client.say(channel, `@${tags.username}, use: !addpontos usuario quantidade`);
            return;
        }

        const usuario = parts[1].replace('@', '').toLowerCase();
        const quantidade = parseInt(parts[2], 10);
        const today = dayjs().format('YYYY-MM-DD');

        if (isNaN(quantidade) || quantidade <= 0) {
            client.say(channel, `@${tags.username}, quantidade inválida.`);
            return;
        }
        pool.query(
            `INSERT INTO pontos (username, data, pontos)
             VALUES (?, ?, ?)`,
            [usuario, today, quantidade],
            (err) => {
                if (err) {
                    console.error('Erro adicionando pontos:', err.message);
                    client.say(channel, `@${tags.username}, erro ao adicionar pontos.`);
                } else {
                    client.say(channel, `@${tags.username}, adicionado ${quantidade} pontos para @${usuario}!`);
                }
            }
        );
    }

    if (
        message.toLowerCase() === '!batendoponto' ||
        message.toLowerCase() === '!ponto'
    ) {
        try {
            const [jaBateu] = await pool.promise().query(
                `SELECT 1 FROM pontos WHERE username = ? AND data = ? LIMIT 1`,
                [username, today]
            );
            if (jaBateu.length > 0) {
                client.say(channel, `@${username}, você já bateu o ponto hoje!`);
                return;
            }

            const online = await isStreamOnline();
            if (!online) {
                client.say(channel, `@${username}, o canal precisa estar AO VIVO para bater o ponto!`);
                return;
            }

            const [contagemDia] = await pool.promise().query(
                `SELECT COUNT(*) AS total FROM pontos WHERE data = ?`,
                [today]
            );
            const totalHoje = contagemDia[0]?.total || 0;
            const pontos = Math.max(0, 100 - totalHoje);

            await pool.promise().query(
                `INSERT INTO pontos (username, data, pontos) VALUES (?, ?, ?)`,
                [username, today, pontos]
            );
            client.say(channel, `@${username}, ponto batido! Você ganhou ${pontos} pontos!`);
        } catch (err) {
            console.error('Erro ao bater ponto:', err.message);
            client.say(channel, `@${username}, não consegui registrar seu ponto agora. Tente novamente em instantes.`);
        }
    }

    if (
        message.toLowerCase() === '!ola' ||
        message.toLowerCase() === '!olá'
    ) {
        client.say(channel, `@${username}, Olá! Como você está? Atualmente estou em teste, posso errar, então tenha paciência comigo!`);
    }

    if (message.toLowerCase() === '!meuspontos') {
        try {
            const [rowsAtual] = await pool.promise().query(
                `SELECT SUM(pontos) as totalMesAtual
                 FROM pontos
                 WHERE username = ?''
                   AND data LIKE ?`,
                [username, `${currentMonth}-%`]
            );
            const [rowsPassado] = await pool.promise().query(
                `SELECT SUM(pontos) as totalMesPassado
                 FROM pontos
                 WHERE username = ?
                   AND data LIKE ?`,
                [username, `${lastMonth}-%`]
            );
            const [ranking] = await pool.promise().query(
                `SELECT username, SUM(pontos) as total
                 FROM pontos
                 WHERE data LIKE ?
                 GROUP BY username
                 ORDER BY total DESC`,
                [`${currentMonth}-%`]
            );
            const posicao = ranking.findIndex(r => r.username === username) + 1;
            client.say(channel, `@${username}, este mês você tem ${(rowsAtual[0]?.totalMesAtual || 0)} pontos, mês passado acumulou ${(rowsPassado[0]?.totalMesPassado || 0)} pontos. Sua posição atual: ${posicao > 0 ? `#${posicao}` : 'fora do ranking'}.`);
        } catch (err) {
            console.error('Erro ao buscar pontos:', err.message);
            client.say(channel, `@${username}, erro ao buscar seus pontos.`);
        }
    }

    if (
        message.toLowerCase() === '!ranking' ||
        message.toLowerCase() === '!rank'
    ) {
        client.say(channel, "Para ver tabela de pontos e funcionários do mês: https://lais.nootsoft.com.br/ranking");
    }

    if (message.toLowerCase() === '!regrasponto') {
        client.say(channel, `📋 Regras: Bater ponto uma vez por dia enquanto a live estiver online. Você ganha 100 pontos (ou menos) baseado em quem bateo pontos primeiro, descrescendo! Use !batendoponto ou !ponto para bater o ponto diário. Comando !meuspontos para ver seus pontos do mês atual e anterior. Comando !ranking para ver o ranking completo! 📋`);
    }
});
