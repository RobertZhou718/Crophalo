The two workflows are in .github/workflows/ (moved there on launch day, 15 November 2026): every push to main publishes the server's image as a package on GitHub, and the website.

# Putting Crophalo online

The website goes to Azure Static Web Apps (Free); the data server behind /api goes to Azure Container Apps, with one copy always awake (min and max replicas 1) and an Azure Files share at /var/cache/crophalo, so the reminder pushes keep their keys and subscriptions.
On this computer nothing here is needed: Crophalo starts and works exactly as before.

- `stage-site.mjs`: the website's deploy step. It copies only the files the app's own server hands out, writes `js/site-config.js` with the data server's address, and fills `staticwebapp.config.json` (the security headers and the content policy).
- `staticwebapp.config.json`: the template for the website's headers, policy, refusals and cache rules.
- `test_stage_site.mjs`: its checks, with no network. `sh scripts/check.sh` runs it.
- `test_container_like.mjs`: the data server as Container Apps runs it, with an empty home: `node deploy/test_container_like.mjs .`
- `check_csp_browser.mjs`: a staged website under its policy in a headless browser: `node deploy/check_csp_browser.mjs <staged folder>`
- `.github/workflows/site.yml`: puts the website online on each push to main.
- `.github/workflows/api-image.yml`: builds, tests and publishes the data server's image (the `Dockerfile` at the top of the folder; `.dockerignore` says what stays out).

Before each push to main: `node deploy/stage-site.mjs . --check --strict`
