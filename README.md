# Point Bot — bot de pontos da Twitch

Bot de chat que registra o "ponto" diário de quem assiste à live. Quem bate o
ponto primeiro leva mais pontos. Os dados alimentam o
[painel](https://github.com/willpch/painel-bot), que mostra o ranking público e
fecha o mês.

## Comandos

| Comando | Quem pode | O que faz |
|---|---|---|
| `!ponto` / `!batendoponto` | todos | Bate o ponto do dia (só com a live no ar) |
| `!meuspontos` | todos | Pontos, posição, quanto falta pro próximo, sequência de dias |
| `!ranking` / `!rank` | todos | Link do ranking completo |
| `!regrasponto` / `!regras` | todos | Explica as regras |
| `!ola` | todos | Cumprimento |
| `!pontos <usuario>` | dono e mods | Consulta os pontos de outra pessoa |
| `!addpontos <usuario> <qtd>` | dono e mods | Lança pontos manualmente |

## Anúncios automáticos

- **Live abriu:** ao detectar a transição offline → online, avisa no chat que o
  ponto está liberado.
- **Mês fechado:** quando o painel fecha um mês, o bot anuncia o funcionário do
  mês e **aplica os VIPs escolhidos direto na Twitch** (precisa de
  `TWITCH_REFRESH_TOKEN` com escopo `channel:manage:vips`).

## Instalação

```bash
npm ci --omit=dev
cp .env.example .env    # preencha
npm start
```

O banco é o mesmo do painel — rode `db/schema.sql` ou
`db/migrations/001_hardening.sql` de lá antes de subir o bot. A chave única
`(username, dia)` na tabela `pontos` é **obrigatória**: é ela que impede ponto
duplicado.

## Tokens da Twitch

São três credenciais diferentes, com finalidades distintas:

| Variável | Para quê | Expira? |
|---|---|---|
| `OAUTH_TOKEN` | Entrar no chat como o bot | Sim, gere um novo quando o log acusar recusa |
| `CLIENT_ID` + `CLIENT_SECRET` | Ler a API (a live está no ar?) | Renovado automaticamente |
| `TWITCH_REFRESH_TOKEN` | Conceder VIP como o dono do canal | Renovado automaticamente |

**Defina `CLIENT_SECRET`.** Sem ele o bot cai no `ACCESS_TOKEN` fixo, que
expira em poucas horas — era exatamente esse o problema antigo: quando o token
morria, a checagem de "a live está no ar?" falhava e o bot passava a liberar
ponto com a live fora do ar, ou a barrar todo mundo, sem nada no log indicando
a causa.

Para obter o `TWITCH_REFRESH_TOKEN` (opcional, só para o VIP automático),
autorize o app com escopo `channel:manage:vips` **na conta do dono do canal** e
guarde o `refresh_token` devolvido.

## Docker

```bash
docker build -t point-bot .
docker run -d --name point-bot --env-file .env --restart unless-stopped point-bot
```

Os segredos também podem vir de `/run/secrets/`: `db_password`,
`twitch_oauth_token`, `twitch_client_secret`, `twitch_refresh_token`.

## Estrutura

```
bot.js                      monta as peças e trata conexão/encerramento
src/config.js               lê e valida o ambiente
src/db.js                   pool MySQL (sempre promises)
src/logger.js               log com rotação
src/twitch/auth.js          tokens da API, com renovação automática
src/twitch/api.js           Helix com retry, backoff e refresh no 401
src/twitch/stream.js        monitora se a live está no ar (poll de 60s)
src/services/pontos.js      bater ponto, somar pontos, ranking, streak
src/services/meses.js       fechamento de mês e VIPs
src/commands/registry.js    despacho, cooldown e permissões
src/commands/list.js        os comandos
src/watchers/anuncios.js    avisos de live aberta e de mês fechado
```

## Variáveis de ambiente

Veja `.env.example`. As que mais mudam comportamento:

| Variável | Padrão | O que faz |
|---|---|---|
| `PONTOS_BASE` | 100 | Pontos do primeiro do dia; cai 1 por pessoa que já bateu |
| `MULT_HORA_EXTRA` | 0.7 | **Precisa ser igual** ao `config/app.php` do painel |
| `ADDPONTOS_MAX` | 500 | Teto por chamada do `!addpontos` |
| `ADMIN_USERS` | vazio | Nomes extras com permissão administrativa |
| `COOLDOWN_USUARIO_MS` | 30000 | Cooldown por pessoa por comando |
| `STREAM_POLL_MS` | 60000 | Frequência da checagem de live |
| `DEBUG_TMI` | false | Logs verbosos do tmi.js |
