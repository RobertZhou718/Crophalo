# Crophalo's data server for Azure Container Apps: Node 22 runs scripts/serve.mjs, Python 3.12 with the pinned libraries runs the NASA lookups behind /api.
# The website's visitors get the pages from Azure Static Web Apps; the pages ask this server for the /api addresses only (.dockerignore says what stays out of the image).
# The NASA login is never in the image: the owner types EARTHDATA_USERNAME and EARTHDATA_PASSWORD as secrets of the container app, and scripts/start.sh writes ~/.netrc at start.
# GitHub builds it (.github/workflows/api-image.yml) for linux/amd64, the only kind Container Apps runs; rasterio 1.4.3 has no ready-built file for Linux on arm64.
# To try it on a computer that has Docker: docker build --platform linux/amd64 -t crophalo-api . && docker run --platform linux/amd64 -p 8080:8080 crophalo-api
# (then http://127.0.0.1:8080/api/health). It was never built on the computer it was written on, which has no Docker: the workflow's own test is the first time it is built.

FROM node:22-bookworm-slim AS node

FROM python:3.12-slim-bookworm
# The server uses only Node's built-in parts, so Node is one file copied from the official image: no npm, no packages.
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# A user of its own, not root: everything the server writes (the kept answers, the login file) belongs to it and nobody else.
RUN useradd --system --create-home --home-dir /home/crophalo --uid 10001 --shell /usr/sbin/nologin crophalo \
 && mkdir -p /app /var/cache/crophalo && chown crophalo:crophalo /app /var/cache/crophalo
WORKDIR /app

# The Python libraries first, so a change to the app does not install them again. Ready-built files only: the build never compiles anything.
COPY --chown=crophalo:crophalo scripts/requirements.txt scripts/requirements.txt
RUN python -m venv /app/.venv \
 && /app/.venv/bin/pip install --no-cache-dir --only-binary=:all: --disable-pip-version-check -r scripts/requirements.txt \
 && chown -R crophalo:crophalo /app/.venv

COPY --chown=crophalo:crophalo . /app

USER crophalo
# HOST=0.0.0.0 makes the server public (the lookups are throttled, nothing of this computer is shown). No PORT here on purpose: scripts/start.sh takes PORT when a
# host sets it, else CONTAINER_APP_PORT (the target port typed on the container app's Ingress page, which Container Apps hands every app), else 8080.
# One proxy (the Container Apps ingress) stands in front and appends the visitor's address. On Azure the cache folder is the Azure Files share crophalo-cache
# (mount options uid=10001,dir_mode=0700,file_mode=0600), so the kept answers and the push keys and subscriptions survive a restart; without it, a temporary disk.
ENV HOME=/home/crophalo \
    HOST=0.0.0.0 \
    FW_CACHE=/var/cache/crophalo \
    TRUST_PROXY_HOPS=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8080
# For a plain docker run only: Container Apps checks the app with its own probes on the target port (its defaults when ingress is on).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "scripts/start.sh"]
