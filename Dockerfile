# Debian (not Alpine) so LibreOffice and its fonts come from well-maintained packages.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# LibreOffice (headless Writer only) turns the generated .docx into a print-ready PDF.
# Carlito = metric-compatible Calibri, Liberation = metric-compatible Times New Roman / Arial.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-crosextra-carlito fonts-liberation2 fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
COPY assets ./assets

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
