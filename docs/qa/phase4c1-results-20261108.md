# 4C1 — anonymous real-proxy verification

Date: 2026-11-08. Latest status: **PASSED** after the approved standalone Node
server handover and rerun below. Initial attempt was **BLOCKED** because the
intended serving path was not responding on port 5173; its evidence is retained.

## Approved scope and commands

User approval: `Run 4C1`. Anonymous frontend readiness, real proxied
`/api/v1/auth/me` and CSRF bootstrap only. No login, password access, product
requests/writes or service operations were approved or performed.

Added [proxy-anonymous.e2e.ts](../../frontend/e2e/proxy-anonymous.e2e.ts).
It uses existing guarded, capture-disabled Playwright fixtures with external
traffic blocked, WebSockets closed, only GET allowed, and API paths restricted
to the two approved endpoints. No API mocks or credential fixtures are used.
Values from cookie/token responses are checked only in memory, never printed,
attached or written. Context teardown disposes temporary browser cookies.

From `frontend/`:

```bash
npm run typecheck:e2e
./node_modules/.bin/eslint e2e/proxy-anonymous.e2e.ts
npm run test:e2e -- e2e/proxy-anonymous.e2e.ts --global-timeout=60000
```

Ran bounded one-shot Node fetch diagnostics to exactly
`http://localhost:5173`, a listener check and boolean-only process metadata
inspection after the browser failure. These printed only statuses/booleans
and listener PID metadata, not raw command arguments, environments, cookies,
tokens, bodies, HTML or CSP values. No network destination other than the
approved frontend origin was contacted by the diagnostic client. The proxy's
backend forwarding is the approved real path; the client did not directly
request port 8080 or a numeric-loopback URL.

## Evidence

- Browser test: **FAILED**, exit 1, one case, 1,984 ms. Failing assertion is the
  initial document `cache-control` equality against `no-store`; the actual
  frontend document uses `no-cache`. The runner's safe reporter classifies
  non-E titles as SETUP and suppresses raw error details by design.
- Read-only diagnostics: `/login` returned 200 HTML; `/api/v1/auth/me` returned
  401 `application/problem+json`. The latter matched status, expected title,
  generic detail, a string type and only the standard ProblemDetail field
  allowlist. No raw body was output.
- `/api/v1/auth/csrf` returned 200 with a nonempty token and an XSRF cookie
  header present. Their values were not output or persisted. Because the
  browser failed before reaching its CSRF assertions, browser cookie/token
  equality and cookie attributes are **NOT VERIFIED** by this run.
- Frontend HTML contains `/@vite/client` and the unresolved nonce placeholder;
  the policy has no nonce and no strict style-attribute directive. This is
  development/Vite output, not the standalone server's nonce-substituted,
  no-store document. That server cannot generate this observed combination.
- Port 5173 had one observed Node listener, PID 33619, with the repository
  frontend as its working directory. The narrow `/vite/bin/vite.js` argument
  suffix probe was false, so that probe does not identify its exact entrypoint.
  No raw arguments were printed. HTML behavior establishes the serving-path
  mismatch; how/when the listener changed since Phase 4B was not established.
- No 429 response observed; no limiter wait or reset performed. Anonymous
  status behavior is encouraging, but it does not verify the intended Node
  proxy. No product count was queried and no data changes occurred.

## Harness/static checks

Initial typecheck detected a test-local response variable named document
shadowing the DOM global in a browser callback. Renamed it documentResponse in
the new harness only before the browser run; no check removed. Final E2E
typecheck, focused normal ESLint and editor diagnostics passed. Existing test
assertions, production source, policy and configuration were not changed.

## Proposed correction — NOT applied

Ask the user to stop the process serving Vite/development HTML on port 5173
manually and confirm it is stopped. With explicit service-start approval,
verify the port is free and start the standalone Node server using the existing
build and documented explicit localhost configuration. Do not stop an unknown
or user-owned listener automatically, restart backend/Mongo, weaken the CSP,
or remove the no-store assertion to make Vite satisfy this candidate test.
Rerun 4C1 only after the intended server has the port. If the build is missing
or changed, report that before expanding scope to rebuild/restart operations.

Only this new test and ignored QA documentation were added. Existing worktree
changes preserved. No actual environment files, credentials, backend logs,
installation/download, service start/stop/restart, Git mutation or scanner run.
Reports/test artifacts remain gitignored; screenshots/traces/videos remain off.
4C2-4C4 were not run. H1/H2 raw statuses and the primary historical scoreboard
are unchanged. No production certification or fresh A-H pass is claimed.

## Approved handover and successful rerun

The user confirmed the development frontend stopped and explicitly approved
documenting the standalone command, starting it and rerunning 4C1. Rechecked
port 5173: no listener. Existing build files were present, so no build or install
was needed. Existing editor tasks launch Vite, not this server; none was run or
modified. Started the standalone frontend from `frontend/` with:

```bash
FRONTEND_API_PROXY_TARGET=http://localhost:8080 FRONTEND_HOST=localhost FRONTEND_PORT=5173 npm start
```

Startup returned `Frontend HTML server ready`. It remains running as the
agent-started frontend; do not also start Vite or another listener on 5173.
Backend/Mongo were not restarted. Approved outside-sandbox execution was used
for the known socket/browser restrictions, not to expand network targets.

Expanded [README launch documentation](../../README.md#standalone-frontend-html-server-nonce-csp-candidate)
with the explicit localhost command, separate optional build step, manual
Ctrl+C handover/stop instructions, startup message, occupied-port handling and
the difference from Vite tasks. Added the corresponding
[agent-guide reference](../../AGENTS.md#frontend). Existing notes already cover
no automatic dotenv loading, startup asset snapshots, no HMR, rebuild/restart
requirements and server-only variables; these were preserved. No production
source/configuration or test assertion changed in this rerun.

Reran the exact same focused Playwright command shown above. **PASSED**, one
case, zero failures, exit 0, 474 ms test duration. The existing safe reporter
uses SETUP for this non-E case title; that label is not a separate setup test.
Passing assertions establish:

- `/login`: 200, `Cache-Control: no-store`, login heading visible.
- Real same-origin `/api/v1/auth/me`: 401 `application/problem+json`, expected
  generic title/detail/status, string type, only standard ProblemDetail fields.
- Real same-origin CSRF bootstrap: 200 JSON, nonempty token matching the
  browser-readable XSRF cookie in memory, `no-store`, exactly one XSRF cookie
  with HttpOnly false, SameSite Lax and path `/`. Secure absence in dev is not
  treated as a failure. No cookie/token/header/body values were output.
- No access-token cookie, disallowed local requests, WebSocket attempts or
  browser page errors. External traffic blocked and recordings/service workers
  disabled; no credential fixtures/API mocks. No 429 observed and no waiting.

Whitespace/ignore checks and editor diagnostics for the edited guide documents
passed. Test source was unchanged, so typecheck/lint results from the original
final harness remain the prior results, not fresh runs in this rerun. Existing
worktree changes were preserved; only approved guide documentation and ignored
QA records changed. No actual environment files/passwords accessed, login,
product request/write/count check, install/download, backend/Mongo restart,
scanner, Git mutation or unrelated checklist item. Primary H1/H2 raw statuses
and historical scoreboard remain unchanged. 4C2-4C4 still NOT RUN.

Next approval: 4C2 ADMIN login/cookie/me/reload/logout and read-only
products/stats/count verification through the same frontend origin. Credentials
must come only from the exported environment and remain unrecorded; no product
writes, service restart or rate-limiter wait without separate approval.
