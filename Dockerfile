FROM node:20-alpine

# O Alpine não traz base de fusos horários: sem tzdata, definir TZ não muda
# nada e o container continua em UTC — o que fazia um ponto batido às 21h30 de
# 30/09 ser gravado como 00h30 de 01/10, caindo no mês errado.
ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R node:node /app

# Não roda como root.
USER node

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "bot.js"]
