# 4C2 — real ADMIN authentication through the standalone proxy

Date: 2026-11-08. Latest status: **PASSED — approved rerun completed**.
The initial frontend-unavailable BLOCKED attempt is retained below as history.

## Approved scope and value

The user approved 4C2 and asked to leave H1/H2 disposed. This check adds
real Node-to-Spring authentication coverage beyond the mocked Phase 4B tests:
one UI login, cookie/CSRF delivery, cookie lifetime versus JWT lifetime, reload
persistence, authenticated products/stats reads, baseline count 500 and logout.
It does not approve product writes, service changes, installations, recordings
or additional checklist items. H1/H2 disposition closure does not rewrite their
historical raw scanner failures or accept future/new finding snapshots.

## Test and preparation

Added [proxy-admin.e2e.ts](../../frontend/e2e/proxy-admin.e2e.ts), preserving all
existing tests. Uses the existing guarded fixtures/safe reporter with no
credential-bearing adminApi/products fixtures, no API mocks and no direct
backend requests. The browser guard permits only the localhost:5173 origin,
the required GET API paths and at most one login/logout POST each. All other
local requests/writes and all WebSockets are blocked; external traffic aborted.
Trace, video, screenshot and service workers remain disabled. Debug/protocol
logging environment overrides are removed from the invocation.

Confirmed only that DEV_ADMIN_PASSWORD was present in the inherited
environment; its value was not printed. Username is the documented lowercase
admin seeder default. No actual environment file, other credential variable,
JWT signing secret, runtime log or user data was searched/read for diagnosis.

From `frontend/`:

```bash
npm run typecheck:e2e
./node_modules/.bin/eslint e2e/proxy-admin.e2e.ts
env -u DEBUG -u PWDEBUG -u NODE_OPTIONS -u NODE_TEST_CONTEXT npm run test:e2e -- e2e/proxy-admin.e2e.ts --global-timeout=60000
```

Final E2E typecheck, focused normal ESLint and editor diagnostics PASSED.
No production rebuild was required or performed for this new test source.

## Runtime evidence

- Browser runner discovered one test and exited 1: one FAILED case, duration
  118 ms, privacy-safe reason QA_CHECK_FAILED. The reporter labels non-E titles
  SETUP and withholds raw call logs/errors. Do not disable those controls to
  diagnose a credential-bearing run.
- A bounded anonymous GET to `http://localhost:5173/login` subsequently failed
  with ECONNREFUSED, not timeout. No HTTP body/headers or secret values printed.
- Read-only listener inspection found no listener on port 5173. This confirms
  the prerequisite is currently unavailable; the earlier 4C1 success remains
  historical evidence, not proof that the service survived until this run.
- The test must load the login document and heading before filling credentials
  or submitting login. With the frontend unreachable, the ADMIN flow could not
  proceed. No login retry, successful authenticated reads/count, cookie/expiry
  verification, reload or logout outcome is asserted. All are NOT VERIFIED.
- No 429 was observed; no limiter wait/reset, service start/stop/restart,
  database/product write, package/browser/image download, Git mutation or
  unrelated checklist item. Temporary test context disposed, recordings off,
  and artifact directories remain ignored. No actual product count queried.

The exact reason the prior frontend process ended is not established. Do not
infer a server implementation defect or a deliberate user stop from absence
alone. No automatic relaunch or production/harness weakening was attempted.

## Proposed next step — requires confirmation

Start the documented standalone server in a dedicated VS Code terminal and
keep it open, rather than starting Vite. From the repository root:

```bash
cd frontend
FRONTEND_API_PROXY_TARGET=http://localhost:8080 FRONTEND_HOST=localhost FRONTEND_PORT=5173 npm start
```

Wait for `Frontend HTML server ready`, then confirm readiness and authorize
rerunning 4C2. Alternatively explicitly authorize an agent-owned startup/rerun.
If port 5173 becomes occupied, identify the listener; do not kill it blindly.
Backend/Mongo restart is neither proposed nor required for this frontend step.

Only the new test and pre-approved ignored QA documentation changed. Existing
worktree changes preserved. H1/H2 remain disposed per the latest user direction,
raw failures retained; 4C1 remains historically PASSED, 4C2 BLOCKED, 4C3/4C4
NOT RUN. Do not advance to 4C3 until 4C2 succeeds and permission is obtained.

## Approved rerun — PASSED

The user explicitly approved rerunning 4C2. No service was started, stopped or
restarted by the agent. Before authentication, a bounded anonymous readiness
GET established frontend 200, no-store, no Vite client/unresolved marker and
matching document/CSP nonce. The test environment contained the ADMIN password;
only its presence was reported. No actual local environment file was read.

Executed the unchanged guarded browser command above once, with no retries.
**One test PASSED, zero failures, exit 0, 2,194 ms test duration.** The safe
reporter's SETUP identifier denotes this non-E-titled case, not another test.
All original assertions remain. No raw headers, bodies, token/cookie/password
values, screenshots, traces, video or storage-state exports were recorded.

Verified through `http://localhost:5173` and the real Node API proxy:

| Check | Observed passing condition |
| --- | --- |
| Login | Exactly one UI login POST returned 200; JSON contained only username/roles, with expected admin identity/ADMIN role; dashboard and account control rendered. |
| Cookie flags | Exactly one access cookie and one access-cookie Set-Cookie entry; HttpOnly, SameSite Lax, path /. Secure absence in dev is not a failure; non-dev HTTPS/Secure behavior was not tested. |
| Lifetime | Positive cookie Max-Age equaled JWT exp minus iat; stored cookie expiry was within two seconds of JWT exp. Claims were decoded only for this in-memory consistency check, not used as an independent signature-verification assertion. |
| CSRF/login | UI-bootstrap XSRF cookie was present and matched the login request header; backend accepted the login. Rejection cases belong to 4C4, not this success-path check. |
| Browser storage | Access cookie not visible via document.cookie; localStorage and sessionStorage were empty in this isolated context. |
| Authenticated reads | me, products and stats returned successful JSON through the proxy with no-store. Identity/role matched; size-one product result was bounded and totalElements was 500. Category counts summed to 500, with finite positive averages and non-negative integer counts. |
| UI/reload | Products table displayed 1–10 of 500; document reload succeeded, me returned 200 with expected identity/role, and the account control/count restored. |
| Logout | Exactly one logout POST returned 204 with access-cookie Max-Age 0; browser access cookie was absent, UI returned to login and a subsequent me returned 401 ProblemDetail. |
| Safety | Zero blocked local requests, WebSocket attempts or page errors. Only approved read paths and the single login/logout were allowed; no product writes or API mocks. External traffic blocked. |

No 429 observed, limiter wait/reset or repeated login. Count 500 was established
through the authenticated API and restored table; this run did not independently
scan all names for pre-existing qa- records, perform CRUD, wait for real token
expiry or test stolen-token revocation. Cookie teardown clears the isolated
browser context; no test database records were created or require cleanup.

Only this ignored detailed record and the pre-approved QA summary changed in
the rerun. Test/source/configuration files and existing worktree changes were
preserved. Whitespace, ignore and editor documentation checks passed. Previous
typecheck/focused-lint results remain the unchanged harness's earlier results;
they were not rerun here. No build, dependency/browser download, backend/Mongo
restart, runtime-log/secret-file access, scanner or Git mutation.

Latest follow-up status: 4C1 PASSED, 4C2 PASSED; 4C3 and 4C4 NOT RUN. H1/H2
remain disposed per user direction with raw historical failures retained.
Next seek separate 4C3 approval for USER login/read access/role-aware UI,
direct create/edit navigation denial and logout, with no product writes or
service operations. The checklist I discussion reminder remains recorded for
the end of 4C; do not define or run it automatically.

Unchanged harness SHA-256:
`6ff261f66b9e54dc509fe5486b3bc7022c59acb752e5b1a120867533fbba5a50`.
