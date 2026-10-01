require('dotenv').config();

/**
 * Configuração central, validada na inicialização.
 *
 * Antes cada arquivo lia process.env direto e o bot só descobria que faltava
 * uma variável quando a operação falhava no meio do chat.
 */

function obrigatoria(nome) {
    const valor = process.env[nome];
    if (!valor || !String(valor).trim()) {
        console.error(`[config] variável de ambiente obrigatória ausente: ${nome}`);
        console.error('[config] copie .env.example para .env e preencha os valores.');
        process.exit(1);
    }
    return String(valor).trim();
}

function opcional(nome, padrao = null) {
    const valor = process.env[nome];
    return (valor === undefined || String(valor).trim() === '') ? padrao : String(valor).trim();
}

function inteiro(nome, padrao) {
    const valor = parseInt(opcional(nome, ''), 10);
    return Number.isFinite(valor) ? valor : padrao;
}

function booleano(nome, padrao = false) {
    const valor = opcional(nome, null);
    if (valor === null) return padrao;
    return ['1', 'true', 'sim', 'yes'].includes(valor.toLowerCase());
}

// O fuso precisa estar definido antes de qualquer cálculo de data. Sem isso o
// container roda em UTC e um ponto batido às 21h30 de 30/09 é gravado como
// 00h30 de 01/10 — caindo no mês errado no ranking e no fechamento.
const timezone = opcional('TZ', 'America/Sao_Paulo');
process.env.TZ = timezone;

const canal = obrigatoria('CHANNEL_NAME').toLowerCase().replace(/^#/, '');

const config = {
    timezone,

    db: {
        host: obrigatoria('DB_HOST'),
        user: obrigatoria('DB_USER'),
        password: opcional('DB_PASSWORD', ''),
        database: obrigatoria('DB_DATABASE'),
    },

    twitch: {
        canal,
        canalChat: `#${canal}`,
        botUsername: obrigatoria('BOT_USERNAME'),
        oauthToken: obrigatoria('OAUTH_TOKEN'),
        clientId: obrigatoria('CLIENT_ID'),
        // Com CLIENT_SECRET o bot obtém e renova o token da API sozinho.
        clientSecret: opcional('CLIENT_SECRET'),
        // Token fixo legado: usado só quando não há CLIENT_SECRET. Expira.
        accessTokenFixo: opcional('ACCESS_TOKEN'),
        // Refresh token de usuário — necessário apenas para conceder VIP.
        refreshToken: opcional('TWITCH_REFRESH_TOKEN'),
        broadcasterId: opcional('BROADCASTER_ID'),
        debug: booleano('DEBUG_TMI', false),
    },

    pontos: {
        // Primeiro do dia leva 100; cada pessoa que já bateu reduz 1 ponto.
        pontosBase: inteiro('PONTOS_BASE', 100),
        addPontosMax: inteiro('ADDPONTOS_MAX', 500),
        // Precisa ser o MESMO valor de multiplicador_hora_extra em
        // config/app.php do painel. Se divergir, o número que o bot fala no
        // chat não bate com o do site.
        multHoraExtra: Number(opcional('MULT_HORA_EXTRA', '0.7')) || 0.7,
    },

    comandos: {
        // Cooldown por pessoa e global, em milissegundos. Sem isso qualquer um
        // podia spammar !meuspontos, que roda várias agregações no banco.
        cooldownUsuarioMs: inteiro('COOLDOWN_USUARIO_MS', 30000),
        cooldownGlobalMs: inteiro('COOLDOWN_GLOBAL_MS', 3000),
        // Quem pode usar comandos administrativos, além do dono do canal.
        admins: (opcional('ADMIN_USERS', '') || '')
            .split(',')
            .map((n) => n.trim().toLowerCase().replace(/^@/, ''))
            .filter(Boolean),
    },

    stream: {
        // A cada quanto tempo checar se a live está no ar.
        // Era um cache de 15 MINUTOS: nos primeiros 15 min de live o bot ainda
        // respondia "o canal precisa estar AO VIVO" para quem batia ponto.
        pollMs: inteiro('STREAM_POLL_MS', 60000),
        // Depois disso sem resposta da API, o estado deixa de ser confiável.
        toleranciaFalhaMs: inteiro('STREAM_TOLERANCIA_MS', 600000),
    },

    anuncios: {
        // Frequência da verificação de meses fechados no painel.
        intervaloMs: inteiro('ANUNCIOS_INTERVALO_MS', 60000),
    },

    rankingUrl: opcional('RANKING_URL', 'https://laisinc.com.br/ranking'),
};

module.exports = config;
