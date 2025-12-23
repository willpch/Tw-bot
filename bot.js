require('dotenv').config();
const tmi = require('tmi.js');
const axios = require('axios');
const dayjs = require('dayjs');
const db = require('./db'); // sem {}

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
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'lais_inc';
const BOT_USERNAME = process.env.BOT_USERNAME || 'lais_bot';
const OAUTH_TOKEN = process.env.OAUTH_TOKEN || 'oauth:q42o4rnqt5wpbtr8y9bzgxbrrchra4';
const CLIENT_ID = process.env.CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'q42o4rnqt5wpbtr8y9bzgxbrrchra4';
const BROADCASTER_ID = process.env.BROADCASTER_ID || '30820759';

const client = new tmi.Client({
    options: { debug: true },
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

      db.serialize(() => {
        db.get(`
      SELECT SUM(pontos) as totalMesAtual
      FROM pontos
      WHERE username = ?
        AND data LIKE ?
    `, [usuario, `${currentMonth}-%`], (err, rowAtual) => {

          db.get(`
        SELECT SUM(pontos) as totalMesPassado
        FROM pontos
        WHERE username = ?
          AND data LIKE ?
      `, [usuario, `${lastMonth}-%`], (err, rowPassado) => {

            if (err) {
              console.error('Erro ao buscar pontos:', err.message);
              client.say(channel, `@${tags.username}, erro ao buscar pontos de @${usuario}.`);
            } else {
              client.say(channel, `@${tags.username}, o usuário @${usuario} tem ${rowAtual?.totalMesAtual || 0} pontos este mês e ${rowPassado?.totalMesPassado || 0} pontos no mês passado.`);
            }
          });
        });
      });
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
      
        db.run(`INSERT INTO pontos (username, data, pontos) VALUES (?, ?, ?)`, [usuario, today, quantidade], (err) => {
          if (err) {
            console.error('Erro adicionando pontos:', err.message);
            client.say(channel, `@${tags.username}, erro ao adicionar pontos.`);
          } else {
            client.say(channel, `@${tags.username}, adicionado ${quantidade} pontos para @${usuario}!`);
          }
        });
    }

    if (message.toLowerCase() === '!batendoponto') {
      db.get(`SELECT * FROM pontos WHERE username = ? AND data = ?`, [username, today], async (err, row) => {
        if (row) {
          client.say(channel, `@${username}, você já bateu o ponto hoje!`);
        } else {
          const online = await isStreamOnline();
          if (!online) {
            client.say(channel, `@${username}, o canal precisa estar AO VIVO para bater o ponto!`);
            return;
          }

          const isSub = await isUserSub(username);
          const pontos = isSub ? 10 : 10;

          db.run(`INSERT INTO pontos (username, data, pontos) VALUES (?, ?, ?)`, [username, today, pontos]);
          client.say(channel, `@${username}, ponto batido! obrigada por aparecer! (Estou em teste!)`);
        }
      });
    }

    if (message.toLowerCase() === '!olá') {
      client.say(channel, `@${username}, Olá! Como você está? Atualmente estou em teste, posso errar, então tenha paciência comigo!`);
    }
  
    if (message.toLowerCase() === '!meuspontos') {
      db.serialize(() => {
        db.get(`
          SELECT SUM(pontos) as totalMesAtual
          FROM pontos
          WHERE username = ?
            AND data LIKE ?
        `, [username, `${currentMonth}-%`], (err, rowAtual) => {
  
          db.get(`
            SELECT SUM(pontos) as totalMesPassado
            FROM pontos
            WHERE username = ?
              AND data LIKE ?
          `, [username, `${lastMonth}-%`], (err, rowPassado) => {
  
            db.all(`
              SELECT username, SUM(pontos) as total
              FROM pontos
              WHERE data LIKE ?
              GROUP BY username
              ORDER BY total DESC
            `, [`${currentMonth}-%`], (err, ranking) => {
  
              const posicao = ranking.findIndex(r => r.username === username) + 1;
  
              client.say(channel, `@${username}, este mês você tem ${rowAtual.totalMesAtual || 0} pontos, mês passado acumulou ${rowPassado.totalMesPassado || 0} pontos. Sua posição atual: ${posicao > 0 ? `#${posicao}` : 'fora do ranking'}.`);
            });
          });
        });
      });
    }
  
    if (message.toLowerCase() === '!ranking') {
      db.all(`
        SELECT username, SUM(pontos) as total
        FROM pontos
        WHERE data LIKE ?
        GROUP BY username
        ORDER BY total DESC
        LIMIT 5
      `, [`${currentMonth}-%`], (err, rows) => {
          if (rows.length === 0) {
              client.say(channel, `Ainda não temos funcionários pontuando este mês.`);
          } else {

              let msg = '🏆 Funcionários do Mês: -> \n\n';

              rows.slice(0, 10).forEach((row, idx) => {
                  let icon = "⭐";

                  if (idx === 0) icon = "🥇";
                  else if (idx === 1) icon = "🥈";
                  else if (idx === 2) icon = "🥉";

                  msg += ` | ${icon} #${idx+1} ${row.username} (${row.total} pts)`;
              });

              client.say(channel, msg);
          }
      });
    }
  
    if (message.toLowerCase() === '!regrasponto') {
      client.say(channel, `📋 Regras: Bater ponto uma vez por dia enquanto a live estiver online. Ganhe pontos dependendo do horário do resgate!`);
    }
  });
