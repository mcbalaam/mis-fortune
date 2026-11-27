FROM oven/bun:1.4.5 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY bunfig.toml ./
COPY src ./src
RUN bun build --target=bun --production --outdir=dist ./src/index.ts

FROM oven/bun:1.4.5-distroless
WORKDIR /app/dist
ENV NODE_ENV=production
COPY --from=build /app/dist ./

USER 65532:65532
EXPOSE 3000
CMD ["./index.js"]
