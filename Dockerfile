FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @kalitedb/api build

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 8080

CMD ["sh", "-c", "pnpm --filter @kalitedb/api exec next start -H 0.0.0.0 -p ${PORT:-8080}"]
