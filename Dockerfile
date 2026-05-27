# Guengo — production image (frontend build + Rust API + static assets).
# Used by Railway; also works locally: docker build -t guengo . && docker run -p 8080:8080 --env-file .env guengo

FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend/ frontend/
# Railway/Vercel expose dashboard env vars during `docker build` — bake public keys into SPA.
RUN npm run build --workspace frontend

FROM rust:1-bookworm AS backend
WORKDIR /app
COPY backend/ backend/
RUN cargo build --release --manifest-path backend/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /app/backend/target/release/guengo-api /app/guengo-api
COPY --from=frontend /app/frontend/public /app/frontend/public
ENV GUENGO_PUBLIC_DIR=/app/frontend/public
EXPOSE 8080
CMD ["/app/guengo-api"]
