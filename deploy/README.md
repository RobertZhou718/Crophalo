The two files in azure-workflows/ move to .github/workflows/ on launch day, only after the owner says yes: once they are there, every push to main publishes the server's image as a package on GitHub, and the website once its secret is set.

# Putting Crophalo online

The website goes to Azure Static Web Apps (Free); the data server behind /api goes to Azure Container Apps, which lets it sleep when nobody uses it.
On this computer nothing here is needed: Crophalo starts and works exactly as before.

- `stage-site.mjs`: the website's deploy step. It copies only the files the app's own server hands out, writes `js/site-config.js` with the data server's address, and fills `staticwebapp.config.json` (the security headers and the content policy).
- `staticwebapp.config.json`: the template for the website's headers, policy, refusals and cache rules.
- `test_stage_site.mjs`: its checks, with no network. `sh scripts/check.sh` runs it.
- `test_container_like.mjs`: the data server as Container Apps runs it, with an empty home: `node deploy/test_container_like.mjs .`
- `check_csp_browser.mjs`: a staged website under its policy in a headless browser: `node deploy/check_csp_browser.mjs <staged folder>`
- `azure-workflows/site.yml`: puts the website online on each push to main.
- `azure-workflows/api-image.yml`: builds, tests and publishes the data server's image (the `Dockerfile` at the top of the folder; `.dockerignore` says what stays out).

Before each push to main: `node deploy/stage-site.mjs . --check --strict`
