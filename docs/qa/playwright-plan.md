# Playwright QA setup (E1)

## Scope and approval

E1 setup, documentation, npm installation, and the Chromium download were
approved. E2–E9 remain separately gated; creating this harness does not run
those items or authorize live product writes. No services start automatically.

The frontend uses its existing React/TypeScript/Vite setup. Playwright Test
is pinned to 1.65.0 as a development dependency. Production dependencies and
application source are unchanged. The current dev usernames are confirmed in
`DevUserSeeder`: `admin` and `user`. Optional username environment variables
can override what the QA runner submits, but do not change the seeder itself.

## Configuration and files

- [Configuration](../../frontend/playwright.config.ts): Chromium headless,
  `http://localhost:5173`, one worker, no retries, 30-second test timeout,
  four-minute run timeout, stop after the first unexpected failure, and no
  `webServer` auto-start.
- [Fixtures](../../frontend/e2e/support/fixtures.ts): local-only browser HTTP
  and WebSocket routing, service workers blocked, safe teardown, and per-test
  QA product ownership.
- [API helper](../../frontend/e2e/support/qa-api.ts): fixed localhost:8080
  origin, typed product data, private in-memory cookie jar, fresh CSRF tokens
  before writes, ten-second request timeouts, and redirects disabled.
- [Reporter](../../frontend/e2e/support/safe-reporter.ts): only fixed item IDs,
  statuses, durations, and allowlisted reason codes. Raw errors, console
  output, request data, and response headers/bodies are not reported.
- [Offline safety tests](../../frontend/e2e/support/qa-safety.test.ts): verify
  URL restrictions, ownership/baseline guards, and reporter redaction without
  accessing services or real credentials.
- [E2E TypeScript configuration](../../frontend/tsconfig.e2e.json): checks the
  harness independently of the production app build.

Approved browser tests will use `*.e2e.ts` and import `test`/`expect` from
`./support/fixtures`. Vitest retains its normal `*.test.ts` unit-test discovery;
it will not pick up browser tests. Add each E2–E9 file only when that item is
approved. Use static test titles beginning with the item ID, e.g. `E2.login`.

## Credentials and artifacts

- Supply passwords only through `DEV_ADMIN_PASSWORD` and `DEV_USER_PASSWORD`
  inherited by the QA process. Missing passwords block authentication; never
  read `.env` or paste secrets into chat or commands. Optional usernames use
  `DEV_ADMIN_USERNAME` / `DEV_USER_USERNAME`, otherwise `admin` / `user`.
- Cookies and CSRF tokens remain in memory. Do not write storage state, HAR,
  screenshots, videos, traces, snapshots, or attachments; do not log or assert
  against raw credentials, cookies, tokens, or authentication responses.
- Trace, video, and screenshots are off. The installed runner also generates
  failure context by default: `PLAYWRIGHT_NO_COPY_PROMPT=1` disables automatic
  page snapshots, and the fixture replaces raw errors/call logs with safe
  codes before artifact teardown. A remaining error-context file may contain
  only sanitized errors, never page content or credential values.
- Root Git exclusions cover test-results, playwright-report, traces, videos,
  screenshots, and authentication-state artifacts. The QA documentation is
  already ignored by the repository's existing `docs/` rule.
- Use the approved config and reporter; do not enable Playwright debugging,
  recording, UI mode, alternate reporters, raw APIRequestContext, or custom
  browser/request contexts. Those bypass the harness safeguards. Do not
  attach diagnostics or run snapshot assertions containing page content.
- External fonts/resources are blocked before requests are sent; fallback
  fonts may therefore differ. Only the exact localhost frontend/backend
  origins are allowed. No browser downloads occur during test execution.

## Data safety and throttling

Mutating tests must request `qaProducts` before creating any records, including
through the UI. It checks that the initial total is exactly 500, generates a
unique `qa-e<item>-<uuid>` category and name prefix, and allows at most 20
helper-created records per test. Use `qaProducts.input()` as the UI/API data
template. Preserve its category and name prefix even for XSS/error probes.

The browser route guard refuses API writes unless `qaProducts` has verified
the baseline and the payload/target belongs to this exact test scope. UI
PUT/DELETE targets are read and ownership-checked before forwarding. Only
POST login/logout are exempt from the product write guard. Custom route
interception must only fulfill/abort mocked requests or call `route.fallback()`
so real traffic still reaches these safety checks; do not use `route.continue()`
in test-specific interceptors. Create attempts are capped at 20 across UI and
helper requests for each test.

Cleanup runs in a `finally` block, discovers UI-created products by the exact
test category if a test failed before recording an ID, and checks ownership
before each delete. It attempts all known IDs even after a cleanup failure,
then verifies that the total is back to 500. It never deletes arbitrary
`qa-` products belonging to another run. Cleanup failure must stop subsequent
items and be reported; no database reset is authorized. Forced process
termination or an outage can interrupt cleanup, so do not claim recovery
without verifying it.

The ADMIN helper signs in lazily once per worker and retains no state on disk.
UI login cases still consume the real limiter budget. There are no automatic
retries or limiter bypasses. A 429 closes the affected browser context and
reports `QA_RATE_LIMITED`; ask before waiting or restarting anything. Do not
change the production limiter window for E tests without separate approval.

## Commands (from frontend)

Setup validation, without live requests:

```bash
npm run lint
npm run typecheck:e2e
npm test
npm run build
npm run test:e2e -- --list --pass-with-no-tests
```

There are intentionally no E2–E9 browser tests until their item is approved.
The discovery command with no files is not a passing browser test.

After approving an individual item and ensuring apps/credentials are ready:

```bash
npm run test:e2e -- --grep '^E2[. ]'
```

Replace E2 only with the approved item. The user starts the backend and
frontend separately; the harness does not install packages, start apps, stop
Mongo, or wait out a limiter window. If a run needs more than five minutes,
seek approval before increasing its timeout. Reinstalling browser binaries
or packages also requires approval.

## E1 verification (2026-11-06)

- Installed Playwright Test 1.65.0 with scripts/audit disabled during install;
  downloaded Chromium Headless Shell 158.0.8127.18 and its FFmpeg helper into
  the user Playwright cache. No OS packages were installed.
- `npm run lint`, `npm run typecheck:e2e`, and `npm test` passed. There are
  ten unit tests across two files, including seven offline harness safety
  tests; all three pre-existing API tests remain unchanged.
- `npm run build` passed and retained the same CSS/JS asset hashes. Its
  existing ~1 MB JavaScript chunk warning remains; no production application
  source changed.
- A temporary, offline Chromium probe verified external navigation blocking,
  sanitized error artifacts, and a refused product POST with no active
  QA-owned fixture. Two expected failures intentionally exercised redaction
  and the write guard; the probe run passed overall. No request reached an
  application or database. The temporary probe was removed after validation.
- Generated artifacts contained zero occurrences of either synthetic private
  marker and no screenshots, recordings, HARs, or trace archives. Verified
  Git exclusions for the artifact and authentication-state paths.
- Browser execution needed sandbox escalation; npm installation likewise
  needed escalation after sandbox DNS failure. No service was started,
  stopped, or restarted. No .env file was inspected.
- Both password variables were unavailable during setup. Live E2–E9 tests
  have not run and require separate approval, available credentials, and the
  user-managed running apps. Discovery with no browser tests is intentional,
  not evidence that authentication or UI flows pass.
