# Phase 4B — localhost Node serving and mocked Chromium verification

Date: 2026-11-08. Supporting result: **PASSED**, limited to the scope below.
The user approved Phase 4B and confirmed that they had stopped Vite manually.

## Scope and service ownership

- Confirmed that port 5173 had no listener, then started the previously approved
  standalone frontend server from `frontend/` with:

  ```bash
  FRONTEND_API_PROXY_TARGET=http://localhost:8080 FRONTEND_HOST=localhost FRONTEND_PORT=5173 npm start
  ```

- The existing editor tasks start Vite, not this server, so they were not used
  or modified. The agent-started Node server remains running on localhost:5173.
  Vite remains stopped. This path serves the existing production build and does
  not provide source HMR; future frontend source changes need a rebuild and
  this startup-snapshot server needs a restart to load a changed build.
- No backend or Mongo start/stop/restart; no credentials or actual environment
  files accessed; no real authentication or database operations. The configured
  backend target was not exercised: all browser API requests were intercepted
  before dispatch. External requests were aborted before dispatch.
- Only HTTP target used was `http://localhost:5173`. Localhost can resolve to a
  loopback IP internally; no numeric-loopback URL was used as a test target.
- No dependency/browser install, registry request, passive scanner/container,
  screenshot, trace, video, storage-state export, or Git mutation.

## Files and commands

Added only [nonce-csp.e2e.ts](../../frontend/e2e/nonce-csp.e2e.ts) and ignored QA
documentation in this phase. Existing production/source/configuration changes
were preserved. The new test uses the existing capture-disabled, service-worker-
blocked, safe-reporter configuration and guarded fixtures. It does not request
credential-bearing fixtures. All APIs are mocked, unknown/mutating APIs are
aborted and counted, and WebSockets are closed and counted. Mock records are
qa-prefixed, memory-only fixtures, not database records.

Commands from `frontend/`:

```bash
npm run typecheck:e2e
./node_modules/.bin/eslint e2e/nonce-csp.e2e.ts
npm run test:e2e -- e2e/nonce-csp.e2e.ts
```

Also ran a bounded five-second, one-shot readiness GET, Git status,
`git diff --check`, artifact/report ignore checks, editor diagnostics and
read-only source/build SHA-256 checks. Readiness returned 200 HTML, matching
nonce metadata/CSP, no unresolved marker, and `Cache-Control: no-store`.
Header values, nonce values, HTML, cookies and request bodies were not printed.

## Final test evidence

| Case | Result | Evidence |
| --- | --- | --- |
| Response/cache coherence | PASSED | Initial document plus six concurrent/conditional HTML GETs produced seven distinct nonces; each fetched document matched its own CSP. Conditional GETs stayed 200 with fresh HTML, no-store and no validators. HEAD returned 200 without a body. Source/missing asset/reserved actuator paths returned 404. Nosniff, frame deny, no-referrer and absence of server-identifying headers checked. No unsafe-inline/eval/wildcard or Vite client in served HTML/policy. |
| Positive/negative CSP controls | PASSED | Correctly nonced style applied; missing/wrong-nonce styles and parsed style attributes did not. Direct CSSOM property writes worked. DOM-inserted inline script and inline event handler did not execute. Expected style/script element/attribute violation events occurred. |
| MUI menu/dialog transitions | PASSED | Mock ADMIN catalogue rendered; account and category menus opened/closed. Delete dialog opened, initially focused Keep product, trapped forward/backward tab focus, closed on Escape and restored trigger focus. No delete submitted. |
| Product forms/mobile | PASSED | New form rendered and blank submit produced client validation without an API write. Switch state changed. Edit loaded the mock snapshot. Save control remained visible and document did not horizontally overflow at 390x844. No valid submission sent. |
| Charts/tooltip/resize | PASSED | Two mock categories rendered; count-chart tooltip showed the expected label and 4 items. Chart SVG width shrank between desktop 1440x1000 and mobile 390x844, remained visible and did not cause document horizontal overflow. |

Final run: **5 tests PASSED, 0 FAILED**, process exit 0; recorded per-test
durations 476, 511, 1727, 771 and 1122 milliseconds (4.607 seconds aggregate
test time, not process wall time). Existing safe reporter labels non-E test
titles as SETUP; those five result lines map to the cases above in order.

Normal screens had zero observed CSP violations, zero page errors, zero
unexpected API requests and zero WebSocket attempts. Every Emotion style
element on the checked screens carried the document nonce. Intentional
negative-control CSP violations are expected and separate from normal UI checks.
Typecheck, focused normal ESLint, editor diagnostics and whitespace checks
passed. Reports and browser artifact directories are gitignored.

## Earlier attempts and correction

- Sandboxed port inspection, socket startup, readiness connection and browser
  execution were restricted (EPERM/process restrictions). Retried outside the
  sandbox through the tool approval flow; the failed server process exited
  before the successful listener started. No duplicate service was launched.
- First actual browser run: first three cases PASSED; fourth timed out and the
  configured fail-fast runner did not execute the fifth. The new harness used
  checkbox role for a MUI input whose installed implementation sets role switch.
  Changed only those two test locators to switch, preserving the checked-state
  assertion. No production/CSP fix or assertion removal. Full five-case rerun
  then PASSED; final typecheck/lint were also repeated successfully.

## Scope limitations and remaining approval

This is not a full E/F rerun or H2 passive rescan. No actual API forwarding,
authentication, cookies, CSRF, rate limiting, backend errors, product count or
data cleanup was tested. External font downloads were blocked, so successful
remote font fetching was not established. Only the existing cached Chromium
browser was used; cross-browser compatibility, full axe/keyboard coverage,
complete loading/error/empty states and deployment HTTPS/cache-ingress behavior
remain unverified here. Vite HMR is not applicable to the production server and
was not rerun. No production certification is implied.

No strict security-lint/static/passive assessment ran this phase. H1/H2 raw
failures, their exact-scope manual dispositions, H3 PASSED and the primary
42 PASSED / 2 FAILED / 0 BLOCKED / 0 SKIPPED scoreboard are unchanged. Earlier
manual acceptance does not automatically cover this new test source.

Next: seek separate scope approval for real proxy/authentication verification,
broader accessibility/responsive reruns and any passive assessment. Never run
real logins, writes or scanners on the strength of these mock results alone.

## Snapshot hashes (SHA-256)

- Test: `30374e746c7a23c1cbe43ae44d7f103b0a89b677cab2bbb4edf432a820d4f4d7`
- Built HTML: `f0982b93d3f61a181cfa9487afb9772ced02e1f1d2c61b5e1a32f2c3eabf84c1`
- Built JS: `f8803f28ed349cc92105a6b341d966e22face9f53702fb0d11a4501ee849fa67`
