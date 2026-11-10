# Frontend: compile React into static assets.
FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# CPU speech engine: build for Linux, with no Windows binaries in the repo.
FROM debian:bookworm-slim AS speech
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v1.8.5 https://github.com/ggml-org/whisper.cpp.git /opt/whisper
RUN cmake -S /opt/whisper -B /opt/whisper/build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DBUILD_SHARED_LIBS=OFF && cmake --build /opt/whisper/build --config Release --parallel 2 --target whisper-cli
RUN mkdir -p /opt/models && curl --fail --location --retry 3 https://huggingface.co/ggerganov/whisper.cpp/resolve/80da2d8bfee42b0e836fc3a9890373e5defc00a6/ggml-base.bin -o /opt/models/ggml-base.bin && echo '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe  /opt/models/ggml-base.bin' | sha256sum --check

# Runtime: Node has the built-in SQLite/fetch/HTTP APIs used by server.mjs.
FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gosu ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 AI_PROVIDER=aion DATABASE_PATH=/var/data/clearspace.sqlite WHISPER_EXECUTABLE=/usr/local/bin/whisper-cli WHISPER_MODEL=/opt/models/ggml-base.bin
COPY --from=frontend /app/dist ./dist
COPY --from=speech /opt/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=speech /opt/models/ggml-base.bin /opt/models/ggml-base.bin
COPY server.mjs local-speech.mjs ./
COPY scripts/import.mjs ./scripts/import.mjs
COPY scripts/container-entrypoint.sh /usr/local/bin/clearspace-entrypoint
COPY licenses ./licenses
RUN mkdir -p /var/data && chown -R node:node /var/data /app && chmod 755 /usr/local/bin/clearspace-entrypoint
ENTRYPOINT ["/usr/local/bin/clearspace-entrypoint"]
EXPOSE 3000
CMD ["node", "server.mjs"]
