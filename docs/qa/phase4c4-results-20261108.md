# 4C4 — CSRF and tampered-cookie recovery

Date: 2026-11-08. Latest status: **PASSED — approved test-only CSRF-bootstrap
correction and rerun**. Earlier failures and diagnostic evidence retained below.

## Scope

User approved up to two ADMIN logins through the standalone frontend, missing/
wrong CSRF logout rejection, valid logout and tampered-access-cookie recovery.
No product writes, service changes, recordings, installations or production fixes.

Read project/QA/security instructions and current resolver/filter/auth test code.
Confirmed ADMIN password presence only; no value or actual environment file
read/printed. Anonymous readiness confirmed localhost:5173 returned 200/no-store,
no Vite client and matching document/CSP nonce. No service operation required.

Added [proxy-csrf-recovery.e2e.ts](../../frontend/e2e/proxy-csrf-recovery.e2e.ts).
Existing tests, shared fixtures, safe reporter and production code unchanged.
Guard allows only localhost:5173, approved GET APIs, at most two login POSTs and
four logout POSTs. All product writes/disallowed local requests are aborted;
external traffic and WebSockets blocked. No API mocks or credential-bearing
adminApi/products fixtures. Cookies/tokens remain in ephemeral worker/browser
memory; no signing-key access or fabricated valid JWT. Tampering changes an
early signature character rather than potentially equivalent final padding bits.

## Executed commands

From `frontend/`:

```bash
npm run typecheck:e2e
./node_modules/.bin/eslint e2e/proxy-csrf-recovery.e2e.ts
env -u DEBUG -u PWDEBUG -u NODE_OPTIONS -u NODE_TEST_CONTEXT npm run test:e2e -- e2e/proxy-csrf-recovery.e2e.ts --global-timeout=60000
```

- Typecheck: PASSED, exit 0.
- Focused normal lint: PASSED, exit 0.
- Editor diagnostics: no errors.
- Browser: one FAILED case, exit 1, 870 ms test duration; safe reason
  QA_CHECK_FAILED, followed by generic runner error, no retries. Non-E title
  appears as SETUP in the existing reporter; this is the intended case.

## Evidence limitation

The current safe reporter/fixture deliberately discard raw assertion values,
errors and call logs. This harness does not retain a safe per-stage/status
summary, so the exact failed assertion and response statuses cannot be recovered
from its permitted output. Do not infer missing-CSRF acceptance, a login defect,
JWT bypass, a specific cookie issue or a passing partial security check from
this generic failure. No production root cause has been established.

The expected complete chain (403 for both invalid CSRF probes, preserved valid
session after rejection, 204 valid logout, 401 tampered-cookie me, 200 bootstrap
and recovered login, then final logout/count checks) is NOT VERIFIED by this
failed run. Actual completed stage/request counts were not retained; no fresh
product count or successful cleanup/logout outcome is asserted. No limiter wait
or reset performed; without stage statuses, a 429 cannot be conclusively
excluded merely from the generic reporter reason. Stop rather than retrying
authentication or waiting for a rate-limit window.

## Proposed next step — approval required

Add test-only diagnostic recording of literal stage IDs, numeric HTTP statuses,
boolean checks and request counts. Retain a sanitized result even when an
assertion fails, without changing the shared reporter, enabling recordings,
printing raw errors/headers/bodies, including private values, removing assertions
or weakening acceptance criteria. Validate its privacy properties before a
separately approved 4C4 rerun. If 429 is observed, stop and report; do not wait.

This diagnoses rather than assumes an application fix. Any later production
correction needs separate evidence, scope approval and documentation approval.
No such enhancement/fix or rerun was applied after this failure.

## Side effects and latest status

Only the approved new test and ignored QA records added. Product writes were
prohibited by the guard; no database fixture/cleanup required. Temporary browser
context disposed with recordings/service workers off. No secret/token/cookie/
request-body/header-value output or storage-state file, actual .env/runtime-log
access, dependency/browser download, rebuild, service restart, scanner or Git
mutation. Existing worktree changes preserved; reports/artifacts gitignored.

4C1/4C2/4C3 remain PASSED, 4C4 FAILED. H1/H2 stay disposed with historical raw
failures retained, not rescanned. Primary A-H scoreboard unchanged; follow-up
4C scoreboard is 3 PASSED / 1 FAILED / 0 BLOCKED / 0 SKIPPED. Do not claim all
4C complete. The requested checklist I discussion reminder remains pending.

Harness SHA-256:
`c4036480928bda685b605214f1a4c0f4918835e87291a964a5f73d147515754d`.

## Approved safe diagnostics and rerun

The user approved adding privacy-safe diagnostics and rerunning 4C4, not a
production fix or a further rerun after a new failure. Added a bounded closed-
schema [helper](../../frontend/e2e/support/4c4-diagnostics.mjs), its
[TypeScript declaration](../../frontend/e2e/support/4c4-diagnostics.d.mts) and
[offline privacy checks](../../frontend/e2e/support/4c4-diagnostics.offline.mjs).
Instrumented only the existing 4C4 test, keeping its assertions, HTTP probes,
two-login/four-logout limits, shared reporter and capture settings unchanged.
An isolated fixture writes only the helper snapshot in a finally block to its
generated, ignored test output path, mode 0600, including on assertion failure.
It never serializes the test/context/error/response objects.

Only allowlisted literal stages/endpoints/check/counter names, booleans and
bounded integer counts/statuses are accepted. No arbitrary error strings,
headers, cookies, tokens, bodies or URLs. HTTP/check arrays capped at 128 each;
snapshot copies cannot inject data back into the collector. A response observer
records allowed endpoint statuses before parsing and observes any 429 before
browser shutdown. Observer/helper status entries may duplicate the same response;
use explicit request counters, not number of HTTP entries, to count attempts.

### Offline verification and commands

From `frontend/`:

```bash
env -u NODE_OPTIONS -u NODE_TEST_CONTEXT node --test e2e/support/4c4-diagnostics.offline.mjs
npm run typecheck:e2e
./node_modules/.bin/eslint e2e/proxy-csrf-recovery.e2e.ts e2e/support/4c4-diagnostics.mjs e2e/support/4c4-diagnostics.offline.mjs
```

Final explicit offline run: **7 PASSED, 0 FAILED**, exit 0. Cases cover schema,
private-string/object/long/control-character rejection without content emission,
numeric bounds, conversion-hook rejection, snapshot isolation, 429 observation
and record limits. Final typecheck, focused lint and editor diagnostics passed.

Initial Node execution of a TypeScript helper failed ERR_NO_TYPESCRIPT because
the local Node build lacks native TypeScript execution. Used JavaScript plus a
declaration instead, without installs or changes to assertions. Sandboxed Node
test runs showed only a file-level result alongside stream restrictions; those
were not counted as seven-case evidence. Approved outside-sandbox offline run
reported all seven cases explicitly. Unit checks used synthetic material only,
no credential environment access/files/network/services.

### Live diagnostic rerun — FAILED

Credential presence and bounded readiness checks passed without printing values.
Executed the same scoped Playwright command once with the diagnostic harness.
**One FAILED test, exit 1, 867 ms**; no retry/wait/service operation followed.

Safe evidence is in
[the generated summary](../../frontend/test-results/proxy-csrf-recovery.e2e.ts-10d27-nd-tampered-cookie-recovery/4c4-safe-summary.json).
That test-results path is ephemeral and can be replaced by future runs; key
evidence is retained here:

| Diagnostic | Recorded value |
| --- | --- |
| Last stage | csrf-missing |
| Body completed | false |
| Rate limited | false |
| Initial login | 200; request count 1 |
| Initial product count | 500; GET succeeded |
| Access cookie present | true |
| Browser-readable XSRF cookie found by helper | false |
| Logout requests sent | 0 |
| Local probe result | status 0, sanitizedProblem false |
| Expected assertion | status 403, sanitizedProblem true |
| Blocked local requests / WebSockets / page errors | 0 / 0 / 0 |

Exact assertion:

```ts
expect(await logoutProbe(page, mode, diagnostics))
  .toEqual({ status: 403, sanitizedProblem: true })
```

The helper returns `{ status: 0, sanitizedProblem: false }` locally if it cannot
find the JS-readable XSRF cookie. **Zero is not an HTTP response. No logout was
sent**, so the failure is not evidence that the server accepted missing CSRF or
returned an incorrect ProblemDetail. Login/access cookie and count succeeded;
wrong-CSRF, valid logout, tampered-token rejection and recovery were not reached.
The diagnostic establishes readable-cookie absence at the probe, not the exact
server event that cleared it or whether any HttpOnly variant exists. No raw
cookie inventory is necessary to identify the harness precondition failure.

### Proposed minimal correction — NOT applied

The helper assumes a readable CSRF cookie survives login/authenticated reads.
The actual frontend [logout flow](../../frontend/src/auth/AuthContext.tsx)
calls getCsrfToken immediately before logout. Align each test logout probe with
that contract: bootstrap GET /api/v1/auth/csrf, assert 200/nonempty matching
cookie/token, then send the same intentionally missing/wrong or correct header.
Keep all 403/204/401, cookie, session, count and recovery assertions; retain
failure if bootstrap fails. Do not treat status 0 as success or weaken controls.
This is a test-only proposal, not an approved backend/security-policy change.
Request approval for the correction, offline checks and another bounded rerun.

Only approved diagnostic test/helper/declaration/offline-test and ignored QA
records/artifact changed. No credentials/token/cookie/body/header values printed
or persisted, actual .env/runtime logs read, signing-key access, product writes,
install/download, build, service restart, scanner or Git mutation. Browser context
disposed; successful server logout was not reached. Product count was observed
500 before failure; no later count is claimed. All other working-tree edits
preserved. H1/H2 remain disposed, historical raw results unchanged; 4C stays
3 PASSED / 1 FAILED. Checklist I milestone remains pending completion of 4C.

Diagnostic snapshot hashes:

- Instrumented test: `d1cdf7f639dc0885aadc8c9e21d6af4bd65685561657897c3399d385239c6789`
- Helper: `8d1a55b0fbb09137089d3abf1ceb1d78bc6fd3d5915baa008ad3424b3f2de045`
- Declaration: `7ed2500741763616639c87278a65d72d93b2cd9eaf1cfff5ac37fafc020a2149`
- Offline tests: `1649ec4a8ac44a0d3f44b74d4d75d2b4a131db8f1090801a70e8d470c0d80265`

## Approved bootstrap correction and successful rerun

The user approved the proposed test-only correction and one rerun. Added only
CSRF bootstrap immediately before each existing logoutProbe call sends its
request: GET csrf with credentials, no redirects and a ten-second timeout;
require 200 and a nonblank returned token matching the JS-readable cookie.
Only status and a matching boolean leave browser memory. Bootstrap failure or
429 fails/stops before the write. All existing missing/wrong/valid-header,
ProblemDetail, session, cookie, tampered-cookie, recovery, count and request-cap
assertions remain intact. No change to application/security behavior, shared
reporter, diagnostic schema, capture controls or service configuration.

### Verification

Repeated the seven offline privacy checks, E2E typecheck and focused ESLint
commands documented above: all PASSED; seven explicit Node cases, zero failures.
Editor diagnostics and whitespace checks passed. Readiness again established
the nonce server (200/no-store/matching nonce/no Vite client) and ADMIN password
presence only. No actual environment-file or secret-value output.

Ran the scoped Playwright command once, max two logins, no retries:
**one test PASSED, zero failures, exit 0, 1,931 ms test duration**. The existing
safe reporter labels this non-E title SETUP; the safe artifact separately
records stage complete, bodyCompleted true and rateLimited false.

| Stage | Observed outcome |
| --- | --- |
| Initial login/baseline | ADMIN login succeeded; product count 500. |
| Missing CSRF header | Bootstrap 200 with matching token/cookie; logout 403 sanitized ProblemDetail; me remained 200 ADMIN and access cookie persisted. |
| Wrong CSRF header | Bootstrap 200 with matching token/cookie, deliberately mismatched header; logout 403 sanitized ProblemDetail; me remained 200 ADMIN and cookie persisted. |
| Correct CSRF | Bootstrap 200/match; logout 204, access cookie absent, subsequent me 401 sanitized ProblemDetail. |
| Tampered cookie | Changed signature of the earlier access cookie in memory; me returned 401 sanitized ProblemDetail. No signing-key access, modified claims or intact-token replay. |
| Recovery bootstrap | CSRF GET succeeded 200 despite the tampered cookie, with matching readable cookie/token. |
| Recovery login | Second ADMIN login returned 200; assertion verified the actual request still contained the tampered access cookie. Server replaced it with a new HttpOnly access cookie; me returned 200 ADMIN. |
| Final baseline/logout | Count again 500; final UI logout bootstrapped CSRF and returned 204; cookie absent and me 401. |

Explicit counters: login requests 2, logout requests 4 (two rejected probes and
two successful logouts), blocked local requests 0, WebSocket attempts 0, page
errors 0. Observer/helper HTTP entries can duplicate a response; they are not
additional requests. No 429 or limiter wait/reset. No product writes or database
fixtures, so no record cleanup required. Browser context disposed after final
successful logout; no tokens/cookies persisted in diagnostic output or storage
state. Generated safe summary is ignored and retained at the link above; key
status evidence is preserved here before future runs replace that artifact.

### Scope and handoff

This closes the approved tampered-cookie recovery scenario, not a test of a
validly signed expired token, stolen-token revocation or HTTPS/non-dev cookie
enforcement. No full A-H rerun, full backend build, raw static/passive rescan,
complete accessibility/responsive rerun or production deployment assessment.
H1/H2 remain disposed per user direction, with historical raw failures visible.

Only the existing 4C4 test and ignored QA records/generated safe artifact changed
this turn. All other source/configuration/tests/worktree changes preserved.
No package/browser download, install, build, actual .env/runtime-log/signing-key
access, backend/Mongo/frontend service operation, Git mutation or unrelated test
execution. Checked report/artifact ignores, whitespace and Git status.

Latest 4C scoreboard: **4 PASSED / 0 FAILED / 0 BLOCKED / 0 SKIPPED**, using
latest outcomes rather than counting historical attempts. Primary historical
A-H remains 42 PASSED / 2 raw FAILED, with H1/H2 disposed, not relabeled PASSED.
No new production fix is proposed by these results.

User-requested milestone reminder is now raised: with 4C complete and H1/H2
left disposed as most recently directed, discuss the proposed QA checklist I.
Confirm its intended coverage/pass criteria before adding or executing it; do
not silently reinterpret disposed H1/H2 as clean scan passes. No I definition,
implementation, tests, commit or other phase is authorized automatically.

Corrected harness SHA-256:
`797f5df08c77d24688fb9c60672da786935a5328ff4a554f572159e3d6085023`.
