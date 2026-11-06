# Robô da SEFAZ (robo.mjs). Gerado e agendado pelo configurar-sefaz.sh.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY nota.mjs assinatura.mjs robo.mjs ./
CMD ["node", "robo.mjs"]
