# 4C3 — real USER read access and role-aware UI

Date: 2026-11-08. Status: **PASSED**.

User approval: yes to 4C3 after the successful 4C2 handoff. Scope is one real
USER login, reads, absence of write controls, direct create/edit navigation
denial and logout through the standalone Node proxy, without product writes.

## Preparation and changes

Read project/security/QA rules and relevant router, existing role tests,
capture-disabled Playwright configuration and guarded fixtures. Checked Git
status before changes and preserved earlier edits. Confirmed only the presence
of DEV_USER_PASSWORD; no value printed or actual environment file read. Used
the documented lowercase user account, not an ADMIN credential.

Bounded anonymous readiness GET to `http://localhost:5173/login` confirmed 200,
no-store, no Vite client and matching HTML/CSP nonce. Readiness output contained
only booleans/status, not nonce/header/body values. No service operation.

Added [proxy-user.e2e.ts](../../frontend/e2e/proxy-user.e2e.ts), leaving the
existing E3 role test and all other tests unchanged. New guard permits only
the frontend origin, approved GET API paths and at most one login/logout POST.
No ADMIN/products fixtures, API mocks, direct backend requests or product write
attempts. External traffic blocked and WebSockets closed. Existing safe reporter,
service-worker blocking and disabled trace/video/screenshot settings retained;
debug/protocol logging overrides removed for the run.

## Commands and results

From `frontend/`:

```bash
npm run typecheck:e2e
./node_modules/.bin/eslint e2e/proxy-user.e2e.ts
env -u DEBUG -u PWDEBUG -u NODE_OPTIONS -u NODE_TEST_CONTEXT npm run test:e2e -- e2e/proxy-user.e2e.ts --global-timeout=60000
```

- E2E typecheck: PASSED, exit 0.
- Focused normal ESLint: PASSED, exit 0.
- Editor diagnostics: no errors.
- Chromium browser check: **one test PASSED, zero failures, exit 0**, 2,069 ms
  test duration. Safe reporter labels this non-E title SETUP; no title/error
  grammar or capture control was changed.

## Runtime evidence

| Check | Passing condition |
| --- | --- |
| Authentication | Exactly one real login returned 200; expected user identity and USER role, no ADMIN role; JSON only username/roles. Dashboard loaded under the standalone nonce serving path. |
| Read access | Both category chart regions rendered; authenticated product count was 500. Final me, products and stats reads succeeded with no-store; USER identity retained and stats counts summed to 500. |
| Write controls absent | Waited for a populated 11-row table (header plus ten products) and displayed 1–10 of 500 before checking. No Add/Create/Edit/Delete/Remove button or link even with includeHidden, and no Actions column. |
| Direct create navigation | /products/new document loaded, but authenticated router redirected USER to /products; populated read-only table present and no product editor heading. |
| Direct edit navigation | Used one existing product ID read from the bounded size-one API result, without changing it. Its edit URL redirected USER to /products; populated read-only table and no editor heading. |
| Count stability | Before and after the navigation checks, product totalElements was 500; final stats counts summed to 500. No product write was allowed or attempted. |
| Logout | Exactly one logout returned 204; browser returned to login, access cookie absent and subsequent me returned 401. |
| Safety | Zero blocked local requests, WebSocket attempts or page errors; no 429, login retries or limiter waits. External requests aborted before dispatch. |

No credential, token, cookie value, raw request/response/header or real product
body was printed, attached or saved. The existing ID was used only in memory
for navigation. The test is not an independent data inventory/qa-name scan.
It verifies role-aware frontend navigation/read access, not a fresh backend
USER-write 403 matrix: product POST/PUT/DELETE requests were deliberately not
sent. The historical C1 authorization evidence is separate.

Only the new test and ignored QA records changed. No production code/config,
dependency install/download, build, backend/Mongo/frontend start/stop/restart,
Git mutation, H1/H2 rescan or unrelated checklist execution. Existing worktree
changes preserved. Reports/artifact directories are gitignored; no recordings
or storage-state files. No database cleanup required because no data was written.
Whitespace and ignore checks passed. H1/H2 remain disposed with historical raw
results retained; 4C1/4C2/4C3 PASSED and 4C4 NOT RUN.

Next approval: 4C4 real-proxy CSRF rejection/valid-token success and tampered
access-cookie recovery. Use logout as the state-changing probe, not product
writes; credentials/tokens remain private, and any 429 stops without waiting.
No implementation fix or service change is authorized by completing 4C3.
Keep the checklist I discussion reminder for completion of 4C; do not add I now.

Harness SHA-256:
`4c1d7610c1fb18046370f5f635f985c09b95f5aecf52422982165722d4e08438`.
